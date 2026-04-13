import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const NIBO_ACCOUNTANT_URL = "https://api.nibo.com.br/accountant/api/v1";

async function fetchAllPages(url: string, headers: Record<string, string>, maxPages = 10): Promise<any[]> {
  const allItems: any[] = [];
  let skip = 0;
  const top = 500;
  
  for (let page = 0; page < maxPages; page++) {
    const separator = url.includes("?") ? "&" : "?";
    const pageUrl = `${url}${separator}$top=${top}&$skip=${skip}`;
    const res = await fetch(pageUrl, { headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error [${res.status}] for ${url}: ${body}`);
    }
    const data = await res.json();
    const items = data.items || data.value || (Array.isArray(data) ? data : []);
    allItems.push(...items);
    
    // Check if there are more pages
    const count = data.count ?? data["@odata.count"] ?? items.length;
    if (allItems.length >= count || items.length < top) break;
    skip += top;
  }
  
  return allItems;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const niboApiKey = Deno.env.get("NIBO_API_KEY");
    if (!niboApiKey) {
      throw new Error("NIBO_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const niboUserId = Deno.env.get("NIBO_USER_ID");
    const niboHeaders: Record<string, string> = {
      "X-API-Key": niboApiKey,
      "Accept": "application/json",
    };
    if (niboUserId) {
      niboHeaders["X-User-Id"] = niboUserId;
    }

    // Step 1: Get accounting firm ID
    const firmsRes = await fetch(`${NIBO_ACCOUNTANT_URL}/accountingfirms`, {
      headers: niboHeaders,
    });
    if (!firmsRes.ok) {
      const body = await firmsRes.text();
      throw new Error(`Failed to fetch accounting firms [${firmsRes.status}]: ${body}`);
    }
    const firmsData = await firmsRes.json();
    const firms = firmsData.items || firmsData.value || (Array.isArray(firmsData) ? firmsData : (firmsData.id ? [firmsData] : []));
    if (!firms || firms.length === 0) {
      throw new Error("No accounting firms found in NIBO");
    }
    const accountingFirmId = firms[0].id || firms[0].Id;
    console.log("Accounting firm:", firms[0].name, "ID:", accountingFirmId);

    // Step 2: Fetch customers from NIBO
    const customersUrl = `${NIBO_ACCOUNTANT_URL}/accountingfirms/${accountingFirmId}/customers`;
    const niboCustomers = await fetchAllPages(customersUrl, niboHeaders);
    console.log(`Fetched ${niboCustomers.length} customers from NIBO`);
    if (niboCustomers.length > 0) {
      console.log("Sample customer:", JSON.stringify(niboCustomers[0]).substring(0, 800));
    }

    // Step 3: Get our DB clients
    const { data: dbClients, error: clientsError } = await supabase
      .from("clients")
      .select("cnpj, razao_social");
    if (clientsError) throw new Error(`Failed to fetch clients: ${clientsError.message}`);
    if (!dbClients || dbClients.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No clients in DB to sync", synced: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 4: Build CNPJ lookup from DB clients
    const cnpjMap = new Map<string, string>();
    dbClients.forEach((c: any) => {
      const cleanCnpj = c.cnpj.replace(/\D/g, "");
      cnpjMap.set(cleanCnpj, c.razao_social);
    });

    // Step 5: Match NIBO customers to our DB clients
    const matchedCustomers: { niboId: string; cnpj: string; clientName: string; niboName: string }[] = [];
    for (const cust of niboCustomers) {
      const custCnpj = (cust.documentNumber || cust.document || cust.cnpj || "").replace(/\D/g, "");
      const dbName = cnpjMap.get(custCnpj);
      if (dbName) {
        matchedCustomers.push({
          niboId: cust.id || cust.Id,
          cnpj: custCnpj,
          clientName: dbName,
          niboName: cust.name || cust.tradingName || "",
        });
        console.log(`Matched: NIBO "${cust.name}" <-> DB "${dbName}" (${custCnpj})`);
      }
    }
    console.log(`Matched ${matchedCustomers.length} NIBO customers to DB clients`);

    // Step 6: Try to fetch fileds (reports/protocols) - may return 404 if not in beta
    let filedsAvailable = false;
    let allFileds: any[] = [];
    try {
      const filedsUrl = `${NIBO_ACCOUNTANT_URL}/accountingfirms/${accountingFirmId}/fileds`;
      allFileds = await fetchAllPages(filedsUrl, niboHeaders);
      filedsAvailable = true;
      console.log(`Fetched ${allFileds.length} filed documents from NIBO`);
    } catch (e) {
      console.log("Filed documents endpoint not available (likely beta-only). Using customer data only.");
    }

    // Step 7: Build alerts
    const now = new Date();
    const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
    const currentYear = String(now.getFullYear());
    
    const alertsMap = new Map<string, {
      client_cnpj: string;
      client_name: string;
      month: string;
      year: string;
      document_count: number;
      last_filed_date: string | null;
      nibo_status: string;
    }>();

    if (filedsAvailable && allFileds.length > 0) {
      // Use fileds data for detailed alerts
      for (const filed of allFileds) {
        const custCnpj = (filed.customer?.document || filed.customer?.cnpj || "").replace(/\D/g, "");
        const clientName = cnpjMap.get(custCnpj);
        if (!clientName) continue;

        const accrual = filed.accrual || "";
        let month = "", year = "";
        if (accrual) {
          const date = new Date(accrual);
          if (!isNaN(date.getTime())) {
            month = String(date.getMonth() + 1).padStart(2, "0");
            year = String(date.getFullYear());
          }
        }
        if (!month || !year) continue;

        let status = "pending";
        if (filed.status === 4) status = "received";
        else if (filed.status === 6) status = "active";
        else if (filed.status === 3) status = "not_received";

        const key = `${custCnpj}|${month}|${year}`;
        const existing = alertsMap.get(key);
        const filedDate = filed.filedDate || null;

        if (existing) {
          existing.document_count++;
          if (filedDate && (!existing.last_filed_date || filedDate > existing.last_filed_date)) {
            existing.last_filed_date = filedDate;
          }
        } else {
          alertsMap.set(key, {
            client_cnpj: custCnpj,
            client_name: clientName,
            month, year,
            document_count: 1,
            last_filed_date: filedDate,
            nibo_status: status,
          });
        }
      }
    } else {
      // Fallback: create a sync record for each matched customer for current month
      for (const mc of matchedCustomers) {
        const key = `${mc.cnpj}|${currentMonth}|${currentYear}`;
        alertsMap.set(key, {
          client_cnpj: mc.cnpj,
          client_name: mc.clientName,
          month: currentMonth,
          year: currentYear,
          document_count: 0,
          last_filed_date: null,
          nibo_status: "synced",
        });
      }
    }

    // Step 8: Upsert alerts into DB
    const alertRows = Array.from(alertsMap.values());
    let synced = 0;

    if (alertRows.length > 0) {
      const { error: upsertError } = await supabase
        .from("nibo_document_alerts")
        .upsert(alertRows.map(a => ({
          ...a,
          synced_at: new Date().toISOString(),
        })), { onConflict: "client_cnpj,month,year" });

      if (upsertError) throw new Error(`Failed to upsert alerts: ${upsertError.message}`);
      synced = alertRows.length;
    }

    return new Response(JSON.stringify({
      success: true,
      accounting_firm_id: accountingFirmId,
      accounting_firm_name: firms[0].name,
      nibo_customers: niboCustomers.length,
      matched_clients: matchedCustomers.length,
      fileds_available: filedsAvailable,
      total_fileds: allFileds.length,
      synced,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error syncing NIBO documents:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

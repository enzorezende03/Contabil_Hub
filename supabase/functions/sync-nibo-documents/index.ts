import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const NIBO_ACCOUNTANT_URL = "https://api.nibo.com.br/accountant/api/v1";

// Status mapping from NIBO API docs
const STATUS_MAP: Record<number, string> = {
  1: "excluido",
  2: "cancelado",
  3: "nao_recebido",
  4: "recebido",
  5: "nao_ativo",
  6: "ativo",
  7: "baixa_justificada",
  8: "pago",
};

function getNiboHeaders(apiKey: string, userId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
    Accept: "application/json",
  };
  if (userId) headers["X-User-Id"] = userId;
  return headers;
}

async function fetchAllPages(
  url: string,
  headers: Record<string, string>,
  maxPages = 20
): Promise<any[]> {
  const allItems: any[] = [];
  let skip = 0;
  const top = 100;

  for (let page = 0; page < maxPages; page++) {
    const separator = url.includes("?") ? "&" : "?";
    const pageUrl = `${url}${separator}$top=${top}&$skip=${skip}`;
    const res = await fetch(pageUrl, { headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error [${res.status}] for ${pageUrl}: ${body}`);
    }
    const data = await res.json();
    const items = data.items || data.value || (Array.isArray(data) ? data : []);
    allItems.push(...items);
    if (items.length < top) break;
    skip += top;
  }

  return allItems;
}

async function getAccountingFirmId(headers: Record<string, string>): Promise<{ id: string; name: string }> {
  const res = await fetch(`${NIBO_ACCOUNTANT_URL}/accountingfirms`, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch accounting firms [${res.status}]: ${body}`);
  }
  const data = await res.json();
  const firms = data.items || data.value || (Array.isArray(data) ? data : data.id ? [data] : []);
  if (!firms?.length) throw new Error("No accounting firms found in NIBO");
  return { id: firms[0].id || firms[0].Id, name: firms[0].name };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const niboApiKey = Deno.env.get("NIBO_API_KEY");
    if (!niboApiKey) throw new Error("NIBO_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const niboHeaders = getNiboHeaders(niboApiKey, Deno.env.get("NIBO_USER_ID") || undefined);

    // Step 1: Get accounting firm
    const firm = await getAccountingFirmId(niboHeaders);
    console.log("Accounting firm:", firm.name, "ID:", firm.id);

    const baseUrl = `${NIBO_ACCOUNTANT_URL}/accountingfirms/${firm.id}`;

    // Step 2: Get DB clients for CNPJ matching
    const { data: dbClients, error: clientsError } = await supabase
      .from("clients")
      .select("cnpj, razao_social");
    if (clientsError) throw new Error(`Failed to fetch clients: ${clientsError.message}`);
    if (!dbClients?.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No clients in DB to sync", synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cnpjMap = new Map<string, string>();
    dbClients.forEach((c: any) => cnpjMap.set(c.cnpj.replace(/\D/g, ""), c.razao_social));

    // Step 3: Try /fileds first (Documentos recebidos - may be beta-only)
    let allFileds: any[] = [];
    let filedsAvailable = false;
    try {
      const filedsRes = await fetch(`${baseUrl}/fileds?$top=100&$skip=0`, { headers: niboHeaders });
      if (filedsRes.ok) {
        const filedsData = await filedsRes.json();
        allFileds = filedsData.items || filedsData.value || (Array.isArray(filedsData) ? filedsData : []);
        filedsAvailable = allFileds.length > 0 || filedsRes.status === 200;
        if (allFileds.length >= 100) {
          const more = await fetchAllPages(`${baseUrl}/fileds?$skip=100`, niboHeaders);
          allFileds.push(...more);
        }
        console.log(`Fileds endpoint: ${allFileds.length} documents`);
      } else {
        console.log(`Fileds endpoint not available (status ${filedsRes.status})`);
        await filedsRes.text(); // consume body
      }
    } catch (e) {
      console.log("Fileds endpoint error:", e);
    }

    // Step 4: Fallback to /reports/obligations/complete
    let allReports: any[] = [];
    if (!filedsAvailable || allFileds.length === 0) {
      try {
        allReports = await fetchAllPages(`${baseUrl}/reports/obligations/complete`, niboHeaders);
        console.log(`Reports endpoint: ${allReports.length} reports`);
        if (allReports.length > 0) {
          console.log("Sample report:", JSON.stringify(allReports[0]).substring(0, 800));
        }
      } catch (e) {
        console.log("Reports endpoint error:", e);
      }
    }

    // Step 5: Also fetch customers for matching
    const niboCustomers = await fetchAllPages(`${baseUrl}/customers?$orderby=name`, niboHeaders);
    console.log(`Fetched ${niboCustomers.length} customers from NIBO`);

    // Step 6: Match NIBO customers to DB clients
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
      }
    }
    console.log(`Matched ${matchedCustomers.length} customers`);

    // Step 7: Build alerts from available data
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

    // Use fileds data if available
    const sourceData = allFileds.length > 0 ? allFileds : allReports;

    if (sourceData.length > 0) {
      for (const item of sourceData) {
        const custCnpj = (
          item.customer?.documentNumber || item.customer?.document ||
          item.documentNumber || item.cnpj || ""
        ).replace(/\D/g, "");

        const clientName = cnpjMap.get(custCnpj);
        if (!clientName) continue;

        const accrual = item.accrual || "";
        let month = "", year = "";
        if (accrual) {
          const date = new Date(accrual);
          if (!isNaN(date.getTime())) {
            month = String(date.getMonth() + 1).padStart(2, "0");
            year = String(date.getFullYear());
          }
        }
        if (!month || !year) continue;

        const statusNum = typeof item.status === "number" ? item.status : parseInt(item.status, 10);
        const niboStatus = STATUS_MAP[statusNum] || "pending";
        const filedDate = item.filedDate || null;

        const key = `${custCnpj}|${month}|${year}`;
        const existing = alertsMap.get(key);

        if (existing) {
          existing.document_count++;
          if (filedDate && (!existing.last_filed_date || filedDate > existing.last_filed_date)) {
            existing.last_filed_date = filedDate;
          }
          if (niboStatus === "recebido") existing.nibo_status = "recebido";
        } else {
          alertsMap.set(key, {
            client_cnpj: custCnpj,
            client_name: clientName,
            month, year,
            document_count: 1,
            last_filed_date: filedDate,
            nibo_status: niboStatus,
          });
        }
      }
    } else {
      // Fallback: sync matched customers for current month
      for (const mc of matchedCustomers) {
        alertsMap.set(`${mc.cnpj}|${currentMonth}|${currentYear}`, {
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

    // Step 8: Upsert alerts
    const alertRows = Array.from(alertsMap.values());
    let synced = 0;
    if (alertRows.length > 0) {
      const { error: upsertError } = await supabase
        .from("nibo_document_alerts")
        .upsert(
          alertRows.map((a) => ({ ...a, synced_at: new Date().toISOString() })),
          { onConflict: "client_cnpj,month,year" }
        );
      if (upsertError) throw new Error(`Failed to upsert alerts: ${upsertError.message}`);
      synced = alertRows.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        accounting_firm: firm.name,
        nibo_customers: niboCustomers.length,
        matched_clients: matchedCustomers.length,
        fileds_available: filedsAvailable,
        fileds_count: allFileds.length,
        reports_count: allReports.length,
        synced,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error syncing NIBO documents:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

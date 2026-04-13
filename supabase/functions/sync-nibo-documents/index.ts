import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const NIBO_ACCOUNTANT_URL = "https://api.nibo.com.br/accountant/api/v1";
const NIBO_EMPRESAS_URL = "https://api.nibo.com.br/empresas/v1";

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

    // Step 1: Get accounting firm ID
    // Nibo Obrigações API uses X-API-Key header
    // If token is not linked to a user, X-User-Id is also needed
    const niboUserId = Deno.env.get("NIBO_USER_ID");
    const niboHeaders: Record<string, string> = {
      "X-API-Key": niboApiKey,
      "Accept": "application/json",
    };
    if (niboUserId) {
      niboHeaders["X-User-Id"] = niboUserId;
    }

    const firmsRes = await fetch(`${NIBO_ACCOUNTANT_URL}/accountingfirms`, {
      headers: niboHeaders,
    });

    if (!firmsRes.ok) {
      const body = await firmsRes.text();
      throw new Error(`Failed to fetch accounting firms [${firmsRes.status}]: ${body}`);
    }

    const firmsData = await firmsRes.json();
    console.log("NIBO firms response:", JSON.stringify(firmsData));
    
    // Handle various response formats: { items: [...] }, { value: [...] }, [...], or single object
    const firms = Array.isArray(firmsData) 
      ? firmsData 
      : firmsData.items || firmsData.value || firmsData.data || (firmsData.id ? [firmsData] : []);
    
    if (!firms || firms.length === 0) {
      throw new Error(`No accounting firms found in NIBO. Raw response: ${JSON.stringify(firmsData).substring(0, 500)}`);
    }

    const accountingFirmId = firms[0].id || firms[0].accountingFirmId || firms[0].Id;
    if (!accountingFirmId) {
      throw new Error(`Could not determine accountingFirmId. First firm object: ${JSON.stringify(firms[0]).substring(0, 500)}`);
    }

    // Step 2: Get all clients from our DB to match by CNPJ
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("cnpj, razao_social");

    if (clientsError) throw new Error(`Failed to fetch clients: ${clientsError.message}`);
    if (!clients || clients.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No clients to sync", synced: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Fetch filed documents from NIBO (status 4 = Recebido)
    // Filter by "documentos contábil" department/obligation
    const filedsUrl = `${NIBO_ACCOUNTANT_URL}/accountingfirms/${accountingFirmId}/fileds?$filter=Status eq 4&$top=500`;

    const filedsRes = await fetch(filedsUrl, {
      headers: niboHeaders,
    });

    if (!filedsRes.ok) {
      const body = await filedsRes.text();
      throw new Error(`Failed to fetch filed documents [${filedsRes.status}]: ${body}`);
    }

    const filedsData = await filedsRes.json();
    const fileds = Array.isArray(filedsData) ? filedsData : filedsData.items || filedsData.value || [];

    // Step 4: Build CNPJ lookup from clients
    const cnpjMap = new Map<string, string>();
    clients.forEach((c: any) => {
      const cleanCnpj = c.cnpj.replace(/\D/g, "");
      cnpjMap.set(cleanCnpj, c.razao_social);
    });

    // Step 5: Group filed docs by client CNPJ + month/year (accrual)
    const alertsMap = new Map<string, {
      client_cnpj: string;
      client_name: string;
      month: string;
      year: string;
      document_count: number;
      last_filed_date: string | null;
      nibo_status: string;
    }>();

    for (const filed of fileds) {
      // Try to match customer CNPJ
      const customerCnpj = (filed.customer?.cnpj || filed.customer?.document || "").replace(/\D/g, "");
      const clientName = cnpjMap.get(customerCnpj);
      if (!clientName) continue; // Skip if not our client

      // Parse accrual (competência) - format varies: "2025-03" or "2025-03-01T00:00:00"
      const accrual = filed.accrual || "";
      let month = "";
      let year = "";

      if (accrual) {
        const date = new Date(accrual);
        if (!isNaN(date.getTime())) {
          month = String(date.getMonth() + 1).padStart(2, "0");
          year = String(date.getFullYear());
        }
      }

      if (!month || !year) continue;

      const key = `${customerCnpj}|${month}|${year}`;
      const existing = alertsMap.get(key);

      const filedDate = filed.filedDate || filed.createdDate || null;

      if (existing) {
        existing.document_count++;
        if (filedDate && (!existing.last_filed_date || filedDate > existing.last_filed_date)) {
          existing.last_filed_date = filedDate;
        }
      } else {
        alertsMap.set(key, {
          client_cnpj: customerCnpj,
          client_name: clientName,
          month,
          year,
          document_count: 1,
          last_filed_date: filedDate,
          nibo_status: "received",
        });
      }
    }

    // Step 6: Upsert alerts into DB
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
      total_filed_docs: fileds.length,
      matched_clients: synced,
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

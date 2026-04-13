import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const NIBO_ACCOUNTANT_URL = "https://api.nibo.com.br/accountant/api/v1";

async function fetchAllPages(
  url: string,
  headers: Record<string, string>,
  orderBy = "name",
  maxPages = 20
): Promise<any[]> {
  const allItems: any[] = [];
  let skip = 0;
  const top = 100;

  for (let page = 0; page < maxPages; page++) {
    const separator = url.includes("?") ? "&" : "?";
    const pageUrl = `${url}${separator}$top=${top}&$skip=${skip}&$orderby=${orderBy}`;
    const res = await fetch(pageUrl, { headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error [${res.status}] for ${pageUrl}: ${body}`);
    }
    const data = await res.json();
    const items = data.items || data.value || (Array.isArray(data) ? data : []);
    allItems.push(...items);

    console.log(`Page ${page + 1}: fetched ${items.length} items (total: ${allItems.length})`);
    if (items.length < top) break;
    skip += top;
  }

  return allItems;
}

function getNiboHeaders(apiKey: string, userId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
    Accept: "application/json",
  };
  if (userId) headers["X-User-Id"] = userId;
  return headers;
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

    // Step 3: Fetch "Documentos recebidos" via reports/obligations/complete
    const reportsUrl = `${NIBO_ACCOUNTANT_URL}/accountingfirms/${firm.id}/reports/obligations/complete`;
    console.log("Fetching reports from:", reportsUrl);

    let allReports: any[] = [];
    try {
      allReports = await fetchAllPages(reportsUrl, niboHeaders, "filedDate desc");
      console.log(`Fetched ${allReports.length} obligation reports from NIBO`);
      if (allReports.length > 0) {
        console.log("Sample report:", JSON.stringify(allReports[0]).substring(0, 1000));
      }
    } catch (e) {
      console.error("Failed to fetch reports:", e);
      throw new Error(`Reports endpoint error: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Step 4: Process reports into alerts, matching by CNPJ
    const alertsMap = new Map<string, {
      client_cnpj: string;
      client_name: string;
      month: string;
      year: string;
      document_count: number;
      last_filed_date: string | null;
      nibo_status: string;
    }>();

    let matchedCount = 0;

    for (const report of allReports) {
      // Extract CNPJ from customer nested object or top-level
      const custCnpj = (
        report.customer?.documentNumber ||
        report.customer?.document ||
        report.customer?.cnpj ||
        report.documentNumber ||
        report.cnpj ||
        ""
      ).replace(/\D/g, "");

      const clientName = cnpjMap.get(custCnpj);
      if (!clientName) continue;
      matchedCount++;

      // Extract competência (accrual date)
      const accrual = report.accrual || "";
      let month = "", year = "";
      if (accrual) {
        const date = new Date(accrual);
        if (!isNaN(date.getTime())) {
          month = String(date.getMonth() + 1).padStart(2, "0");
          year = String(date.getFullYear());
        }
      }
      if (!month || !year) continue;

      const statusNum = typeof report.status === "number" ? report.status : parseInt(report.status, 10);
      const niboStatus = STATUS_MAP[statusNum] || "pending";
      const filedDate = report.filedDate || null;

      const key = `${custCnpj}|${month}|${year}`;
      const existing = alertsMap.get(key);

      if (existing) {
        existing.document_count++;
        if (filedDate && (!existing.last_filed_date || filedDate > existing.last_filed_date)) {
          existing.last_filed_date = filedDate;
        }
        // Keep most relevant status (recebido > others)
        if (niboStatus === "recebido") existing.nibo_status = "recebido";
      } else {
        alertsMap.set(key, {
          client_cnpj: custCnpj,
          client_name: clientName,
          month,
          year,
          document_count: 1,
          last_filed_date: filedDate,
          nibo_status: niboStatus,
        });
      }
    }

    console.log(`Matched ${matchedCount} reports to DB clients, ${alertsMap.size} unique periods`);

    // Step 5: Upsert alerts into DB
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
        accounting_firm_id: firm.id,
        accounting_firm_name: firm.name,
        total_reports: allReports.length,
        matched_reports: matchedCount,
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

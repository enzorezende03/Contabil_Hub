import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const NIBO_ACCOUNTANT_URL = "https://api.nibo.com.br/accountant/api/v1";

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
    const firms = Array.isArray(firmsData) 
      ? firmsData 
      : firmsData.items || firmsData.value || firmsData.data || (firmsData.id ? [firmsData] : []);
    if (!firms || firms.length === 0) {
      throw new Error("No accounting firms found in NIBO");
    }
    const accountingFirmId = firms[0].id || firms[0].Id;
    console.log("Accounting firm:", firms[0].name, "ID:", accountingFirmId);

    // Step 2: Get all obligation groups
    const groupsRes = await fetch(
      `${NIBO_ACCOUNTANT_URL}/accountingfirms/${accountingFirmId}/obligationgroups?$top=500`,
      { headers: niboHeaders }
    );
    if (!groupsRes.ok) {
      const body = await groupsRes.text();
      throw new Error(`Failed to fetch obligation groups [${groupsRes.status}]: ${body}`);
    }
    const groupsData = await groupsRes.json();
    const groups = groupsData.items || groupsData.value || (Array.isArray(groupsData) ? groupsData : []);
    console.log(`Found ${groups.length} obligation groups`);

    // Step 3: For each group, fetch obligations
    const allObligations: any[] = [];
    for (const group of groups) {
      const groupId = group.id || group.Id;
      const oblRes = await fetch(
        `${NIBO_ACCOUNTANT_URL}/accountingfirms/${accountingFirmId}/obligationgroups/${groupId}/obligations?$top=500`,
        { headers: niboHeaders }
      );
      if (!oblRes.ok) {
        console.warn(`Failed to fetch obligations for group ${group.name} [${oblRes.status}]`);
        continue;
      }
      const oblData = await oblRes.json();
      const obligations = oblData.items || oblData.value || (Array.isArray(oblData) ? oblData : []);
      console.log(`Group "${group.name}": ${obligations.length} obligations`);
      for (const obl of obligations) {
        allObligations.push({ ...obl, groupName: group.name, groupId });
      }
    }

    console.log(`Total obligations fetched: ${allObligations.length}`);
    if (allObligations.length > 0) {
      console.log("Sample obligation:", JSON.stringify(allObligations[0]).substring(0, 800));
    }

    // Step 4: Get clients from DB for matching
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("cnpj, razao_social");
    if (clientsError) throw new Error(`Failed to fetch clients: ${clientsError.message}`);

    const cnpjMap = new Map<string, string>();
    (clients || []).forEach((c: any) => {
      const cleanCnpj = c.cnpj.replace(/\D/g, "");
      cnpjMap.set(cleanCnpj, c.razao_social);
    });

    // Step 5: Match obligations to our clients and build alerts
    const alertsMap = new Map<string, {
      client_cnpj: string;
      client_name: string;
      month: string;
      year: string;
      document_count: number;
      last_filed_date: string | null;
      nibo_status: string;
    }>();

    for (const obl of allObligations) {
      // Try to match by customer/client CNPJ
      const customerCnpj = (
        obl.customer?.cnpj || obl.customer?.document || 
        obl.client?.cnpj || obl.client?.document || ""
      ).replace(/\D/g, "");
      
      const clientName = cnpjMap.get(customerCnpj);
      if (!clientName) continue;

      // Parse accrual/competência
      const accrual = obl.accrual || obl.competence || obl.dueDate || "";
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

      // Map NIBO status
      let status = "pending";
      const oblStatus = obl.status;
      if (oblStatus === 4 || oblStatus === "Recebido") status = "received";
      else if (oblStatus === 6 || oblStatus === "Ativo") status = "active";
      else if (oblStatus === 3 || oblStatus === "Não Recebido") status = "not_received";

      const key = `${customerCnpj}|${month}|${year}`;
      const existing = alertsMap.get(key);
      const filedDate = obl.filedDate || obl.createdDate || null;

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
          nibo_status: status,
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
      total_groups: groups.length,
      total_obligations: allObligations.length,
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

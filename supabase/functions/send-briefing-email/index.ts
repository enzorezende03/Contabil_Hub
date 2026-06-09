// Painel Gerencial — send-briefing-email
// Called when liderança clicks "Aprovar e enviar" on /controle-gerencial/briefing/:isoWeek.
// Generates a signed URL for the PPTX (anexo via link assinado, conforme plano),
// envia para cada destinatário em settings.painel_gerencial_recipients via
// send-transactional-email (template 'briefing-semanal') e marca o draft como 'enviado'.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User client to validate token + permission
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    // Permission check
    const { data: hasPerm } = await userClient.rpc("has_action_permission", {
      _user_id: userId,
      _action: "revisar_briefing_semanal",
    });
    if (!hasPerm) return json({ error: "Sem permissão para revisar/enviar briefing" }, 403);

    const body = await req.json().catch(() => ({}));
    const isoWeek = body?.iso_week as string | undefined;
    if (!isoWeek) return json({ error: "iso_week é obrigatório" }, 400);

    // Service client for storage + updates
    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

    // Load draft
    const { data: draft, error: dErr } = await admin
      .from("briefing_drafts")
      .select("*")
      .eq("iso_week", isoWeek)
      .maybeSingle();
    if (dErr) throw dErr;
    if (!draft) return json({ error: "Briefing não encontrado" }, 404);
    if (draft.status === "enviado") return json({ error: "Briefing já foi enviado" }, 400);
    if (!draft.pptx_storage_path) return json({ error: "Briefing sem PPTX. Regere antes de enviar." }, 400);

    // Recipients
    const { data: rcpRow } = await admin
      .from("settings")
      .select("value")
      .eq("key", "painel_gerencial_recipients")
      .maybeSingle();
    const recipients: string[] = Array.isArray(rcpRow?.value) ? rcpRow!.value : [];
    if (recipients.length === 0) {
      return json({ error: "Nenhum destinatário configurado. Defina painel_gerencial_recipients em /controle-gerencial/briefings." }, 400);
    }

    // Signed URL valid for 7 days
    const { data: signed, error: sErr } = await admin.storage
      .from("briefing-pptx")
      .createSignedUrl(draft.pptx_storage_path, 60 * 60 * 24 * 7);
    if (sErr) throw sErr;
    const pptxUrl = signed?.signedUrl;
    if (!pptxUrl) return json({ error: "Falha ao gerar link do PPTX" }, 500);

    // Send one email per recipient via Lovable transactional-email infra.
    // NOTE: requer email_domain verificado + setup_email_infra + scaffold_transactional_email
    // + template 'briefing-semanal' registrado. Enquanto isso, a chamada abaixo falhará com
    // 404 e o briefing NÃO será marcado como enviado.
    const sendResults: { email: string; ok: boolean; error?: string }[] = [];
    for (const email of recipients) {
      try {
        const { error: sendErr } = await admin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "briefing-semanal",
            recipientEmail: email,
            replyTo: "danielle.campos@2mgrupo.com.br",
            idempotencyKey: `briefing-${isoWeek}-${email}`,
            templateData: {
              isoWeek,
              dataReferencia: draft.data_referencia,
              summary: draft.custom_summary || draft.auto_summary || "",
              alerts: draft.custom_alerts || [],
              focus: draft.custom_focus || [],
              pptxUrl,
              senderName: "Danielle Campos — 2M Grupo",
              replyTo: "danielle.campos@2mgrupo.com.br",
            },
          },
        });
        if (sendErr) throw sendErr;
        sendResults.push({ email, ok: true });
      } catch (err) {
        sendResults.push({ email, ok: false, error: (err as Error).message });
      }
    }

    const anyOk = sendResults.some((r) => r.ok);
    if (!anyOk) {
      return json({
        error: "Nenhum e-mail foi enviado. Verifique se a infraestrutura de e-mail está configurada.",
        results: sendResults,
      }, 502);
    }

    // Mark as sent
    const { error: uErr } = await admin
      .from("briefing_drafts")
      .update({
        status: "enviado",
        sent_at: new Date().toISOString(),
        sent_by: userId,
        recipients_snapshot: recipients,
      })
      .eq("id", draft.id);
    if (uErr) throw uErr;

    return json({ ok: true, sent: sendResults.filter((r) => r.ok).length, results: sendResults });
  } catch (err) {
    console.error("[send-briefing-email]", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

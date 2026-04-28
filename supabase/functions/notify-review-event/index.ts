// Edge function: notify-review-event
// Envia e-mails transacionais para eventos do fluxo de revisão de demonstrativos.
// Eventos suportados:
//   - "submitted"  → revisores recebem aviso de nova submissão
//   - "returned"   → submitter recebe aviso de devolução com apontamentos
//   - "approved"   → submitter recebe aviso de aprovação final
//
// Integração com Lovable Email (Resend). Se RESEND_API_KEY não estiver configurada,
// a função apenas registra o evento e retorna sucesso (no-op gracioso).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "@supabase/supabase-js/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const BodySchema = z.object({
  event: z.enum(["submitted", "returned", "approved"]),
  submission_id: z.string().uuid(),
});

const FROM = Deno.env.get("REVIEW_EMAIL_FROM") || "Contábil Hub <noreply@updates.contabilhub.app>";
const APP_URL = Deno.env.get("APP_URL") || "https://contabilhub.lovable.app";

async function sendEmail(to: string[], subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.log("[notify-review-event] RESEND_API_KEY ausente — pulando envio.", { to, subject });
    return { skipped: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[notify-review-event] resend error", res.status, text);
    return { error: text, status: res.status };
  }
  return await res.json();
}

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f6f7f9;padding:24px;color:#1a1a1a">
  <table style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
    <tr><td style="padding:20px 24px;background:#3D5A80;color:#fff;font-weight:600;font-size:16px">Contábil Hub — ${title}</td></tr>
    <tr><td style="padding:24px;font-size:14px;line-height:1.55">${body}</td></tr>
    <tr><td style="padding:14px 24px;background:#f8fafc;font-size:11px;color:#64748b">Este é um e-mail automático do fluxo de revisão de demonstrativos. <a href="${APP_URL}/revisao" style="color:#3D5A80">Abrir revisão</a></td></tr>
  </table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { event, submission_id } = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Carrega submissão + cliente + apontamentos
    const { data: sub } = await admin
      .from("review_submissions")
      .select("*")
      .eq("id", submission_id)
      .single();
    if (!sub) {
      return new Response(JSON.stringify({ error: "submission not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: client } = await admin.from("clients").select("razao_social, tributacao").eq("id", sub.client_id).single();
    const competencia = String(sub.competencia).slice(0, 7).split("-").reverse().join("/");

    // Resolver e-mails
    let toEmails: string[] = [];
    let subject = "";
    let body = "";

    if (event === "submitted") {
      // Notifica reviewers (perfil coordenacao por padrão; usa action_permissions.revisar_demonstrativos se houver)
      const { data: settings } = await admin.from("settings").select("value").eq("key", "action_permissions").maybeSingle();
      const allowedRoles: string[] = (settings?.value as any)?.revisar_demonstrativos || ["coordenacao"];
      const { data: profs } = await admin.from("profiles").select("user_id, display_name, role").in("role", allowedRoles);
      const userIds = (profs || []).map((p) => p.user_id);
      if (userIds.length > 0) {
        const { data: usersResp } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const allUsers = usersResp?.users || [];
        toEmails = allUsers
          .filter((u: any) => userIds.includes(u.id) && u.email)
          .map((u: any) => u.email as string);
      }
      subject = `Nova revisão pendente — ${client?.razao_social || ""} ${competencia}`;
      body = `<p>Foi liberada uma nova submissão para revisão técnica.</p>
<ul>
  <li><strong>Cliente:</strong> ${client?.razao_social || "—"}</li>
  <li><strong>Competência:</strong> ${competencia}</li>
  <li><strong>Submissão:</strong> #${sub.cycle_number}</li>
</ul>
<p><a href="${APP_URL}/revisao" style="display:inline-block;background:#3D5A80;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">Abrir caixa de revisão</a></p>`;
    } else if (event === "returned" || event === "approved") {
      const { data: usersResp } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const owner = (usersResp?.users || []).find((u: any) => u.id === sub.submitted_by);
      if (owner?.email) toEmails = [owner.email];

      if (event === "returned") {
        const { data: apts } = await admin
          .from("review_apontamentos")
          .select("descricao, conta_referencia")
          .eq("submission_id", submission_id)
          .eq("resolved", false)
          .limit(20);
        const list = (apts || []).map((a: any) =>
          `<li>${a.conta_referencia ? `<code style="background:#f1f5f9;padding:1px 4px;border-radius:3px">${a.conta_referencia}</code> ` : ""}${a.descricao}</li>`
        ).join("");
        subject = `Devolução de revisão — ${client?.razao_social || ""} ${competencia}`;
        body = `<p>A submissão de revisão foi devolvida com apontamentos.</p>
<ul>
  <li><strong>Cliente:</strong> ${client?.razao_social || "—"}</li>
  <li><strong>Competência:</strong> ${competencia}</li>
</ul>
${sub.review_summary ? `<p><strong>Resumo:</strong><br>${String(sub.review_summary).replace(/\n/g, "<br>")}</p>` : ""}
${list ? `<p><strong>Apontamentos:</strong></p><ul>${list}</ul>` : ""}
<p><a href="${APP_URL}/revisao" style="display:inline-block;background:#3D5A80;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">Abrir devolução</a></p>`;
      } else {
        subject = `Revisão aprovada — ${client?.razao_social || ""} ${competencia}`;
        body = `<p>A revisão da competência <strong>${competencia}</strong> de <strong>${client?.razao_social || ""}</strong> foi <strong style="color:#16a34a">aprovada</strong>.</p>
<p>Todas as etapas do fechamento desta competência foram marcadas como concluídas.</p>
<p><a href="${APP_URL}/competencias" style="display:inline-block;background:#3D5A80;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">Ver competência</a></p>`;
      }
    }

    if (toEmails.length === 0) {
      console.log("[notify-review-event] sem destinatários", { event, submission_id });
      return new Response(JSON.stringify({ ok: true, skipped: "no_recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await sendEmail(toEmails, subject, layout(subject, body));
    return new Response(JSON.stringify({ ok: true, recipients: toEmails.length, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[notify-review-event] error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

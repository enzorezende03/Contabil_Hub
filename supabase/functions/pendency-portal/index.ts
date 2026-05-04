// Public portal for clients to respond to pendencies (no auth, token+code based)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function authorize(token: string, code: string) {
  const { data: t, error } = await supabase
    .from("pendency_access_tokens")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error || !t) return { ok: false as const, error: "Link inválido" };
  if (t.revoked) return { ok: false as const, error: "Link revogado" };
  if (new Date(t.expires_at) < new Date())
    return { ok: false as const, error: "Link expirado" };
  const codeHash = await sha256(code);
  if (codeHash !== t.access_code_hash)
    return { ok: false as const, error: "Código de acesso incorreto" };
  return { ok: true as const, pendencyId: t.pendency_id, tokenRow: t };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "load";
    const body = await req.json().catch(() => ({}));
    const { token, code } = body;
    if (!token || !code)
      return json({ error: "Token e código são obrigatórios" }, 400);

    const auth = await authorize(token, code);
    if (!auth.ok) return json({ error: auth.error }, 401);
    const pendencyId = auth.pendencyId;

    // Update access tracking
    await supabase
      .from("pendency_access_tokens")
      .update({
        last_accessed_at: new Date().toISOString(),
        access_count: (auth.tokenRow.access_count || 0) + 1,
      })
      .eq("id", auth.tokenRow.id);

    if (action === "load") {
      const [{ data: pendency }, { data: items }, { data: responses }, { data: comments }] =
        await Promise.all([
          supabase.from("pendencies").select("id, descricao, prazo_resposta, status, prioridade, competencia, client_id").eq("id", pendencyId).maybeSingle(),
          supabase.from("pendency_items").select("*").eq("pendency_id", pendencyId).order("ordem"),
          supabase.from("pendency_item_responses").select("*").eq("pendency_id", pendencyId).order("created_at"),
          supabase.from("pendency_item_comments").select("*").eq("pendency_id", pendencyId).order("created_at"),
        ]);
      let clientName: string | null = null;
      if (pendency?.client_id) {
        const { data: c } = await supabase.from("clients").select("razao_social").eq("id", pendency.client_id).maybeSingle();
        clientName = c?.razao_social ?? null;
      }
      return json({ pendency, clientName, items, responses, comments });
    }

    if (action === "respond") {
      const { itemId, texto, arquivo_path, arquivo_nome, arquivo_tamanho, sender_nome } = body;
      if (!itemId) return json({ error: "itemId obrigatório" }, 400);
      const tipo = arquivo_path ? "arquivo" : "texto";
      if (tipo === "texto" && (!texto || !texto.trim()))
        return json({ error: "Resposta vazia" }, 400);

      const { error: insErr } = await supabase.from("pendency_item_responses").insert({
        item_id: itemId,
        pendency_id: pendencyId,
        tipo,
        texto: texto || null,
        arquivo_path: arquivo_path || null,
        arquivo_nome: arquivo_nome || null,
        arquivo_tamanho: arquivo_tamanho || null,
        sender_user_id: null,
        sender_nome: sender_nome || "Cliente",
      });
      if (insErr) return json({ error: insErr.message }, 500);

      // Auto-marca o item como entregue ao receber qualquer resposta
      await supabase
        .from("pendency_items")
        .update({ status: "entregue", resolved_at: new Date().toISOString() })
        .eq("id", itemId)
        .eq("pendency_id", pendencyId);

      // Atualiza último contato na pendência
      await supabase
        .from("pendencies")
        .update({ ultimo_contato_em: new Date().toISOString() })
        .eq("id", pendencyId);

      return json({ ok: true });
    }

    if (action === "submit") {
      // Cliente envia o que está pronto para a contabilidade.
      // Conta itens entregues vs total: se todos entregues, marca pendência como resolvida; senão, aguardando_resposta.
      const { data: itemsList } = await supabase
        .from("pendency_items")
        .select("status")
        .eq("pendency_id", pendencyId);
      const total = itemsList?.length ?? 0;
      const entregues = (itemsList || []).filter((i: any) => i.status === "entregue").length;
      const allDone = total > 0 && entregues === total;

      const { data: pend } = await supabase
        .from("pendencies")
        .select("client_submit_count")
        .eq("id", pendencyId)
        .maybeSingle();

      await supabase
        .from("pendencies")
        .update({
          status: allDone ? "resolvida" : "aguardando_resposta",
          last_client_submit_at: new Date().toISOString(),
          client_submit_count: ((pend?.client_submit_count as number) || 0) + 1,
          ultimo_contato_em: new Date().toISOString(),
          resolved_at: allDone ? new Date().toISOString() : null,
        })
        .eq("id", pendencyId);

      return json({ ok: true, allDone, entregues, total });
    }

    if (action === "mark") {
      const { itemId, status } = body;
      if (!itemId || !["pendente", "entregue"].includes(status))
        return json({ error: "Parâmetros inválidos" }, 400);
      const { error: upErr } = await supabase
        .from("pendency_items")
        .update({
          status,
          resolved_at: status === "entregue" ? new Date().toISOString() : null,
        })
        .eq("id", itemId)
        .eq("pendency_id", pendencyId);
      if (upErr) return json({ error: upErr.message }, 500);
      return json({ ok: true });
    }

    if (action === "comment") {
      const { itemId, texto, sender_nome } = body;
      if (!itemId || !texto?.trim())
        return json({ error: "Comentário vazio" }, 400);
      const { error: cErr } = await supabase.from("pendency_item_comments").insert({
        item_id: itemId,
        pendency_id: pendencyId,
        texto,
        sender_user_id: null,
        sender_nome: sender_nome || "Cliente",
      });
      if (cErr) return json({ error: cErr.message }, 500);
      return json({ ok: true });
    }

    if (action === "upload-url") {
      const { itemId, fileName, contentType } = body;
      if (!itemId || !fileName)
        return json({ error: "Parâmetros inválidos" }, 400);
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${pendencyId}/${itemId}/${Date.now()}_${safeName}`;
      const { data, error: uErr } = await supabase.storage
        .from("pendency-attachments")
        .createSignedUploadUrl(path);
      if (uErr) return json({ error: uErr.message }, 500);
      return json({ path, signedUrl: data.signedUrl, token: data.token });
    }

    return json({ error: "Ação desconhecida" }, 400);
  } catch (e: any) {
    return json({ error: e?.message || "Erro" }, 500);
  }
});

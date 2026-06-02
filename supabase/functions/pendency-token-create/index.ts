// Generate or rotate access token + code for a pendency. Returns plaintext code only at creation.
// Authorization: requires authenticated user with admin role OR 'gerenciar_pendencias' /
// 'supervisionar_pendencias' permission. Also verifies the pendency exists and is visible
// to the calling user (via RLS) before any service-role mutation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(len = 24) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32);
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => alphabet[b % alphabet.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Não autorizado" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  // 1) Identify caller
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (userErr || !userId) return json({ error: "Sessão inválida" }, 401);

  try {
    const { pendencyId, expiresInDays = 30 } = await req.json().catch(() => ({}));
    if (!pendencyId || typeof pendencyId !== "string") {
      return json({ error: "pendencyId obrigatório" }, 400);
    }
    const days = Math.max(1, Math.min(180, Number(expiresInDays) || 30));

    // 2) Permission gate (matches RLS INSERT policy on pendency_access_tokens)
    const [{ data: isAdmin }, { data: canManage }, { data: canSupervise }] = await Promise.all([
      admin.rpc("has_role", { _user_id: userId, _role: "admin" }),
      admin.rpc("has_action_permission", { _user_id: userId, _action: "gerenciar_pendencias" }),
      admin.rpc("has_action_permission", { _user_id: userId, _action: "supervisionar_pendencias" }),
    ]);
    if (!isAdmin && !canManage && !canSupervise) {
      return json({ error: "Permissão insuficiente para gerar tokens de portal." }, 403);
    }

    // 3) Tenant/scope check: confirm caller can SEE the pendency via RLS
    //    (uses userClient on purpose — service-role would bypass scope).
    const { data: pendencyVisible, error: visErr } = await userClient
      .from("pendencies")
      .select("id")
      .eq("id", pendencyId)
      .maybeSingle();
    if (visErr) return json({ error: visErr.message }, 500);
    if (!pendencyVisible) {
      return json({ error: "Pendência não encontrada ou fora do seu escopo." }, 404);
    }

    const code = randomCode();
    const codeHash = await sha256(code);
    const expires = new Date(Date.now() + days * 86400000).toISOString();

    // 4) Mutation (admin client, after authz)
    const { data: existing } = await admin
      .from("pendency_access_tokens")
      .select("id, token, revoked")
      .eq("pendency_id", pendencyId)
      .maybeSingle();

    let token: string;

    if (existing && !existing.revoked) {
      token = existing.token;
      const { error } = await admin
        .from("pendency_access_tokens")
        .update({ access_code_hash: codeHash, expires_at: expires, revoked: false })
        .eq("id", existing.id);
      if (error) return json({ error: error.message }, 500);
    } else {
      token = randomToken();
      const { error } = await admin
        .from("pendency_access_tokens")
        .upsert(
          {
            pendency_id: pendencyId,
            token,
            access_code_hash: codeHash,
            expires_at: expires,
            revoked: false,
            created_by: userId,
            access_count: 0,
            last_accessed_at: null,
          },
          { onConflict: "pendency_id" },
        );
      if (error) return json({ error: error.message }, 500);
    }

    return json({ token, code, expires_at: expires });
  } catch (e: any) {
    return json({ error: e?.message || "Erro" }, 500);
  }
});

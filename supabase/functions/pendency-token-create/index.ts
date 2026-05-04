// Generate or rotate access token + code for a pendency. Returns plaintext code only at creation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
  // 6 letras/números legíveis (sem 0/O/I/1)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => alphabet[b % alphabet.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader)
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId)
    return new Response(JSON.stringify({ error: "Sessão inválida" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { pendencyId, expiresInDays = 30 } = await req.json();
    if (!pendencyId)
      return new Response(JSON.stringify({ error: "pendencyId obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const code = randomCode();
    const codeHash = await sha256(code);
    const expires = new Date(Date.now() + expiresInDays * 86400000).toISOString();

    // Verifica se já existe um token ativo para esta pendência
    const { data: existing } = await supabase
      .from("pendency_access_tokens")
      .select("id, token, revoked")
      .eq("pendency_id", pendencyId)
      .maybeSingle();

    let token: string;

    if (existing && !existing.revoked) {
      // MANTÉM o token (link) existente, apenas rotaciona o código de acesso e renova o prazo
      token = existing.token;
      const { error } = await supabase
        .from("pendency_access_tokens")
        .update({
          access_code_hash: codeHash,
          expires_at: expires,
          revoked: false,
        })
        .eq("id", existing.id);
      if (error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } else {
      // Cria novo token (primeira geração ou após revogação)
      token = randomToken();
      const { error } = await supabase
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
      if (error)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ token, code, expires_at: expires }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

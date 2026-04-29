// Edge function: cria tarefa no GClick para uma pendência interna.
// Roteia para a instância correta (2M Contabilidade ou 2M Saúde) com base em client.unidade.
// Auth: OAuth2 client_credentials (client_id + client_secret -> access_token).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ReqBody {
  pendency_id: string;
}

interface UnidadeConfig {
  url: string;
  clientId: string;
  clientSecret: string;
  label: string;
}

function getUnidadeConfig(unidade: string): UnidadeConfig | null {
  if (unidade === "2m_contabilidade") {
    const url = Deno.env.get("GCLICK_CONTAB_URL");
    const clientId = Deno.env.get("GCLICK_CONTAB_CLIENT_ID");
    const clientSecret = Deno.env.get("GCLICK_CONTAB_CLIENT_SECRET");
    if (!url || !clientId || !clientSecret) return null;
    return { url: url.replace(/\/$/, ""), clientId, clientSecret, label: "2M Contabilidade" };
  }
  if (unidade === "2m_saude") {
    const url = Deno.env.get("GCLICK_SAUDE_URL");
    const clientId = Deno.env.get("GCLICK_SAUDE_CLIENT_ID");
    const clientSecret = Deno.env.get("GCLICK_SAUDE_CLIENT_SECRET");
    if (!url || !clientId || !clientSecret) return null;
    return { url: url.replace(/\/$/, ""), clientId, clientSecret, label: "2M Saúde" };
  }
  return null;
}

async function getAccessToken(cfg: UnidadeConfig): Promise<string> {
  // GClick: POST /signin com JSON { clientId, clientSecret } -> { access_token }
  const tokenUrl = `${cfg.url}/signin`;
  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ clientId: cfg.clientId, clientSecret: cfg.clientSecret }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Falha ao obter token GClick (${resp.status}) em ${tokenUrl}: ${text.slice(0, 300) || "(resposta vazia)"}`);
  }

  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`Resposta de signin não-JSON: ${text.slice(0, 200)}`); }

  const token = json.access_token || json.accessToken || json.token;
  if (!token) throw new Error(`Token não retornado pelo GClick: ${text.slice(0, 200)}`);
  return token as string;
}

async function createGclickTask(
  cfg: UnidadeConfig,
  token: string,
  payload: Record<string, unknown>,
): Promise<{ id: string; url: string | null; raw: any }> {
  // Tentamos o endpoint mais comum: POST /api/tarefas
  const endpoint = `${cfg.url}/api/tarefas`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!resp.ok) {
    throw new Error(`GClick recusou criar tarefa (${resp.status}): ${text.slice(0, 400)}`);
  }

  const taskId = String(data.id ?? data.tarefaId ?? data.codigo ?? data.uuid ?? "");
  if (!taskId) throw new Error(`Resposta sem ID de tarefa: ${text.slice(0, 200)}`);

  // Heurística para construir URL pública da tarefa
  const taskUrl = data.url ?? data.link ?? `${cfg.url}/tarefas/${taskId}`;

  return { id: taskId, url: taskUrl, raw: data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = (await req.json()) as ReqBody;
    if (!body?.pendency_id) {
      return new Response(JSON.stringify({ error: "pendency_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca pendência
    const { data: pend, error: pendErr } = await supabase
      .from("pendencies").select("*").eq("id", body.pendency_id).maybeSingle();
    if (pendErr || !pend) throw new Error(`Pendência não encontrada: ${pendErr?.message || ""}`);
    if (pend.tipo !== "interna") throw new Error("Apenas pendências internas são enviadas ao GClick");

    // Busca cliente
    const { data: client, error: clientErr } = await supabase
      .from("clients").select("id, razao_social, cnpj, unidade, gclick_cliente_id")
      .eq("id", pend.client_id).maybeSingle();
    if (clientErr || !client) throw new Error(`Cliente não encontrado: ${clientErr?.message || ""}`);

    const cfg = getUnidadeConfig(client.unidade);
    if (!cfg) throw new Error(`Configuração GClick não encontrada para unidade: ${client.unidade}`);

    // Busca responsável
    const { data: profile } = await supabase
      .from("profiles").select("display_name").eq("user_id", pend.responsavel_id).maybeSingle();

    const compLabel = new Date(pend.competencia).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const titulo = `[${client.razao_social}] ${pend.setor_responsavel?.toUpperCase() || "PENDÊNCIA"} — ${compLabel}`;
    const descricao = [
      `Pendência interna gerada pelo Contábil Hub.`,
      `Cliente: ${client.razao_social} (CNPJ ${client.cnpj})`,
      `Competência: ${compLabel}`,
      pend.demand_type ? `Tipo: ${pend.demand_type}` : null,
      `Setor responsável: ${pend.setor_responsavel}`,
      `Prioridade: ${pend.prioridade}`,
      pend.prazo_resposta ? `Prazo: ${new Date(pend.prazo_resposta).toLocaleDateString("pt-BR")}` : null,
      "",
      pend.descricao,
      "",
      profile?.display_name ? `Solicitado por: ${profile.display_name}` : null,
    ].filter(Boolean).join("\n");

    const taskPayload: Record<string, unknown> = {
      titulo,
      descricao,
      prioridade: pend.prioridade,
      setor: pend.setor_responsavel,
      prazo: pend.prazo_resposta,
      cliente_id: client.gclick_cliente_id || undefined,
      cliente_cnpj: client.cnpj,
      origem: "contabil_hub",
      origem_id: pend.id,
    };

    let result;
    try {
      const token = await getAccessToken(cfg);
      result = await createGclickTask(cfg, token, taskPayload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase.from("pendencies").update({
        gclick_sync_error: msg.slice(0, 1000),
        gclick_synced_at: new Date().toISOString(),
        gclick_status: "erro",
      }).eq("id", pend.id);
      console.error("[gclick-create-task] erro:", msg);
      return new Response(JSON.stringify({ ok: false, error: msg, instancia: cfg.label }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("pendencies").update({
      gclick_task_id: result.id,
      gclick_task_url: result.url,
      gclick_status: "criada",
      gclick_synced_at: new Date().toISOString(),
      gclick_sync_error: null,
    }).eq("id", pend.id);

    return new Response(JSON.stringify({ ok: true, task_id: result.id, task_url: result.url, instancia: cfg.label }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[gclick-create-task] fatal:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

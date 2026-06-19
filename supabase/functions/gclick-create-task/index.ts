// GClick integration: OAuth 2.0 client_credentials + POST /tarefas/preTarefas
// Doc: https://documenter.getpostman.com/view/12417251/UV5TFeha
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_URL = "https://api.gclick.com.br";

interface ReqBody {
  pendency_id?: string;
  test_unidade?: string; // quando setado, apenas testa /oauth/token e retorna
  list_departamentos?: string; // unidade — retorna lista de departamentos do GClick
}


interface Credential {
  id: string;
  unidade: string;
  enabled: boolean;
  usuario: string;
  sistema_id: string;
  tag_por_setor: Record<string, string>;
  assunto_template: string;
  client_id_secret_name: string;
  client_secret_secret_name: string;
}

function onlyDigits(s: string | null | undefined): string {
  return (s || "").replace(/\D+/g, "");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getCachedToken(supabase: any, unidade: string): Promise<string | null> {
  const { data } = await supabase
    .from("integration_tokens")
    .select("access_token, expires_at")
    .eq("service", "gclick")
    .eq("unidade", unidade)
    .maybeSingle();
  if (!data) return null;
  const expires = new Date(data.expires_at).getTime();
  if (expires - Date.now() < 5 * 60 * 1000) return null;
  return data.access_token as string;
}

async function fetchAndCacheToken(
  supabase: any,
  cred: Credential,
): Promise<string> {
  const clientId = Deno.env.get(cred.client_id_secret_name);
  const clientSecret = Deno.env.get(cred.client_secret_secret_name);
  if (!clientId || !clientSecret) {
    throw new Error(
      `Credenciais GClick ausentes: defina os secrets ${cred.client_id_secret_name} e ${cred.client_secret_secret_name} no painel do backend.`,
    );
  }
  const basic = btoa(`${clientId}:${clientSecret}`);

  // Tenta 3 formatos comuns: Basic header puro, Basic+body, body puro
  const attempts: Array<{ label: string; headers: Record<string, string>; body: string }> = [
    {
      label: "basic-header",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
      body: "grant_type=client_credentials",
    },
    {
      label: "basic+body",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
    },
    {
      label: "body-only",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
    },
  ];

  let resp: Response | null = null;
  let text = "";
  const errors: string[] = [];
  for (const a of attempts) {
    resp = await fetch(`${BASE_URL}/oauth/token`, { method: "POST", headers: a.headers, body: a.body });
    text = await resp.text();
    console.log(`[gclick-oauth] attempt=${a.label} status=${resp.status}`);
    if (resp.ok) break;
    errors.push(`${a.label}: HTTP ${resp.status} ${text.slice(0, 200)}`);
    resp = null;
  }
  if (!resp) {
    throw new Error(
      `Credenciais GClick inválidas para unidade ${cred.unidade}. Tentativas: ${errors.join(" | ")}`,
    );
  }
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error(`Resposta OAuth não-JSON: ${text.slice(0, 200)}`); }
  if (!data.access_token) throw new Error(`Resposta OAuth sem access_token: ${text.slice(0, 200)}`);

  const expiresAt = new Date(Date.now() + ((data.expires_in ?? 3600) - 60) * 1000).toISOString();
  await supabase.from("integration_tokens").upsert(
    { service: "gclick", unidade: cred.unidade, access_token: data.access_token, expires_at: expiresAt },
    { onConflict: "service,unidade" },
  );
  return data.access_token as string;
}

async function getToken(supabase: any, cred: Credential): Promise<string> {
  const cached = await getCachedToken(supabase, cred.unidade);
  if (cached) return cached;
  return await fetchAndCacheToken(supabase, cred);
}

async function searchClienteByCnpj(token: string, cnpj: string): Promise<string | null> {
  const resp = await fetch(`${BASE_URL}/clientes/search?texto=${encodeURIComponent(cnpj)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Falha ao buscar cliente no GClick (HTTP ${resp.status}): ${t.slice(0, 200)}`);
  }
  const data = await resp.json().catch(() => null);
  const list = Array.isArray(data) ? data : (data?.content ?? data?.clientes ?? data?.data ?? []);
  if (!Array.isArray(list) || list.length === 0) return null;
  const first = list[0];
  return String(first.id ?? first.codigo ?? first.clienteId ?? "") || null;
}

async function createPreTarefa(
  token: string,
  payload: Record<string, unknown>,
  path = "/tarefas/preTarefas",
): Promise<{ ok: boolean; id?: string; msg: string; raw: any }> {
  const resp = await fetch(`${BASE_URL}${path}`, {
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
  if (!resp.ok || data?.status === "erro" || (Array.isArray(data?.respostas) && data.respostas.some((r: any) => !["sucesso", "ok"].includes(String(r?.status || "").toLowerCase())))) {
    console.log(`[gclick-create] status=${resp.status} response=${text.slice(0, 1000)}`);
  }
  if (!resp.ok) {
    return { ok: false, msg: `GClick HTTP ${resp.status}: ${text.slice(0, 300)}`, raw: data };
  }
  const r = Array.isArray(data?.respostas) ? data.respostas[0] : null;
  if (!r) return { ok: false, msg: `Resposta inesperada do GClick: ${text.slice(0, 200)}`, raw: data };
  if (["sucesso", "ok"].includes(String(r.status || "").toLowerCase())) {
    return { ok: true, id: String(r.id ?? ""), msg: r.msg || "Pré-tarefa criada", raw: data };
  }
  return { ok: false, msg: r.msg || "Erro desconhecido ao criar pré-tarefa", raw: data };
}

function departamentoFromConfig(value: string): string {
  // Aceita "5", "5. Fiscal" ou "Fiscal" — extrai o número se houver, senão devolve o texto.
  const trimmed = value.trim();
  const match = trimmed.match(/^\d+/);
  return match?.[0] || trimmed;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const [{ data: isAdmin }, { data: hasPerm }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" }),
    supabase.rpc("has_action_permission", { _user_id: userData.user.id, _action: "gerenciar_pendencias" }),
  ]);
  if (!isAdmin && !hasPerm) return json({ error: "Forbidden" }, 403);

  let body: ReqBody;
  try { body = (await req.json()) as ReqBody; } catch { return json({ error: "Body inválido" }, 400); }

  try {
    // === Modo "testar conexão" ===
    if (body.test_unidade) {
      const { data: cred } = await supabase
        .from("gclick_credentials").select("*").eq("unidade", body.test_unidade).maybeSingle();
      if (!cred) return json({ ok: false, error: `Unidade '${body.test_unidade}' não configurada.` });
      try {
        await fetchAndCacheToken(supabase, cred as Credential);
        return json({ ok: true, message: "Token obtido com sucesso." });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // === Modo "listar departamentos" ===
    if (body.list_departamentos) {
      const { data: cred } = await supabase
        .from("gclick_credentials").select("*").eq("unidade", body.list_departamentos).maybeSingle();
      if (!cred) return json({ ok: false, error: `Unidade '${body.list_departamentos}' não configurada.` });
      try {
        const token = await getToken(supabase, cred as Credential);
        const resp = await fetch(`${BASE_URL}/departamentos`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        const text = await resp.text();
        if (!resp.ok) return json({ ok: false, error: `GClick HTTP ${resp.status}: ${text.slice(0, 300)}` });
        let data: any; try { data = JSON.parse(text); } catch { data = []; }
        const list = Array.isArray(data) ? data : (data?.content ?? data?.departamentos ?? data?.data ?? []);
        const departamentos = (list || []).map((d: any) => ({
          id: String(d.id ?? d.codigo ?? d.departamentoId ?? ""),
          nome: String(d.nome ?? d.descricao ?? d.name ?? ""),
        })).filter((d: any) => d.id);
        return json({ ok: true, departamentos });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }


    if (!body.pendency_id) return json({ error: "pendency_id obrigatório" }, 400);

    const { data: pend, error: pendErr } = await supabase
      .from("pendencies").select("*").eq("id", body.pendency_id).maybeSingle();
    if (pendErr || !pend) throw new Error(`Pendência não encontrada: ${pendErr?.message || ""}`);
    if (pend.tipo !== "interna") throw new Error("Apenas pendências internas são enviadas ao GClick");

    const { data: client, error: clientErr } = await supabase
      .from("clients").select("id, razao_social, cnpj, unidade, gclick_cliente_id")
      .eq("id", pend.client_id).maybeSingle();
    if (clientErr || !client) throw new Error(`Cliente não encontrado: ${clientErr?.message || ""}`);

    // 2M Saúde não utiliza GClick — pular sincronização silenciosamente
    if (client.unidade === "2m_saude") {
      await supabase.from("pendencies").update({
        gclick_sync_error: null,
        gclick_synced_at: new Date().toISOString(),
        gclick_status: "nao_aplicavel",
      }).eq("id", pend.id);
      return json({ ok: true, code: "skipped", message: "Unidade 2M Saúde não utiliza GClick." });
    }



    const { data: credRow } = await supabase
      .from("gclick_credentials").select("*").eq("unidade", client.unidade).maybeSingle();
    if (!credRow || !credRow.enabled) {
      const msg = `Integração GClick não configurada/desabilitada para a unidade "${client.unidade}". Acesse Configurações → Integrações → GClick.`;
      await supabase.from("pendencies").update({
        gclick_sync_error: msg.slice(0, 1000),
        gclick_synced_at: new Date().toISOString(),
        gclick_status: "nao_configurado",
      }).eq("id", pend.id);
      return json({ ok: false, code: "not_configured", error: msg });
    }
    const cred = credRow as Credential;
    if (!cred.sistema_id) {
      const msg = `Configuração incompleta para "${client.unidade}": preencha o ID do sistema em Configurações → Integrações.`;
      await supabase.from("pendencies").update({
        gclick_sync_error: msg, gclick_synced_at: new Date().toISOString(), gclick_status: "nao_configurado",
      }).eq("id", pend.id);
      return json({ ok: false, code: "not_configured", error: msg });
    }
    const setor = pend.setor_responsavel || "outros";
    const tag = cred.tag_por_setor?.[setor];
    if (!tag) {
      const msg = `Tag GClick não configurada para o setor "${setor}" na unidade "${client.unidade}". Configure em Configurações → Integrações.`;
      await supabase.from("pendencies").update({
        gclick_sync_error: msg, gclick_synced_at: new Date().toISOString(), gclick_status: "nao_configurado",
      }).eq("id", pend.id);
      return json({ ok: false, code: "tag_missing", error: msg });
    }

    // Token
    let token: string;
    try {
      token = await getToken(supabase, cred);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("pendencies").update({
        gclick_sync_error: msg.slice(0, 1000),
        gclick_synced_at: new Date().toISOString(),
        gclick_status: "erro_auth",
      }).eq("id", pend.id);
      return json({ ok: false, code: "auth_failed", error: msg });
    }

    // Resolver cliente
    const cnpj = onlyDigits(client.cnpj);
    let gclickClienteId = client.gclick_cliente_id as string | null;
    if (!gclickClienteId) {
      try {
        gclickClienteId = await searchClienteByCnpj(token, cnpj);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabase.from("pendencies").update({
          gclick_sync_error: msg.slice(0, 1000),
          gclick_synced_at: new Date().toISOString(),
          gclick_status: "erro",
        }).eq("id", pend.id);
        return json({ ok: false, error: msg });
      }
      if (!gclickClienteId) {
        const msg = `Cliente "${client.razao_social}" (CNPJ ${cnpj}) não está cadastrado no GClick da unidade ${cred.unidade}. Cadastre-o lá antes de sincronizar.`;
        await supabase.from("pendencies").update({
          gclick_sync_error: msg, gclick_synced_at: new Date().toISOString(), gclick_status: "cliente_nao_encontrado",
        }).eq("id", pend.id);
        return json({ ok: false, code: "cliente_nao_encontrado", error: msg });
      }
      await supabase.from("clients").update({ gclick_cliente_id: gclickClienteId }).eq("id", client.id);
    }

    const compLabel = pend.competencia
      ? new Date(pend.competencia).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
      : "";
    const assunto = (cred.assunto_template || "Pendência contábil — {{cliente}} — {{competencia}}")
      .replace(/\{\{\s*cliente\s*\}\}/g, client.razao_social)
      .replace(/\{\{\s*competencia\s*\}\}/g, compLabel);

    const { data: profile } = await supabase
      .from("profiles").select("display_name").eq("user_id", pend.responsavel_id).maybeSingle();

    const andamento = [
      pend.descricao || "(sem descrição)",
      "",
      `Cliente: ${client.razao_social} (CNPJ ${client.cnpj})`,
      `Competência: ${compLabel}`,
      `Setor: ${setor}`,
      `Prioridade: ${pend.prioridade}`,
      pend.prazo_resposta ? `Prazo: ${new Date(pend.prazo_resposta).toLocaleDateString("pt-BR")}` : null,
      profile?.display_name ? `Solicitado por: ${profile.display_name}` : null,
    ].filter(Boolean).join("\n");

    // Buscar anexos da pendência e codificar em base64
    const arquivos: Array<Record<string, unknown>> = [];
    const { data: attachRows } = await supabase
      .from("pendency_attachments")
      .select("storage_path, file_name, mime_type, file_size")
      .eq("pendency_id", pend.id);
    if (attachRows && attachRows.length) {
      // Limite total de ~8MB em base64 (≈6MB binário) — proteção para não estourar payload do GClick.
      let totalBytes = 0;
      const MAX_BYTES = 6 * 1024 * 1024;
      for (const att of attachRows) {
        try {
          const { data: file, error: dlErr } = await supabase.storage
            .from("pendency-attachments").download(att.storage_path);
          if (dlErr || !file) {
            console.log(`[gclick-create] anexo skip (download): ${att.file_name} ${dlErr?.message || ""}`);
            continue;
          }
          const buf = new Uint8Array(await file.arrayBuffer());
          if (totalBytes + buf.byteLength > MAX_BYTES) {
            console.log(`[gclick-create] anexo skip (limite 6MB): ${att.file_name}`);
            continue;
          }
          totalBytes += buf.byteLength;
          // base64
          let bin = "";
          for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
          const b64 = btoa(bin);
          arquivos.push({
            nome: att.file_name,
            base64: `data:${att.mime_type || "application/octet-stream"};base64,${b64}`,
          });
        } catch (e) {
          console.log(`[gclick-create] anexo erro: ${att.file_name} ${e instanceof Error ? e.message : e}`);
        }
      }
    }

    const payload: Record<string, unknown> = {
      inscricoes: [cnpj],
      clienteId: gclickClienteId,
      departamentoId: departamentoFromConfig(tag),
      assunto,
      andamento,
      arquivos,
      convidadosIds: [] as unknown[],
    };

    const result = await createPreTarefa(token, payload, "/v2/tarefas/preTarefas");
    if (!result.ok) {
      // se token expirado, tenta renovar uma vez
      if (/401|unauthorized|token/i.test(result.msg)) {
        try {
          const fresh = await fetchAndCacheToken(supabase, cred);
          const retry = await createPreTarefa(fresh, payload, "/v2/tarefas/preTarefas");
          if (retry.ok) {
            await supabase.from("pendencies").update({
              gclick_task_id: retry.id, gclick_status: "criada",
              gclick_synced_at: new Date().toISOString(), gclick_sync_error: null,
            }).eq("id", pend.id);
            return json({ ok: true, task_id: retry.id, instancia: cred.unidade });
          }
          result.msg = retry.msg;
        } catch (e) {
          result.msg = e instanceof Error ? e.message : String(e);
        }
      }
      await supabase.from("pendencies").update({
        gclick_sync_error: result.msg.slice(0, 1000),
        gclick_synced_at: new Date().toISOString(),
        gclick_status: "erro",
      }).eq("id", pend.id);
      return json({ ok: false, error: result.msg, instancia: cred.unidade });
    }

    await supabase.from("pendencies").update({
      gclick_task_id: result.id, gclick_status: "criada",
      gclick_synced_at: new Date().toISOString(), gclick_sync_error: null,
    }).eq("id", pend.id);
    return json({ ok: true, task_id: result.id, instancia: cred.unidade });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[gclick-create-task] fatal:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});

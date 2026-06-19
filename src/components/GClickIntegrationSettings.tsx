import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plug, CheckCircle2, XCircle, Loader2, Save, RefreshCw } from "lucide-react";

type Setor = "fiscal" | "departamento_pessoal" | "societario" | "tributario" | "outros";
const SETORES: { key: Setor; label: string }[] = [
  { key: "fiscal", label: "Fiscal" },
  { key: "departamento_pessoal", label: "Departamento Pessoal" },
  { key: "societario", label: "Societário" },
  { key: "tributario", label: "Tributário" },
  { key: "outros", label: "Outros" },
];

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

const UNIDADE_LABEL: Record<string, string> = {
  "2m_contabilidade": "2M Contabilidade",
  "2m_saude": "2M Saúde",
};

export default function GClickIntegrationSettings() {
  const [creds, setCreds] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [recentErrors, setRecentErrors] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    const [{ data: c }, { data: errs }] = await Promise.all([
      supabase.from("gclick_credentials").select("*").order("unidade"),
      supabase.from("pendencies")
        .select("id, descricao, gclick_sync_error, gclick_synced_at, gclick_status, client_id, clients(razao_social)")
        .not("gclick_sync_error", "is", null)
        .order("gclick_synced_at", { ascending: false })
        .limit(10),
    ]);
    setCreds((c || []) as Credential[]);
    setRecentErrors(errs || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function patch(id: string, partial: Partial<Credential>) {
    setCreds((prev) => prev.map((c) => (c.id === id ? { ...c, ...partial } : c)));
  }

  async function save(cred: Credential) {
    setSavingId(cred.id);
    const { error } = await supabase.from("gclick_credentials").update({
      enabled: cred.enabled,
      usuario: cred.usuario,
      sistema_id: cred.sistema_id,
      tag_por_setor: cred.tag_por_setor,
      assunto_template: cred.assunto_template,
    }).eq("id", cred.id);
    setSavingId(null);
    if (error) toast.error("Erro ao salvar: " + error.message);
    else toast.success("Configuração salva");
  }

  async function testar(cred: Credential) {
    setTestingId(cred.id);
    const { data, error } = await supabase.functions.invoke("gclick-create-task", {
      body: { test_unidade: cred.unidade },
    });
    setTestingId(null);
    if (error) { toast.error("Falha: " + error.message); return; }
    if (data?.ok) toast.success(`Conexão OK com ${UNIDADE_LABEL[cred.unidade]}`);
    else toast.error(data?.error || "Falha na conexão");
  }

  async function reenviar(pendencyId: string) {
    toast.loading("Reenviando...", { id: `re-${pendencyId}` });
    const { data, error } = await supabase.functions.invoke("gclick-create-task", { body: { pendency_id: pendencyId } });
    if (error) { toast.error(error.message, { id: `re-${pendencyId}` }); return; }
    if (data?.ok) toast.success("Sincronizada!", { id: `re-${pendencyId}` });
    else toast.error(data?.error || "Falhou novamente", { id: `re-${pendencyId}` });
    load();
  }

  if (loading) return <div className="bg-card rounded-lg border border-border p-6 text-sm text-muted-foreground">Carregando integração GClick...</div>;

  return (
    <div className="bg-card rounded-lg border border-border p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2"><Plug className="w-5 h-5" /> Integração GClick</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Cada unidade tem uma conta GClick separada. O <strong>ID de cliente</strong> e o <strong>Segredo de cliente</strong> (gerados no GClick em Configurações → API) já estão armazenados como secrets do backend e não aparecem nesta tela. Os campos abaixo são informações operacionais usadas na criação das tarefas.
          </p>
        </div>
        <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Atualizar</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {creds.map((cred) => (
          <div key={cred.id} className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{UNIDADE_LABEL[cred.unidade] || cred.unidade}</div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  Credenciais OAuth: {cred.client_id_secret_name} · {cred.client_secret_secret_name}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={cred.enabled} onChange={(e) => patch(cred.id, { enabled: e.target.checked })} className="w-4 h-4 rounded border-border" />
                Ativo
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Login do responsável no GClick</label>
                <input value={cred.usuario} onChange={(e) => patch(cred.id, { usuario: e.target.value })} className="w-full text-sm px-2 py-1.5 rounded border border-border bg-background" placeholder="ex: integrador" />
                <div className="text-[10px] text-muted-foreground mt-0.5">Usuário GClick atribuído como responsável das tarefas.</div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ID do Sistema (GClick)</label>
                <input value={cred.sistema_id} onChange={(e) => patch(cred.id, { sistema_id: e.target.value })} className="w-full text-sm px-2 py-1.5 rounded border border-border bg-background" placeholder="ex: 12345" />
                <div className="text-[10px] text-muted-foreground mt-0.5">Identificador numérico do sistema/módulo.</div>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Modelo do assunto</label>
              <input value={cred.assunto_template} onChange={(e) => patch(cred.id, { assunto_template: e.target.value })} className="w-full text-sm px-2 py-1.5 rounded border border-border bg-background font-mono" />
              <div className="text-[10px] text-muted-foreground mt-0.5">Variáveis: {"{{cliente}}"}, {"{{competencia}}"}</div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">Tag por setor</div>
              <div className="space-y-1">
                {SETORES.map((s) => (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className="text-xs w-40 text-muted-foreground">{s.label}</span>
                    <input
                      value={cred.tag_por_setor?.[s.key] || ""}
                      onChange={(e) => patch(cred.id, { tag_por_setor: { ...cred.tag_por_setor, [s.key]: e.target.value } })}
                      placeholder="tag GClick"
                      className="flex-1 text-sm px-2 py-1 rounded border border-border bg-background font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-border">
              <button onClick={() => save(cred)} disabled={savingId === cred.id} className="flex-1 flex items-center justify-center gap-1 text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {savingId === cred.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Salvar
              </button>
              <button onClick={() => testar(cred)} disabled={testingId === cred.id} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border border-border hover:bg-muted/50 disabled:opacity-50">
                {testingId === cred.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Testar conexão
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-4">
        <h4 className="text-sm font-medium mb-2 flex items-center gap-2"><XCircle className="w-4 h-4 text-destructive" /> Últimas tentativas com erro</h4>
        {recentErrors.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem erros recentes 🎉</p>
        ) : (
          <div className="space-y-1.5">
            {recentErrors.map((p: any) => (
              <div key={p.id} className="flex items-start justify-between gap-2 p-2 rounded border border-border bg-muted/30 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.clients?.razao_social || "—"}</div>
                  <div className="text-muted-foreground truncate" title={p.gclick_sync_error}>{p.gclick_sync_error}</div>
                  <div className="text-[10px] text-muted-foreground">{p.gclick_synced_at ? new Date(p.gclick_synced_at).toLocaleString("pt-BR") : ""} · {p.gclick_status}</div>
                </div>
                <button onClick={() => reenviar(p.id)} className="text-xs px-2 py-1 rounded border border-border hover:bg-background">Reenviar</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

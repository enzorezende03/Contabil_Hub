import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePendencies, usePendencyCommunications } from "@/hooks/use-pendencies";
import {
  PRIORIDADE_COLORS, PRIORIDADE_LABELS, STATUS_LABELS, SETOR_LABELS, CANAL_LABELS,
  diasAberta, diasUltimoContato, isPendencyVencida,
  type Pendency, type PendencyPrioridade, type PendencyStatus, type PendencySetor,
} from "@/lib/pendency-types";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RegistrarCobrancaDialog } from "@/components/RegistrarCobrancaDialog";
import { CreatePendencyDialog } from "@/components/CreatePendencyDialog";
import { ImportPendenciesDialog } from "@/components/ImportPendenciesDialog";
import { AlertCircle, Clock, CheckCircle2, Inbox, Plus, Pause, Play, Building2, History, ExternalLink, RefreshCw, Link2, Copy, KeyRound, FileSpreadsheet, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientRow { id: string; razao_social: string; cnpj: string; unidade: string | null; }

export default function PendenciasPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"externas" | "internas" | "resolvidas">("externas");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPrioridade, setFilterPrioridade] = useState<string>("all");
  const [filterResponsavel, setFilterResponsavel] = useState<string>("mine");
  const [filterSetor, setFilterSetor] = useState<string>("all");
  const [filterCobrarHoje, setFilterCobrarHoje] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [createCtx, setCreateCtx] = useState<{ clientId: string; clientName?: string } | null>(null);
  const [cobrarPendency, setCobrarPendency] = useState<Pendency | null>(null);
  const [resolvePendency, setResolvePendency] = useState<Pendency | null>(null);
  const [pausePendency, setPausePendency] = useState<Pendency | null>(null);
  const [deletePendency, setDeletePendency] = useState<Pendency | null>(null);
  const [detailsPendency, setDetailsPendency] = useState<Pendency | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, razao_social, cnpj, unidade").order("razao_social");
      if (error) throw error;
      return (data || []) as ClientRow[];
    },
  });
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, display_name").order("display_name");
      return (data || []) as Array<{ user_id: string; display_name: string | null }>;
    },
  });
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p.display_name || p.user_id.slice(0, 8)])), [profiles]);

  const { data: pendencies = [], isLoading } = usePendencies({});

  const filtered = useMemo(() => {
    const today = new Date(new Date().toDateString());
    let list = pendencies;
    if (tab === "externas") list = list.filter((p) => p.tipo === "externa" && p.status !== "resolvida" && p.status !== "cancelada");
    if (tab === "internas") list = list.filter((p) => p.tipo === "interna" && p.status !== "resolvida" && p.status !== "cancelada");
    if (tab === "resolvidas") {
      const cutoff = Date.now() - 30 * 86_400_000;
      list = list.filter((p) => (p.status === "resolvida" || p.status === "cancelada") && new Date(p.updated_at).getTime() >= cutoff);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => {
        const c = clientMap.get(p.client_id);
        return (
          c?.razao_social?.toLowerCase().includes(q) ||
          p.documento_solicitado?.toLowerCase().includes(q) ||
          p.descricao.toLowerCase().includes(q)
        );
      });
    }
    if (filterStatus !== "all") list = list.filter((p) => p.status === filterStatus);
    if (filterPrioridade !== "all") list = list.filter((p) => p.prioridade === filterPrioridade);
    if (filterResponsavel === "mine") list = list.filter((p) => p.responsavel_id === user?.id);
    else if (filterResponsavel !== "all") list = list.filter((p) => p.responsavel_id === filterResponsavel);
    if (tab === "internas" && filterSetor !== "all") list = list.filter((p) => p.setor_responsavel === filterSetor);
    if (filterCobrarHoje) list = list.filter((p) => !p.followup_paused && p.next_followup_at && new Date(p.next_followup_at) <= new Date());

    // Default sort: vencidas primeiro, depois sem contato há mais tempo
    return [...list].sort((a, b) => {
      const aVenc = isPendencyVencida(a) ? 1 : 0;
      const bVenc = isPendencyVencida(b) ? 1 : 0;
      if (aVenc !== bVenc) return bVenc - aVenc;
      const aLast = a.ultimo_contato_em ? new Date(a.ultimo_contato_em).getTime() : 0;
      const bLast = b.ultimo_contato_em ? new Date(b.ultimo_contato_em).getTime() : 0;
      return aLast - bLast; // mais antigo primeiro
    });
  }, [pendencies, tab, search, filterStatus, filterPrioridade, filterResponsavel, filterSetor, filterCobrarHoje, user?.id, clientMap]);

  // KPIs (sempre sobre todas as pendências, não filtradas)
  const kpis = useMemo(() => {
    const today = new Date(new Date().toDateString());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const ativas = pendencies.filter((p) => p.status !== "resolvida" && p.status !== "cancelada");
    return {
      abertas: ativas.length,
      vencidas: ativas.filter((p) => p.prazo_resposta && new Date(p.prazo_resposta) < today).length,
      semContato7d: ativas.filter((p) => {
        if (!p.ultimo_contato_em) return diasAberta(p.created_at) > 7;
        return diasUltimoContato(p.ultimo_contato_em)! > 7;
      }).length,
      resolvidasMes: pendencies.filter((p) => p.status === "resolvida" && p.resolved_at && new Date(p.resolved_at) >= monthStart).length,
    };
  }, [pendencies]);

  return (
    <AppLayout>
      <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Pendências</h1>
            <p className="text-sm text-muted-foreground">Painel de cobrança de pendências internas e externas.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!clients.length}>
              <FileSpreadsheet className="w-4 h-4 mr-1" /> Importar planilha
            </Button>
            <Button onClick={() => setCreateOpen(true)} disabled={!clients.length}>
              <Plus className="w-4 h-4 mr-1" /> Nova pendência
            </Button>
          </div>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiBlock icon={Inbox} label="Pendências abertas" value={kpis.abertas} color="text-foreground" />
          <KpiBlock icon={AlertCircle} label="Vencidas" value={kpis.vencidas} color={kpis.vencidas > 0 ? "text-red-500" : "text-foreground"} />
          <KpiBlock icon={Clock} label="Sem contato > 7d" value={kpis.semContato7d} color={kpis.semContato7d > 0 ? "text-orange-500" : "text-foreground"} />
          <KpiBlock icon={CheckCircle2} label="Resolvidas no mês" value={kpis.resolvidasMes} color="text-emerald-500" />
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="externas">Externas (cliente)</TabsTrigger>
            <TabsTrigger value="internas">Internas (setor)</TabsTrigger>
            <TabsTrigger value="resolvidas">Resolvidas (30d)</TabsTrigger>
          </TabsList>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 mt-3 pb-3 border-b">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, documento..." className="w-64 h-8" />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPrioridade} onValueChange={setFilterPrioridade}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas prioridades</SelectItem>
                {Object.entries(PRIORIDADE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterResponsavel} onValueChange={setFilterResponsavel}>
              <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">Minhas pendências</SelectItem>
                <SelectItem value="all">Todos responsáveis</SelectItem>
                {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || "—"}</SelectItem>)}
              </SelectContent>
            </Select>
            {tab === "internas" && (
              <Select value={filterSetor} onValueChange={setFilterSetor}>
                <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos setores</SelectItem>
                  {Object.entries(SETOR_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <button
              onClick={() => setFilterCobrarHoje((v) => !v)}
              className={cn("h-8 px-3 text-xs rounded-md border transition-colors", filterCobrarHoje ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}
            >
              {filterCobrarHoje ? "✓ " : ""}Para cobrar hoje
            </button>
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} pendência(s)</span>
          </div>

          <TabsContent value={tab} className="mt-4">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">Nenhuma pendência encontrada.</div>
            ) : (
              <div className="space-y-2">
                {filtered.map((p) => (
                  <PendencyCard
                    key={p.id}
                    pendency={p}
                    clientName={clientMap.get(p.client_id)?.razao_social || "—"}
                    responsavelName={profileMap.get(p.responsavel_id) || "—"}
                    clientUnidade={clientMap.get(p.client_id)?.unidade || null}
                    onCobrar={() => setCobrarPendency(p)}
                    onResolver={() => setResolvePendency(p)}
                    onPausar={() => setPausePendency(p)}
                    onDetalhes={() => setDetailsPendency(p)}
                    onExcluir={() => setDeletePendency(p)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      {createOpen && (
        <CreatePendencyDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          clients={clients}
          onSwitchToImport={() => { setCreateOpen(false); setImportOpen(true); }}
        />
      )}
      <ImportPendenciesDialog open={importOpen} onOpenChange={setImportOpen} />

      {cobrarPendency && (
        <RegistrarCobrancaDialog
          open={!!cobrarPendency}
          onOpenChange={(o) => !o && setCobrarPendency(null)}
          pendency={cobrarPendency}
          clientName={clientMap.get(cobrarPendency.client_id)?.razao_social}
        />
      )}
      {resolvePendency && (
        <ResolveDialog pendency={resolvePendency} onClose={() => setResolvePendency(null)} clientName={clientMap.get(resolvePendency.client_id)?.razao_social} />
      )}
      {pausePendency && (
        <PauseDialog pendency={pausePendency} onClose={() => setPausePendency(null)} />
      )}
      {deletePendency && (
        <DeleteDialog pendency={deletePendency} onClose={() => setDeletePendency(null)} clientName={clientMap.get(deletePendency.client_id)?.razao_social} />
      )}
      {detailsPendency && (
        <DetailsDialog pendency={detailsPendency} onClose={() => setDetailsPendency(null)} clientName={clientMap.get(detailsPendency.client_id)?.razao_social} responsavelName={profileMap.get(detailsPendency.responsavel_id) || "—"} />
      )}
    </AppLayout>
  );
}

function KpiBlock({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-start gap-3">
      <div className={cn("p-2 rounded-md bg-muted/50", color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn("text-2xl font-bold leading-tight mt-0.5", color)}>{value}</div>
      </div>
    </div>
  );
}

function GclickBadge({ pendency: p }: { pendency: Pendency }) {
  const [sending, setSending] = useState(false);
  const qc = useQueryClient();

  async function reenviar(e: React.MouseEvent) {
    e.stopPropagation();
    setSending(true);
    const { data, error } = await supabase.functions.invoke("gclick-create-task", { body: { pendency_id: p.id } });
    setSending(false);
    if (data?.code === "not_configured") {
      toast.warning("Integração GClick não configurada. Configure os secrets em Configurações → Integrações para sincronizar automaticamente.", { duration: 8000 });
    } else if (data?.code === "skipped") {
      toast.info(data.message || "Esta unidade não utiliza GClick.");
    } else if (error || !data?.ok) {
      toast.error(`Falha ao sincronizar com GClick: ${data?.error || error?.message || "erro desconhecido"}`);
    } else {
      toast.success(data.instancia ? `Sincronizada no GClick (${data.instancia})` : "Sincronizada no GClick");
    }
    qc.invalidateQueries({ queryKey: ["pendencies"] });
  }

  if (p.gclick_task_id) {
    const fallback = p.gclick_task_url || `https://app.gclick.com.br/#/tarefas/pretarefas/${p.gclick_task_id}`;
    async function openGclick(e: React.MouseEvent) {
      e.stopPropagation();
      e.preventDefault();
      const win = window.open("about:blank", "_blank");
      try {
        const { data } = await supabase.functions.invoke("gclick-create-task", {
          body: { resolve_task_url: p.id },
        });
        const url = (data?.url as string) || fallback;
        if (win) win.location.href = url; else window.open(url, "_blank");
        qc.invalidateQueries({ queryKey: ["pendencies"] });
      } catch {
        if (win) win.location.href = fallback;
      }
    }
    return (
      <a
        href={fallback}
        target="_blank"
        rel="noreferrer"
        onClick={openGclick}
        className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-700 border-emerald-500/30 inline-flex items-center gap-1 hover:bg-emerald-500/25"
        title={`Sincronizada no GClick · ${p.gclick_task_id}`}
      >
        <ExternalLink className="w-2.5 h-2.5" /> Abrir no GClick
      </a>
    );
  }

  if (p.gclick_status === "nao_configurado" || p.gclick_status === "nao_aplicavel") {
    return (
      <span
        className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-500/15 text-amber-700 border-amber-500/30 inline-flex items-center gap-1"
        title={p.gclick_status === "nao_aplicavel" ? "Unidade não utiliza GClick" : p.gclick_sync_error || "Integração GClick não configurada"}
      >
        {p.gclick_status === "nao_aplicavel" ? "GClick não aplicável" : "GClick não configurado"}
      </span>
    );
  }
  if (p.gclick_sync_error) {
    return (
      <button
        type="button"
        onClick={reenviar}
        disabled={sending}
        title={p.gclick_sync_error}
        className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-500/15 text-red-600 border-red-500/30 inline-flex items-center gap-1 hover:bg-red-500/25"
      >
        <RefreshCw className={cn("w-2.5 h-2.5", sending && "animate-spin")} /> Sincronização falhou — reenviar
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={reenviar}
      disabled={sending}
      title="Sincronizar pré-tarefa no GClick"
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-muted text-muted-foreground hover:bg-muted/80 inline-flex items-center gap-1"
    >
      <RefreshCw className={cn("w-2.5 h-2.5", sending && "animate-spin")} /> Sincronizar GClick
    </button>
  );
}

function PendencyCard({ pendency: p, clientName, responsavelName, clientUnidade, onCobrar, onResolver, onPausar, onDetalhes, onExcluir }: {

  pendency: Pendency; clientName: string; responsavelName: string; clientUnidade: string | null;
  onCobrar: () => void; onResolver: () => void; onPausar: () => void; onDetalhes: () => void; onExcluir: () => void;
}) {
  const aberta = diasAberta(p.created_at);
  const ultimoCont = diasUltimoContato(p.ultimo_contato_em);
  const vencida = isPendencyVencida(p);
  const finalizada = p.status === "resolvida" || p.status === "cancelada";

  // Followup badge
  let followupBadge: { label: string; className: string } | null = null;
  if (!finalizada) {
    if (p.followup_paused) {
      followupBadge = p.followup_paused_until
        ? { label: `Pausada até ${new Date(p.followup_paused_until).toLocaleDateString("pt-BR")}`, className: "bg-blue-500/15 text-blue-600 border-blue-500/30" }
        : { label: "Pausada", className: "bg-slate-500/15 text-slate-600 border-slate-500/30" };
    } else if (p.next_followup_at) {
      const due = new Date(p.next_followup_at);
      const diff = Math.floor((due.getTime() - Date.now()) / 86_400_000);
      if (diff <= 0) followupBadge = { label: "Cobrar hoje", className: "bg-amber-500/20 text-amber-700 border-amber-500/40" };
      else followupBadge = { label: `Cobrar em ${diff}d`, className: "bg-muted text-muted-foreground border-border" };
    }
  }

  return (
    <div className={cn("rounded-lg border bg-card p-4 transition-colors", vencida && "border-red-500/40")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold">{clientName}</span>
            <span className="text-xs text-muted-foreground">
              · {new Date(p.competencia).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
            </span>
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", PRIORIDADE_COLORS[p.prioridade as PendencyPrioridade])}>
              {PRIORIDADE_LABELS[p.prioridade as PendencyPrioridade]}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {STATUS_LABELS[p.status as PendencyStatus]}
            </span>
            {followupBadge && (
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", followupBadge.className)}>{followupBadge.label}</span>
            )}
            {p.tipo === "interna" && clientUnidade !== "2m_saude" && <GclickBadge pendency={p} />}
          </div>
          <div className="text-sm">
            {p.tipo === "externa" ? (
              <span className="font-medium">{p.documento_solicitado}</span>
            ) : (
              <span className="font-medium">[{SETOR_LABELS[p.setor_responsavel as PendencySetor] || "—"}]</span>
            )}
            {" — "}
            <span className="text-muted-foreground">{p.descricao}</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
            <span>Aberta há {aberta} dia(s)</span>
            <span className={cn(ultimoCont !== null && ultimoCont > 7 && "text-red-500 font-medium")}>
              {ultimoCont === null ? "Nunca contatado" : `Último contato: há ${ultimoCont}d`}
            </span>
            <span>Total cobranças: {p.total_contatos}</span>
            {p.prazo_resposta && (
              <span className={cn(vencida && "text-red-500 font-medium")}>
                Prazo: {new Date(p.prazo_resposta).toLocaleDateString("pt-BR")}
              </span>
            )}
            <span>Resp.: {responsavelName}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap">
        {!finalizada && (
          <>
            <Button size="sm" onClick={onCobrar}>Registrar cobrança</Button>
            <Button size="sm" variant="outline" onClick={onResolver}>Resolver</Button>
            <Button size="sm" variant="ghost" onClick={onPausar}>
              {p.followup_paused ? <><Play className="w-3.5 h-3.5 mr-1" /> Despausar</> : <><Pause className="w-3.5 h-3.5 mr-1" /> Pausar</>}
            </Button>
            {p.tipo === "externa" && <PortalAccessButton pendencyId={p.id} />}
          </>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onDetalhes}>
          <History className="w-3.5 h-3.5 mr-1" /> {p.tipo === "externa" ? "Ver respostas / histórico" : "Histórico"}
        </Button>
        {!finalizada && (
          <Button size="sm" variant="ghost" onClick={onExcluir} className="text-red-600 hover:text-red-700 hover:bg-red-500/10">
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
          </Button>
        )}
      </div>
    </div>
  );
}

function PortalAccessButton({ pendencyId }: { pendencyId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(false);

  // Link com código embutido no fragmento (#) — não trafega em logs de servidor.
  // Se ainda não geramos um novo código nesta sessão, mostramos só o link base.
  const portalUrl = token
    ? `${window.location.origin}/p/${token}${code ? `#c=${encodeURIComponent(code)}` : ""}`
    : null;

  async function loadExisting() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pendency_access_tokens")
        .select("token, expires_at, revoked")
        .eq("pendency_id", pendencyId)
        .maybeSingle();
      if (error) throw error;
      if (data && !data.revoked) {
        setToken(data.token);
        setExpiresAt(data.expires_at);
        setHasToken(true);
      } else {
        setToken(null);
        setHasToken(false);
      }
      setCode(null);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar link do portal");
    } finally {
      setLoading(false);
    }
  }

  async function rotate() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pendency-token-create", {
        body: { pendencyId },
      });
      if (error) throw error;
      if (!data?.token) throw new Error("Falha ao gerar token");
      setToken(data.token);
      setCode(data.code);
      setExpiresAt(data.expires_at);
      setHasToken(true);
      toast.success("Novo código gerado");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar código");
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => { setOpen(true); loadExisting(); }}
      >
        <Link2 className="w-3.5 h-3.5 mr-1" /> Link do portal
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Acesso do cliente ao portal</DialogTitle>
            <DialogDescription>
              O link abaixo já contém o código de acesso embutido — basta enviá-lo ao cliente.
              O código também aparece separado caso queira enviar por outro canal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

            {!loading && !hasToken && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                Ainda não há link gerado para esta pendência. Clique em <strong>Gerar link e código</strong> abaixo.
              </div>
            )}

            {portalUrl && (
              <div>
                <Label className="text-xs">Link do portal</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input readOnly value={portalUrl} className="font-mono text-xs" />
                  <Button size="sm" variant="outline" onClick={() => copy(portalUrl, "Link")}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={portalUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a>
                  </Button>
                </div>
              </div>
            )}

            {code ? (
              <div>
                <Label className="text-xs">Código de acesso (visível apenas agora)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input readOnly value={code} className="font-mono text-lg tracking-widest" />
                  <Button size="sm" variant="outline" onClick={() => copy(code, "Código")}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Por segurança, guardamos apenas o hash. Se perder, gere um novo código.
                </p>
              </div>
            ) : hasToken && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <KeyRound className="w-4 h-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Código não disponível para embutir no link</p>
                    <p className="text-xs text-muted-foreground">
                      O código original é guardado de forma segura (hash) e não pode ser recuperado.
                      Para gerar um link com o código já embutido, clique em <strong>Gerar novo código</strong> —
                      o link continua o mesmo, apenas o código é renovado.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {expiresAt && (
              <p className="text-xs text-muted-foreground">
                Expira em: {new Date(expiresAt).toLocaleDateString("pt-BR")}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
            <Button onClick={rotate} disabled={loading}>
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1", loading && "animate-spin")} />
              {hasToken ? "Gerar novo código" : "Gerar link e código"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Wrapper to allow choosing a client when creating from /pendencias header */
function CreatePendencyDialogWrapper({ open, onOpenChange, clients, onSwitchToImport }: { open: boolean; onOpenChange: (o: boolean) => void; clients: ClientRow[]; onSwitchToImport?: () => void }) {
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [clientId, setClientId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients.slice(0, 50);
    return clients.filter((c) =>
      c.razao_social.toLowerCase().includes(q) || (c.cnpj || "").toLowerCase().includes(q)
    ).slice(0, 50);
  }, [clients, search]);
  const selected = clients.find((c) => c.id === clientId);

  if (step === "form" && selected) {
    return (
      <CreatePendencyDialog
        open={open}
        onOpenChange={(o) => { onOpenChange(o); if (!o) { setStep("pick"); setClientId(""); setSearch(""); } }}
        clientId={selected.id}
        clientName={selected.razao_social}
        month={month}
        year={year}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setStep("pick"); setClientId(""); setSearch(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova pendência</DialogTitle>
          <DialogDescription>Selecione o cliente e a competência</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Cliente</Label>
            <Input
              autoFocus
              placeholder="Buscar por razão social ou CNPJ"
              value={search}
              onChange={(e) => { setSearch(e.target.value); if (clientId) setClientId(""); }}
            />
            {search.trim() ? (
              <div className="max-h-56 overflow-y-auto rounded-md border bg-background">
                {filteredClients.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {clients.length === 0 ? "Nenhum cliente cadastrado" : "Nenhum cliente encontrado"}
                  </div>
                ) : (
                  filteredClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setClientId(c.id); setSearch(c.razao_social); }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0 transition-colors",
                        clientId === c.id && "bg-primary/10 text-primary font-medium"
                      )}
                    >
                      <div className="truncate">{c.razao_social}</div>
                      {c.cnpj && <div className="text-[10px] text-muted-foreground font-mono">{c.cnpj}</div>}
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="px-3 py-3 text-center text-xs text-muted-foreground rounded-md border border-dashed">
                Digite para pesquisar o cliente
              </div>
            )}
            {selected && (
              <div className="text-[11px] text-muted-foreground">
                Selecionado: <span className="font-medium text-foreground">{selected.razao_social}</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Mês</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ano</Label>
              <Input value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="flex sm:justify-between gap-2">
          {onSwitchToImport ? (
            <Button variant="ghost" onClick={onSwitchToImport} className="gap-1">
              <FileSpreadsheet className="w-4 h-4" /> Importar planilha
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => setStep("form")} disabled={!clientId}>Continuar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({ pendency, clientName, onClose }: { pendency: Pendency; clientName?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const { error } = await supabase.from("pendencies").update({
      status: "resolvida",
      resolved_at: new Date().toISOString(),
      resolution_notes: notes.trim() || null,
    }).eq("id", pendency.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pendência resolvida");
    qc.invalidateQueries({ queryKey: ["pendencies"] });
    onClose();
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Resolver pendência</DialogTitle>
          <DialogDescription>{clientName} — {pendency.documento_solicitado || pendency.descricao.slice(0, 60)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Como foi resolvida?</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Ex.: Cliente enviou o extrato por e-mail" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Marcar como resolvida"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ pendency, clientName, onClose }: { pendency: Pendency; clientName?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    const motivo = reason.trim();
    if (!motivo) { toast.error("Informe a justificativa da exclusão"); return; }
    setSaving(true);
    const stamp = new Date().toLocaleString("pt-BR");
    const prev = pendency.resolution_notes ? `${pendency.resolution_notes}\n\n` : "";
    const { error } = await supabase.from("pendencies").update({
      status: "cancelada",
      resolved_at: new Date().toISOString(),
      resolution_notes: `${prev}[EXCLUÍDA em ${stamp}] ${motivo}`,
      followup_paused: true,
    }).eq("id", pendency.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pendência excluída com justificativa registrada");
    qc.invalidateQueries({ queryKey: ["pendencies"] });
    onClose();
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600">Excluir pendência</DialogTitle>
          <DialogDescription>
            {clientName} — {pendency.documento_solicitado || pendency.descricao.slice(0, 60)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <div className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/30 rounded p-2">
            A pendência será marcada como <strong>cancelada</strong> e o motivo ficará registrado no histórico para auditoria.
          </div>
          <Label>Justificativa <span className="text-red-500">*</span></Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Ex.: Pendência criada em duplicidade / cliente não é mais da carteira / etc."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
            {saving ? "Excluindo..." : "Confirmar exclusão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PauseDialog({ pendency, onClose }: { pendency: Pendency; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"date" | "indef">("date");
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function unpause() {
    setSaving(true);
    const { error } = await supabase.from("pendencies").update({
      followup_paused: false, followup_paused_until: null, followup_paused_reason: null,
    }).eq("id", pendency.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Lembretes retomados");
    qc.invalidateQueries({ queryKey: ["pendencies"] });
    onClose();
  }
  async function pause() {
    if (mode === "date" && !until) { toast.error("Informe a data"); return; }
    if (mode === "indef" && !reason.trim()) { toast.error("Informe o motivo"); return; }
    setSaving(true);
    const { error } = await supabase.from("pendencies").update({
      followup_paused: true,
      followup_paused_until: mode === "date" ? until : null,
      followup_paused_reason: mode === "indef" ? reason.trim() : null,
    }).eq("id", pendency.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Lembretes pausados");
    qc.invalidateQueries({ queryKey: ["pendencies"] });
    onClose();
  }

  if (pendency.followup_paused) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Despausar lembretes</DialogTitle>
            <DialogDescription>
              {pendency.followup_paused_until
                ? `Pausada até ${new Date(pendency.followup_paused_until).toLocaleDateString("pt-BR")}`
                : `Motivo: ${pendency.followup_paused_reason || "—"}`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={unpause} disabled={saving}>Despausar agora</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pausar lembretes</DialogTitle>
          <DialogDescription>O sistema deixa de lembrar até a condição abaixo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex gap-2">
            <button onClick={() => setMode("date")} className={cn("flex-1 p-2 text-xs rounded border", mode === "date" ? "border-primary bg-primary/10" : "hover:bg-muted")}>Pausar até data</button>
            <button onClick={() => setMode("indef")} className={cn("flex-1 p-2 text-xs rounded border", mode === "indef" ? "border-primary bg-primary/10" : "hover:bg-muted")}>Indefinidamente</button>
          </div>
          {mode === "date" ? (
            <div>
              <Label>Data</Label>
              <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </div>
          ) : (
            <div>
              <Label>Motivo *</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Ex.: Aguardando reunião com cliente" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={pause} disabled={saving}>Pausar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailsDialog({ pendency, clientName, responsavelName, onClose }: { pendency: Pendency; clientName?: string; responsavelName: string; onClose: () => void }) {
  const { data: comms = [] } = usePendencyCommunications(pendency.id);

  const { data: items = [] } = useQuery({
    queryKey: ["pendency-items", pendency.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pendency_items")
        .select("*")
        .eq("pendency_id", pendency.id)
        .order("ordem");
      if (error) throw error;
      return data || [];
    },
    enabled: pendency.tipo === "externa",
  });

  const { data: responses = [] } = useQuery({
    queryKey: ["pendency-item-responses", pendency.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pendency_item_responses")
        .select("*")
        .eq("pendency_id", pendency.id)
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: pendency.tipo === "externa",
  });

  const { data: itemComments = [] } = useQuery({
    queryKey: ["pendency-item-comments", pendency.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pendency_item_comments")
        .select("*")
        .eq("pendency_id", pendency.id)
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: pendency.tipo === "externa",
  });

  async function openAttachment(path: string) {
    const { data, error } = await supabase.storage
      .from("pendency-attachments")
      .createSignedUrl(path, 600);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir o anexo");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  const totalItems = items.length;
  const entregues = items.filter((i: any) => i.status === "entregue").length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{clientName}</DialogTitle>
          <DialogDescription>
            {new Date(pendency.competencia).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })} · Responsável: {responsavelName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
            <div><strong>Tipo:</strong> {pendency.tipo === "externa" ? "Externa (cliente)" : `Interna (${SETOR_LABELS[pendency.setor_responsavel as PendencySetor] || "—"})`}</div>
            {pendency.documento_solicitado && <div><strong>Documento:</strong> {pendency.documento_solicitado}</div>}
            {pendency.contato_cliente_nome && <div><strong>Contato:</strong> {pendency.contato_cliente_nome}{pendency.contato_cliente_email ? ` · ${pendency.contato_cliente_email}` : ""}{pendency.contato_cliente_telefone ? ` · ${pendency.contato_cliente_telefone}` : ""}</div>}
            <div><strong>Descrição:</strong> {pendency.descricao}</div>
            <div><strong>Status:</strong> {STATUS_LABELS[pendency.status as PendencyStatus]} · <strong>Prioridade:</strong> {PRIORIDADE_LABELS[pendency.prioridade as PendencyPrioridade]}</div>
            <div><strong>Cadência:</strong> {pendency.followup_cadence_days} dia(s) · próximo lembrete: {pendency.next_followup_at ? new Date(pendency.next_followup_at).toLocaleString("pt-BR") : "—"}</div>
            {pendency.resolution_notes && <div><strong>Resolução:</strong> {pendency.resolution_notes}</div>}
          </div>

          {pendency.tipo === "externa" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">
                  Respostas do cliente ({entregues}/{totalItems} entregues)
                </h3>
                {(pendency as any).last_client_submit_at && (
                  <span className="text-[11px] text-muted-foreground">
                    Último envio: {new Date((pendency as any).last_client_submit_at).toLocaleString("pt-BR")}
                  </span>
                )}
              </div>
              {totalItems === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum item cadastrado.</p>
              ) : (
                <ul className="space-y-3">
                  {items.map((it: any) => {
                    const itemResps = responses.filter((r: any) => r.item_id === it.id);
                    const itemComms = itemComments.filter((c: any) => c.item_id === it.id);
                    return (
                      <li key={it.id} className="border rounded-md p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{it.titulo}</div>
                            {it.descricao && <div className="text-xs text-muted-foreground mt-0.5">{it.descricao}</div>}
                          </div>
                          <span className={cn(
                            "text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap",
                            it.status === "entregue"
                              ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                              : "bg-amber-500/15 text-amber-700 border-amber-500/30"
                          )}>
                            {it.status === "entregue" ? "Entregue" : "Pendente"}
                          </span>
                        </div>

                        {itemResps.length === 0 && itemComms.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground italic">Sem respostas ainda.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {itemResps.map((r: any) => (
                              <div key={r.id} className="text-xs bg-muted/40 rounded p-2">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="font-semibold">{r.sender_nome || "Cliente"}</span>
                                  <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                                </div>
                                {r.tipo === "arquivo" && r.arquivo_path ? (
                                  <button
                                    type="button"
                                    onClick={() => openAttachment(r.arquivo_path)}
                                    className="text-primary hover:underline inline-flex items-center gap-1"
                                  >
                                    <ExternalLink className="w-3 h-3" /> {r.arquivo_nome || "Baixar anexo"}
                                  </button>
                                ) : (
                                  <div className="whitespace-pre-wrap">{r.texto}</div>
                                )}
                              </div>
                            ))}
                            {itemComms.map((c: any) => (
                              <div key={c.id} className="text-xs border-l-2 border-blue-400 bg-blue-500/5 rounded-r p-2">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="font-semibold">💬 {c.sender_nome || "Cliente"}</span>
                                  <span className="text-muted-foreground">{new Date(c.created_at).toLocaleString("pt-BR")}</span>
                                </div>
                                <div className="whitespace-pre-wrap">{c.texto}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold mb-2">Histórico de cobranças ({comms.length})</h3>
            {comms.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma cobrança registrada ainda.</p>
            ) : (
              <ul className="space-y-2">
                {comms.map((c) => (
                  <li key={c.id} className="border rounded-md p-2 text-xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-semibold">{CANAL_LABELS[c.canal]}</span>
                      <span className="text-muted-foreground">{new Date(c.realizado_em).toLocaleString("pt-BR")}</span>
                    </div>
                    <div>{c.descricao}</div>
                    {c.resposta_recebida && <div className="mt-1 text-emerald-600">↩ Resposta: {c.resposta_descricao || "(sem detalhes)"}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

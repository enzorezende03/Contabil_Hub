import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
  ReferenceLine,
} from "recharts";
import { RefreshCw, TrendingDown, TrendingUp, AlertTriangle, Download, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const INDICATOR_TO_DEMAND_TYPE: Record<string, string | "all"> = {
  lancamentos_pendentes: "lancamentos",
  conciliacao_bancaria_pendente: "conciliacao_bancaria",
  conciliacao_contabil_pendente: "conciliacao_contabil",
  fechamento_mensal_pendente: "fechamento",
  fechamento_anual_pendente: "all",
};

type SnapshotRow = {
  snapshot_date: string;
  iso_week: string;
  indicador: string;
  unidade: string | null;
  tributacao: string | null;
  valor: number;
};

const BACKLOG_INDICATORS = [
  { key: "lancamentos_pendentes", label: "Lançamentos pendentes", velocityKey: "velocity_lancamentos" },
  { key: "conciliacao_bancaria_pendente", label: "Conciliação bancária", velocityKey: "velocity_conciliacao_bancaria" },
  { key: "conciliacao_contabil_pendente", label: "Conciliação contábil", velocityKey: "velocity_conciliacao_contabil" },
  { key: "fechamento_mensal_pendente", label: "Fechamento mensal", velocityKey: "velocity_fechamento" },
  { key: "fechamento_anual_pendente", label: "Fechamento anual pendente", velocityKey: null as string | null },
  { key: "revisao_pendente", label: "Revisões aguardando", velocityKey: null as string | null },
] as const;

const UNIDADES = [
  { value: "all", label: "Todas as unidades" },
  { value: "2m_contabilidade", label: "2M Contabilidade" },
  { value: "2m_saude", label: "2M Saúde" },
];

const TRIBUTACOES = [
  { value: "all", label: "Todas as tributações" },
  { value: "simples_nacional", label: "Simples Nacional" },
  { value: "lucro_presumido", label: "Lucro Presumido" },
  { value: "lucro_real", label: "Lucro Real" },
];

function formatWeekRange(snapshotDate: string) {
  const d = new Date(snapshotDate + "T00:00:00");
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  const fmt = (x: Date) => x.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${fmt(d)} a ${fmt(end)}`;
}

function getCurrentIsoWeek(): string {
  const d = new Date();
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export default function ControleGerencial() {
  const queryClient = useQueryClient();
  const [unidade, setUnidade] = useState<string>("all");
  const [tributacao, setTributacao] = useState<string>("all");
  const [drilldown, setDrilldown] = useState<{ key: string; label: string } | null>(null);

  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ["backlog-snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backlog_snapshots" as any)
        .select("*")
        .order("snapshot_date", { ascending: true });
      if (error) throw error;
      return ((data || []) as unknown) as SnapshotRow[];
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-backlog-snapshot", {
        body: { force: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Snapshot atualizado");
      queryClient.invalidateQueries({ queryKey: ["backlog-snapshots"] });
    },
    onError: (e: any) => toast.error("Falha ao atualizar: " + (e?.message || "erro")),
  });

  // Filter rows by selected dimension
  const filtered = useMemo(() => {
    const u = unidade === "all" ? null : unidade;
    const t = tributacao === "all" ? null : tributacao;
    return snapshots.filter((r) => r.unidade === u && r.tributacao === t);
  }, [snapshots, unidade, tributacao]);

  // Group rows by indicador → sorted by date
  const seriesByIndicator = useMemo(() => {
    const m = new Map<string, SnapshotRow[]>();
    for (const r of filtered) {
      if (!m.has(r.indicador)) m.set(r.indicador, []);
      m.get(r.indicador)!.push(r);
    }
    for (const [k, v] of m) {
      v.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      m.set(k, v);
    }
    return m;
  }, [filtered]);

  // Latest snapshot meta
  const latestDate = useMemo(() => {
    const dates = Array.from(new Set(snapshots.map((s) => s.snapshot_date))).sort();
    return dates[dates.length - 1] || null;
  }, [snapshots]);

  const burndownData = useMemo(() => {
    // last 12 weeks per backlog indicator (skip velocity/anual/revisao to keep readable)
    const indicatorKeys = ["lancamentos_pendentes", "conciliacao_bancaria_pendente", "conciliacao_contabil_pendente", "fechamento_mensal_pendente"];
    const allDates = Array.from(new Set(filtered.map((r) => r.snapshot_date))).sort();
    const last12 = allDates.slice(-12);
    return last12.map((d) => {
      const row: any = { date: d.slice(5) };
      for (const k of indicatorKeys) {
        const r = filtered.find((x) => x.snapshot_date === d && x.indicador === k);
        row[k] = r?.valor ?? 0;
      }
      return row;
    });
  }, [filtered]);

  const velocityData = useMemo(() => {
    const keys = ["velocity_lancamentos", "velocity_conciliacao_bancaria", "velocity_conciliacao_contabil", "velocity_fechamento"];
    const allDates = Array.from(new Set(filtered.map((r) => r.snapshot_date))).sort();
    const last8 = allDates.slice(-8);
    return last8.map((d) => {
      const row: any = { date: d.slice(5) };
      for (const k of keys) {
        const r = filtered.find((x) => x.snapshot_date === d && x.indicador === k);
        row[k] = r?.valor ?? 0;
      }
      return row;
    });
  }, [filtered]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Controle Gerencial</h1>
            <p className="text-sm text-muted-foreground">
              {latestDate
                ? `Semana de ${formatWeekRange(latestDate)} — snapshot ${new Date(latestDate).toLocaleDateString("pt-BR")}`
                : "Sem snapshots ainda"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={unidade} onValueChange={setUnidade}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNIDADES.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={tributacao} onValueChange={setTributacao}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRIBUTACOES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              <RefreshCw className={`w-4 h-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
              Atualizar agora
            </Button>
            <Button asChild size="sm">
              <Link to={`/controle-gerencial/briefing/${getCurrentIsoWeek()}`}>
                Briefing semanal
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link to="/controle-gerencial/briefings">Histórico</Link>
            </Button>
          </div>
        </header>

        {/* KPIs */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)
            : BACKLOG_INDICATORS.map((ind) => (
                <KpiCard
                  key={ind.key}
                  label={ind.label}
                  series={seriesByIndicator.get(ind.key) || []}
                  onClick={() => setDrilldown({ key: ind.key, label: ind.label })}
                />
              ))}
        </section>

        {/* Burndown */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Burndown — últimas 12 semanas</h2>
            <span className="text-xs text-muted-foreground">Backlog por tipo</span>
          </div>
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : burndownData.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={burndownData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="lancamentos_pendentes" name="Lançamentos" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="conciliacao_bancaria_pendente" name="Concil. bancária" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="conciliacao_contabil_pendente" name="Concil. contábil" stroke="hsl(var(--chart-3, 200 70% 50%))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="fechamento_mensal_pendente" name="Fechamento" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Velocity + ETA */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h2 className="font-semibold mb-3">Velocity — entregas por semana</h2>
            {isLoading ? (
              <Skeleton className="h-64" />
            ) : velocityData.length === 0 ? (
              <EmptyChart />
            ) : (
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={velocityData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="velocity_lancamentos" stackId="a" name="Lançamentos" fill="hsl(var(--primary))" />
                    <Bar dataKey="velocity_conciliacao_bancaria" stackId="a" name="Concil. banc." fill="hsl(var(--accent))" />
                    <Bar dataKey="velocity_conciliacao_contabil" stackId="a" name="Concil. cont." fill="hsl(var(--chart-3, 200 70% 50%))" />
                    <Bar dataKey="velocity_fechamento" stackId="a" name="Fechamento" fill="hsl(var(--destructive))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-3">Projeção (ETA pra zerar)</h2>
            <div className="space-y-2">
              {BACKLOG_INDICATORS.filter((b) => b.velocityKey).map((b) => (
                <EtaRow
                  key={b.key}
                  label={b.label}
                  backlog={seriesByIndicator.get(b.key) || []}
                  velocity={seriesByIndicator.get(b.velocityKey!) || []}
                />
              ))}
            </div>
          </Card>
        </div>

        <AdherenceBlock unidade={unidade} tributacao={tributacao} />

        <HeatmapBlock unidade={unidade} tributacao={tributacao} />

        <DrilldownSheet
          open={!!drilldown}
          onClose={() => setDrilldown(null)}
          indicator={drilldown}
          unidade={unidade}
          tributacao={tributacao}
        />

      </div>
    </AppLayout>
  );
}

function KpiCard({ label, series, onClick }: { label: string; series: SnapshotRow[]; onClick?: () => void }) {
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const value = last?.valor ?? 0;
  const delta = last && prev ? value - prev.valor : null;
  const spark = series.slice(-8).map((r) => ({ v: r.valor }));

  return (
    <Card
      className="p-4 flex flex-col gap-2 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground font-medium">{label}</div>
        <ChevronRight className="w-3 h-3 text-muted-foreground" />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="text-3xl font-medium tracking-tight">{value}</div>
        <div className="text-xs flex items-center gap-1">
          {delta === null ? (
            <span className="text-muted-foreground">—</span>
          ) : delta === 0 ? (
            <span className="text-muted-foreground">sem variação</span>
          ) : delta < 0 ? (
            <span className="text-emerald-600 flex items-center gap-0.5">
              <TrendingDown className="w-3 h-3" /> {delta} vs. sem. anterior
            </span>
          ) : (
            <span className="text-red-600 flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" /> +{delta} vs. sem. anterior
            </span>
          )}
        </div>
      </div>
      <div className="h-10 -mx-1">
        {spark.length > 1 ? (
          <ResponsiveContainer>
            <LineChart data={spark}>
              <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center text-[10px] text-muted-foreground">
            histórico em construção
          </div>
        )}
      </div>
    </Card>
  );
}

function EtaRow({ label, backlog, velocity }: { label: string; backlog: SnapshotRow[]; velocity: SnapshotRow[] }) {
  const lastBacklog = backlog[backlog.length - 1]?.valor ?? 0;
  // average velocity over last 4 weeks
  const recentVel = velocity.slice(-4).map((r) => r.valor);
  const avgVel = recentVel.length ? recentVel.reduce((a, b) => a + b, 0) / recentVel.length : 0;

  // Detect growth: last vs previous backlog
  const prevBacklog = backlog[backlog.length - 2]?.valor ?? lastBacklog;
  const growing = lastBacklog > prevBacklog;

  if (avgVel === 0 || (growing && backlog.length >= 2)) {
    return (
      <div className="flex items-center justify-between p-2 rounded-md bg-red-50 border border-red-200">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-red-700 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {avgVel === 0 ? "Sem velocity registrada" : "Backlog crescendo — capacidade insuficiente"}
          </div>
        </div>
        <div className="text-sm font-semibold text-red-700">{lastBacklog} pendentes</div>
      </div>
    );
  }

  const weeks = Math.ceil(lastBacklog / avgVel);
  const color =
    weeks <= 4 ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : weeks <= 8 ? "bg-amber-50 border-amber-200 text-amber-800"
    : "bg-red-50 border-red-200 text-red-800";

  return (
    <div className={`flex items-center justify-between p-2 rounded-md border ${color}`}>
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs">~{weeks} semanas no ritmo atual ({avgVel.toFixed(1)}/sem)</div>
      </div>
      <div className="text-sm font-semibold">{lastBacklog} pendentes</div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
      Histórico em construção — aguarde o próximo snapshot semanal.
    </div>
  );
}

type DrilldownRow = {
  client_name: string;
  unidade: string | null;
  tributacao: string | null;
  pendentes: number;
  demand_types: string[];
  ultima_atualizacao: string | null;
};

function DrilldownSheet({
  open,
  onClose,
  indicator,
  unidade,
  tributacao,
}: {
  open: boolean;
  onClose: () => void;
  indicator: { key: string; label: string } | null;
  unidade: string;
  tributacao: string;
}) {
  const indicatorKey = indicator?.key ?? "";
  const isReview = indicatorKey === "revisao_pendente";
  const isAnnual = indicatorKey === "fechamento_anual_pendente";
  const demandType = INDICATOR_TO_DEMAND_TYPE[indicatorKey];

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["drilldown", indicatorKey, unidade, tributacao],
    enabled: open && !!indicator,
    queryFn: async (): Promise<DrilldownRow[]> => {
      if (isReview) {
        const { data, error } = await supabase
          .from("review_submissions")
          .select("id, client_name, status, updated_at")
          .in("status", ["aguardando", "em_revisao"]);
        if (error) throw error;
        const map = new Map<string, DrilldownRow>();
        for (const r of (data || []) as any[]) {
          const key = r.client_name || "(sem cliente)";
          const cur = map.get(key) || { client_name: key, unidade: null, tributacao: null, pendentes: 0, demand_types: [], ultima_atualizacao: null };
          cur.pendentes += 1;
          if (!cur.ultima_atualizacao || r.updated_at > cur.ultima_atualizacao) cur.ultima_atualizacao = r.updated_at;
          map.set(key, cur);
        }
        return Array.from(map.values()).sort((a, b) => b.pendentes - a.pendentes);
      }

      let q = supabase
        .from("demand_status_entries")
        .select("client_name, demand_type, year, month, updated_at")
        .neq("status", "completed");

      if (isAnnual) {
        const currentYear = new Date().getFullYear().toString();
        q = q.in("demand_type", ["lancamentos", "conciliacao_bancaria", "conciliacao_contabil", "fechamento"]).eq("year", currentYear);
      } else if (demandType && demandType !== "all") {
        q = q.eq("demand_type", demandType);
      }

      const { data: entries, error } = await q;
      if (error) throw error;

      // join with clients for unidade/tributacao
      const clientNames = Array.from(new Set((entries || []).map((e: any) => e.client_name)));
      let clientMap = new Map<string, { unidade: string | null; tributacao: string | null }>();
      if (clientNames.length) {
        const { data: cs } = await supabase
          .from("clients")
          .select("razao_social, unidade, tributacao")
          .in("razao_social", clientNames);
        for (const c of (cs || []) as any[]) {
          clientMap.set(c.razao_social, { unidade: c.unidade, tributacao: c.tributacao });
        }
      }

      const map = new Map<string, DrilldownRow>();
      for (const e of (entries || []) as any[]) {
        const meta = clientMap.get(e.client_name) || { unidade: null, tributacao: null };
        if (unidade !== "all" && meta.unidade !== unidade) continue;
        if (tributacao !== "all" && meta.tributacao !== tributacao) continue;
        const cur = map.get(e.client_name) || {
          client_name: e.client_name,
          unidade: meta.unidade,
          tributacao: meta.tributacao,
          pendentes: 0,
          demand_types: [],
          ultima_atualizacao: null,
        };
        cur.pendentes += 1;
        if (!cur.demand_types.includes(e.demand_type)) cur.demand_types.push(e.demand_type);
        if (!cur.ultima_atualizacao || e.updated_at > cur.ultima_atualizacao) cur.ultima_atualizacao = e.updated_at;
        map.set(e.client_name, cur);
      }
      return Array.from(map.values()).sort((a, b) => b.pendentes - a.pendentes);
    },
  });

  const total = rows.reduce((s, r) => s + r.pendentes, 0);

  function exportCsv() {
    const header = ["Cliente", "Unidade", "Tributação", "Pendentes", "Tipos", "Última atualização"];
    const lines = [header.join(";")];
    for (const r of rows) {
      lines.push([
        `"${r.client_name.replace(/"/g, '""')}"`,
        r.unidade ?? "",
        r.tributacao ?? "",
        r.pendentes,
        r.demand_types.join("|"),
        r.ultima_atualizacao ? new Date(r.ultima_atualizacao).toLocaleString("pt-BR") : "",
      ].join(";"));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${indicatorKey}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{indicator?.label}</SheetTitle>
          <SheetDescription>
            {isLoading ? "Carregando..." : `${rows.length} clientes • ${total} pendências no total`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between mt-4 mb-2">
          <div className="text-xs text-muted-foreground">
            {unidade !== "all" && <Badge variant="outline" className="mr-1">{unidade}</Badge>}
            {tributacao !== "all" && <Badge variant="outline">{tributacao}</Badge>}
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
            <Download className="w-4 h-4" /> Exportar CSV
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-10">
            Nenhuma pendência encontrada com os filtros atuais.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="w-20 text-right">Pend.</TableHead>
                <TableHead>Tipos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 100).map((r) => (
                <TableRow key={r.client_name}>
                  <TableCell>
                    <div className="font-medium text-sm">{r.client_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.unidade || "—"} • {r.tributacao || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{r.pendentes}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.demand_types.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        r.demand_types.map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {rows.length > 100 && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Mostrando 100 de {rows.length} — use "Exportar CSV" para a lista completa.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// PR 5 — Heatmap cliente × competência
// ============================================================================

type HeatCell = {
  clientName: string;
  comp: string; // YYYY-MM
  typesPending: Set<string>;
  hasLate: boolean;
};

const HEAT_DEMAND_TYPES = ["lancamentos", "conciliacao_bancaria", "conciliacao_contabil", "fechamento"];

function HeatmapBlock({ unidade, tributacao }: { unidade: string; tributacao: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["heatmap-cliente-competencia", unidade, tributacao],
    staleTime: 60 * 60 * 1000, // 1h
    queryFn: async () => {
      // last 12 months (current included)
      const now = new Date();
      const months: { year: string; month: string; label: string; key: string }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = String(d.getFullYear());
        const m = String(d.getMonth() + 1).padStart(2, "0");
        months.push({ year: y, month: String(d.getMonth() + 1), label: `${m}/${y.slice(2)}`, key: `${y}-${m}` });
      }

      const minYear = months[0].year;

      let q = supabase
        .from("demand_status_entries")
        .select("client_name, demand_type, year, month, status")
        .neq("status", "completed")
        .in("demand_type", HEAT_DEMAND_TYPES)
        .gte("year", minYear);

      const { data: entries, error } = await q;
      if (error) throw error;

      // Join with clients for unidade/tributação
      const clientNames = Array.from(new Set((entries || []).map((e: any) => e.client_name)));
      const clientMap = new Map<string, { unidade: string | null; tributacao: string | null }>();
      if (clientNames.length) {
        const { data: cs } = await supabase
          .from("clients")
          .select("razao_social, unidade, tributacao")
          .in("razao_social", clientNames);
        for (const c of (cs || []) as any[]) {
          clientMap.set(c.razao_social, { unidade: c.unidade, tributacao: c.tributacao });
        }
      }

      // Build matrix
      const monthSet = new Set(months.map((m) => m.key));
      const matrix = new Map<string, Map<string, HeatCell>>();
      const totals = new Map<string, number>();

      for (const e of (entries || []) as any[]) {
        const meta = clientMap.get(e.client_name);
        if (!meta) continue;
        if (unidade !== "all" && meta.unidade !== unidade) continue;
        if (tributacao !== "all" && meta.tributacao !== tributacao) continue;

        const mm = String(e.month).padStart(2, "0");
        const key = `${e.year}-${mm}`;
        if (!monthSet.has(key)) continue;

        let row = matrix.get(e.client_name);
        if (!row) {
          row = new Map();
          matrix.set(e.client_name, row);
        }
        let cell = row.get(key);
        if (!cell) {
          cell = { clientName: e.client_name, comp: key, typesPending: new Set(), hasLate: false };
          row.set(key, cell);
        }
        cell.typesPending.add(e.demand_type);
        if (e.status === "late") cell.hasLate = true;

        totals.set(e.client_name, (totals.get(e.client_name) || 0) + 1);
      }

      // Top 30 clients by pending
      const topClients = Array.from(totals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([name]) => name);

      return { months, topClients, matrix };
    },
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Heatmap — cliente × competência</h2>
        <span className="text-xs text-muted-foreground">Top 30 • últimas 12 competências</span>
      </div>

      {isLoading ? (
        <Skeleton className="h-72" />
      ) : !data || data.topClients.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
          Nenhuma pendência nos filtros atuais.
        </div>
      ) : (
        <>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3">
            <LegendSwatch className="bg-emerald-200 border-emerald-300" label="OK" />
            <LegendSwatch className="bg-amber-200 border-amber-300" label="1-2 tipos" />
            <LegendSwatch className="bg-orange-300 border-orange-400" label="3+ tipos" />
            <LegendSwatch className="bg-red-500 border-red-600" label="Todos + atrasado" />
          </div>

          {/* Desktop grid */}
          <div className="hidden md:block overflow-x-auto">
            <div
              className="grid gap-0.5 min-w-fit"
              style={{
                gridTemplateColumns: `minmax(180px, 220px) repeat(${data.months.length}, minmax(38px, 1fr))`,
              }}
            >
              {/* header row */}
              <div />
              {data.months.map((m) => (
                <div key={m.key} className="text-[10px] text-muted-foreground text-center px-1 py-1 font-medium">
                  {m.label}
                </div>
              ))}

              {data.topClients.map((c) => (
                <HeatRow key={c} clientName={c} months={data.months} cells={data.matrix.get(c)} />
              ))}
            </div>
          </div>

          {/* Mobile: simplified list */}
          <div className="md:hidden space-y-1">
            {data.topClients.map((c) => {
              const row = data.matrix.get(c);
              const total = row ? Array.from(row.values()).reduce((s, x) => s + x.typesPending.size, 0) : 0;
              const monthsAffected = row?.size ?? 0;
              const cls = heatClassFromCount(monthsAffected >= 6 ? 4 : monthsAffected >= 3 ? 3 : monthsAffected >= 1 ? 2 : 0, false);
              return (
                <div key={c} className="flex items-center justify-between p-2 rounded border bg-card">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-3 h-3 rounded ${cls}`} />
                    <div className="text-sm truncate">{c}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{monthsAffected} comp • {total} pend</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

function HeatRow({
  clientName,
  months,
  cells,
}: {
  clientName: string;
  months: { key: string; label: string }[];
  cells: Map<string, HeatCell> | undefined;
}) {
  return (
    <>
      <div className="text-xs font-medium truncate pr-2 py-1.5 flex items-center" title={clientName}>
        {clientName}
      </div>
      {months.map((m) => {
        const c = cells?.get(m.key);
        const count = c?.typesPending.size ?? 0;
        const isFull = count >= HEAT_DEMAND_TYPES.length;
        const cls = heatClassFromCount(count, isFull && !!c?.hasLate);
        const tooltip = c
          ? `${clientName} • ${m.label}\n${count} tipo(s) pendente(s): ${Array.from(c.typesPending).join(", ")}${c.hasLate ? "\n⚠ atrasado" : ""}`
          : `${clientName} • ${m.label}\nSem pendências`;
        return (
          <div
            key={m.key}
            className={`h-7 rounded-sm border ${cls} hover:ring-2 hover:ring-primary/40 transition-all cursor-default`}
            title={tooltip}
          />
        );
      })}
    </>
  );
}

function heatClassFromCount(count: number, isCriticalLate: boolean): string {
  if (isCriticalLate) return "bg-red-500 border-red-600";
  if (count >= 3) return "bg-orange-300 border-orange-400";
  if (count >= 1) return "bg-amber-200 border-amber-300";
  return "bg-emerald-100 border-emerald-200";
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-3 h-3 rounded-sm border ${className}`} />
      <span>{label}</span>
    </div>
  );
}

// ============================================================================
// PR 6 — Aderência ao planejamento (semana corrente)
// ============================================================================

function getCurrentWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

type PlanningRow = {
  id: string;
  client: string;
  assignee: string | null;
  status: string;
  internal_deadline: string;
  updated_at: string;
  types: string[] | null;
};

function AdherenceBlock({ unidade, tributacao }: { unidade: string; tributacao: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["adherence-week", unidade, tributacao],
    queryFn: async () => {
      const { start, end } = getCurrentWeekRange();
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);

      const { data: plannings, error } = await supabase
        .from("plannings")
        .select("id, client, assignee, status, internal_deadline, updated_at, types")
        .gte("internal_deadline", startStr)
        .lte("internal_deadline", endStr);
      if (error) throw error;

      const list = (plannings || []) as PlanningRow[];

      let filtered = list;
      if (unidade !== "all" || tributacao !== "all") {
        const names = Array.from(new Set(list.map((p) => p.client)));
        const cmap = new Map<string, { unidade: string | null; tributacao: string | null }>();
        if (names.length) {
          const { data: cs } = await supabase
            .from("clients")
            .select("razao_social, unidade, tributacao")
            .in("razao_social", names);
          for (const c of (cs || []) as any[]) cmap.set(c.razao_social, c);
        }
        filtered = list.filter((p) => {
          const m = cmap.get(p.client);
          if (!m) return false;
          if (unidade !== "all" && m.unidade !== unidade) return false;
          if (tributacao !== "all" && m.tributacao !== tributacao) return false;
          return true;
        });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const total = filtered.length;
      const completed = filtered.filter((p) => p.status === "completed");
      const completedOnTime = completed.filter(
        (p) => new Date(p.updated_at) <= new Date(p.internal_deadline + "T23:59:59"),
      );
      const overdue = filtered.filter(
        (p) => p.status !== "completed" && new Date(p.internal_deadline) < today,
      );
      const adherencePct = total === 0 ? 0 : Math.round((completedOnTime.length / total) * 100);

      return {
        weekRange: `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} a ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`,
        total,
        completed: completed.length,
        completedOnTime: completedOnTime.length,
        overdue,
        adherencePct,
      };
    },
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold">Aderência ao planejamento</h2>
          <p className="text-xs text-muted-foreground">
            Semana corrente {data ? `(${data.weekRange})` : ""}
          </p>
        </div>
        <Link to="/planejamento" className="text-xs text-primary hover:underline">
          Ver planejamento →
        </Link>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !data || data.total === 0 ? (
        <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
          Nenhum planejamento com prazo nesta semana.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl font-medium tracking-tight">{data.adherencePct}%</div>
                <div className="text-xs text-muted-foreground">
                  {data.completedOnTime} concluídos no prazo de {data.total} planejados
                </div>
              </div>
              <Badge
                variant="outline"
                className={
                  data.adherencePct >= 80
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : data.adherencePct >= 60
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-red-300 bg-red-50 text-red-800"
                }
              >
                {data.adherencePct >= 80 ? "Saudável" : data.adherencePct >= 60 ? "Atenção" : "Crítico"}
              </Badge>
            </div>
            <Progress value={data.adherencePct} className="h-2" />
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <Stat label="Planejados" value={data.total} />
              <Stat label="Concluídos" value={data.completed} accent="text-emerald-700" />
              <Stat label="Atrasados" value={data.overdue.length} accent="text-red-700" />
            </div>
          </div>

          <div className="border rounded-md p-2 bg-muted/30">
            <div className="text-xs font-medium mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-red-600" /> Atrasos da semana
            </div>
            {data.overdue.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">Nenhum atraso 🎉</div>
            ) : (
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {data.overdue.slice(0, 8).map((p) => (
                  <li key={p.id} className="text-xs flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{p.client}</span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {new Date(p.internal_deadline + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    </span>
                  </li>
                ))}
                {data.overdue.length > 8 && (
                  <li className="text-[10px] text-muted-foreground pt-1">
                    +{data.overdue.length - 8} outros atrasos
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-md border bg-card p-2">
      <div className={`text-lg font-semibold ${accent || ""}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}



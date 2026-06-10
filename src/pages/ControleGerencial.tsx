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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { RefreshCw, AlertTriangle, Download, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type SnapshotRow = {
  snapshot_date: string;
  iso_week: string;
  indicador: string;
  unidade: string | null;
  tributacao: string | null;
  valor: number;
};

type Overview = {
  per_type: Record<string, number>;
  by_comp: { comp: string; empresas: number; pendencias: number }[];
  by_trib: Record<string, number>;
  top_clients: { client_name: string; tributacao: string | null; unidade: string | null; backlog: number; oldest: string }[];
  fechamento_anual: number;
  revisao_pendente: number;
  computed_at: string;
};

const INDICATOR_TO_TYPE: Record<string, string> = {
  lancamentos_pendentes: "lancamentos",
  conciliacao_bancaria_pendente: "conciliacao_bancaria",
  conciliacao_contabil_pendente: "conciliacao_contabil",
  fechamento_mensal_pendente: "fechamento",
};

const BACKLOG_INDICATORS = [
  { key: "lancamentos_pendentes", label: "Lançamentos pendentes", sub: "meses × empresas com lançamento não concluído" },
  { key: "conciliacao_bancaria_pendente", label: "Conciliação bancária", sub: "meses × empresas com banco não conciliado" },
  { key: "conciliacao_contabil_pendente", label: "Conciliação contábil", sub: "meses × empresas com contábil não conciliado" },
  { key: "fechamento_mensal_pendente", label: "Fechamento mensal", sub: "meses × empresas com fechamento em aberto" },
  { key: "fechamento_anual_pendente", label: "Fechamento anual pendente", sub: "empresas com algum mês do ano atual em aberto" },
  { key: "revisao_pendente", label: "Revisões aguardando", sub: "submissões aguardando revisão" },
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

const TRIB_LABELS: Record<string, string> = {
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
  "(sem)": "Sem tributação",
};

function getCurrentIsoWeek(): string {
  const d = new Date();
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ControleGerencial() {
  const queryClient = useQueryClient();
  const [unidade, setUnidade] = useState<string>("all");
  const [tributacao, setTributacao] = useState<string>("all");
  const [drilldown, setDrilldown] = useState<{ key: string; label: string } | null>(null);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["backlog-overview", unidade, tributacao],
    queryFn: async (): Promise<Overview> => {
      const { data, error } = await supabase.rpc("backlog_overview" as any, {
        p_unidade: unidade === "all" ? null : unidade,
        p_tributacao: tributacao === "all" ? null : tributacao,
      });
      if (error) throw error;
      return data as Overview;
    },
  });

  const { data: snapshots = [] } = useQuery({
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
      toast.success("Backlog atualizado");
      queryClient.invalidateQueries({ queryKey: ["backlog-overview"] });
      queryClient.invalidateQueries({ queryKey: ["backlog-snapshots"] });
    },
    onError: (e: any) => toast.error("Falha ao atualizar: " + (e?.message || "erro")),
  });

  const valorFor = (key: string): number => {
    if (!overview) return 0;
    if (key === "fechamento_anual_pendente") return overview.fechamento_anual;
    if (key === "revisao_pendente") return overview.revisao_pendente;
    const t = INDICATOR_TO_TYPE[key];
    return overview.per_type?.[t] ?? 0;
  };

  // Snapshot filtered for burndown
  const filtered = useMemo(() => {
    const u = unidade === "all" ? null : unidade;
    const t = tributacao === "all" ? null : tributacao;
    return snapshots.filter((r) => r.unidade === u && r.tributacao === t);
  }, [snapshots, unidade, tributacao]);

  const snapshotDates = useMemo(() => Array.from(new Set(filtered.map((r) => r.snapshot_date))).sort(), [filtered]);
  const hasTrend = snapshotDates.length >= 4;

  const burndownData = useMemo(() => {
    const keys = ["lancamentos_pendentes", "conciliacao_bancaria_pendente", "conciliacao_contabil_pendente", "fechamento_mensal_pendente"];
    return snapshotDates.slice(-12).map((d) => {
      const row: any = { date: d.slice(5) };
      for (const k of keys) {
        const r = filtered.find((x) => x.snapshot_date === d && x.indicador === k);
        row[k] = r?.valor ?? 0;
      }
      return row;
    });
  }, [filtered, snapshotDates]);

  const velocityData = useMemo(() => {
    const keys = ["velocity_lancamentos", "velocity_conciliacao_bancaria", "velocity_conciliacao_contabil", "velocity_fechamento"];
    return snapshotDates.slice(-8).map((d) => {
      const row: any = { date: d.slice(5) };
      for (const k of keys) {
        const r = filtered.find((x) => x.snapshot_date === d && x.indicador === k);
        row[k] = r?.valor ?? 0;
      }
      return row;
    });
  }, [filtered, snapshotDates]);

  const latestSnapshotDate = snapshotDates[snapshotDates.length - 1];

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Controle gerencial</h1>
            <p className="text-sm text-muted-foreground">
              Backlog total do escritório
              {overview?.computed_at && <> · atualizado em {fmtDateTime(overview.computed_at)}</>}
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
          {overviewLoading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)
            : BACKLOG_INDICATORS.map((ind) => (
                <KpiCard
                  key={ind.key}
                  label={ind.label}
                  sub={ind.sub}
                  value={valorFor(ind.key)}
                  onClick={() => setDrilldown({ key: ind.key, label: ind.label })}
                />
              ))}
        </section>

        {/* Distribuição do backlog */}
        <DistribuicaoSection overview={overview} loading={overviewLoading} />

        {/* Top 10 empresas */}
        <TopEmpresasTable overview={overview} loading={overviewLoading} />

        {/* Tendência semanal */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Tendência semanal — burndown</h2>
            <span className="text-xs text-muted-foreground">{snapshotDates.length} sem. registrada(s)</span>
          </div>
          {!hasTrend ? (
            <div className="h-32 flex flex-col items-center justify-center text-sm text-muted-foreground gap-1">
              <span>Tendência ficará disponível após 4 semanas de snapshots.</span>
              <span className="text-xs">Hoje temos: {snapshotDates.length} semana(s) registrada(s).</span>
            </div>
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

        {hasTrend && (
          <Card className="p-4">
            <h2 className="font-semibold mb-3">Velocity — entregas por semana</h2>
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
          </Card>
        )}

        <AdherenceBlock unidade={unidade} tributacao={tributacao} />

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t text-xs text-muted-foreground">
          <span>
            Última atualização: {overview?.computed_at ? fmtDateTime(overview.computed_at) : "—"}
            {latestSnapshotDate && (
              <> · snapshot semanal: {new Date(latestSnapshotDate).toLocaleDateString("pt-BR")}</>
            )}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw className={`w-4 h-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            Atualizar agora
          </Button>
        </div>

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

function KpiCard({ label, sub, value, onClick }: {
  label: string;
  sub: string;
  value: number;
  onClick?: () => void;
}) {
  return (
    <Card
      className="p-4 flex flex-col gap-1 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium truncate">{label}</div>
        <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
      </div>
      <div className="text-3xl font-medium tracking-tight">{value.toLocaleString("pt-BR")}</div>
      <div className="text-xs text-muted-foreground leading-tight">{sub}</div>
    </Card>
  );
}

// ============================================================================
// Distribuição do backlog
// ============================================================================

const TRIB_COLORS: Record<string, string> = {
  simples_nacional: "hsl(var(--primary))",
  lucro_presumido: "hsl(var(--accent))",
  lucro_real: "hsl(var(--destructive))",
  "(sem)": "hsl(var(--muted-foreground))",
};

function DistribuicaoSection({ overview, loading }: { overview?: Overview; loading: boolean }) {
  const compData = useMemo(() => {
    if (!overview) return [];
    return [...overview.by_comp]
      .sort((a, b) => a.comp.localeCompare(b.comp))
      .map((r) => ({ ...r, label: r.comp.slice(2).replace("-", "/") }));
  }, [overview]);

  const tribData = useMemo(() => {
    if (!overview) return [];
    return Object.entries(overview.by_trib).map(([k, v]) => ({ name: TRIB_LABELS[k] || k, value: v, key: k }));
  }, [overview]);

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="p-4 lg:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Backlog por competência</h2>
          <span className="text-xs text-muted-foreground">empresas com pendência</span>
        </div>
        {loading ? (
          <Skeleton className="h-56" />
        ) : compData.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Sem dados.</div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={compData} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={50} />
                <Tooltip />
                <Bar dataKey="empresas" name="Empresas com pendência" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Por tributação</h2>
          <span className="text-xs text-muted-foreground">peso do backlog</span>
        </div>
        {loading ? (
          <Skeleton className="h-56" />
        ) : tribData.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Sem dados.</div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={tribData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75}>
                  {tribData.map((d) => (
                    <Cell key={d.key} fill={TRIB_COLORS[d.key] || "hsl(var(--muted))"} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => v.toLocaleString("pt-BR")} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </section>
  );
}

// ============================================================================
// Top 10 empresas
// ============================================================================

function TopEmpresasTable({ overview, loading }: { overview?: Overview; loading: boolean }) {
  const rows = overview?.top_clients || [];

  function exportXlsx() {
    const header = ["Empresa", "Tributação", "Unidade", "Backlog", "Mais antigo"];
    const lines = [header.join(";")];
    for (const r of rows) {
      lines.push([
        `"${r.client_name.replace(/"/g, '""')}"`,
        TRIB_LABELS[r.tributacao || ""] || r.tributacao || "",
        r.unidade || "",
        r.backlog,
        r.oldest ? new Date(r.oldest).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }) : "",
      ].join(";"));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `top-empresas-backlog-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Lista exportada");
  }

  function monthsOld(oldest: string): number {
    const d = new Date(oldest);
    const now = new Date();
    return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold">Top 10 empresas com mais backlog</h2>
          <p className="text-xs text-muted-foreground">linhas em vermelho indicam &gt; 3 meses em atraso</p>
        </div>
        <Button size="sm" variant="outline" onClick={exportXlsx} disabled={!rows.length}>
          <Download className="w-4 h-4" /> Exportar
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-56" />
      ) : rows.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">Sem empresas com backlog.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Tributação</TableHead>
              <TableHead className="text-right">Backlog total</TableHead>
              <TableHead className="text-right">Mais antigo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const meses = monthsOld(r.oldest);
              const isLate = meses > 3;
              return (
                <TableRow key={r.client_name} className={isLate ? "bg-red-50 hover:bg-red-100" : ""}>
                  <TableCell>
                    <Link
                      to={`/competencias?cliente=${encodeURIComponent(r.client_name)}`}
                      className="font-medium text-sm hover:underline"
                    >
                      {r.client_name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{r.unidade || "—"}</div>
                  </TableCell>
                  <TableCell className="text-xs">{TRIB_LABELS[r.tributacao || ""] || r.tributacao || "—"}</TableCell>
                  <TableCell className="text-right font-semibold">{r.backlog.toLocaleString("pt-BR")}</TableCell>
                  <TableCell className={`text-right text-xs ${isLate ? "text-red-700 font-medium" : "text-muted-foreground"}`}>
                    {meses} {meses === 1 ? "mês" : "meses"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

// ============================================================================
// Drill-down (usa backlog_drilldown RPC)
// ============================================================================

type DrillRow = {
  client_name: string;
  unidade: string | null;
  tributacao: string | null;
  year: number;
  month: number;
  demand_type: string;
};

function DrilldownSheet({ open, onClose, indicator, unidade, tributacao }: {
  open: boolean;
  onClose: () => void;
  indicator: { key: string; label: string } | null;
  unidade: string;
  tributacao: string;
}) {
  const indicatorKey = indicator?.key ?? "";
  const isReview = indicatorKey === "revisao_pendente";
  const isAnnual = indicatorKey === "fechamento_anual_pendente";

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["drilldown", indicatorKey, unidade, tributacao],
    enabled: open && !!indicator,
    queryFn: async (): Promise<DrillRow[]> => {
      if (isReview) {
        const { data, error } = await supabase
          .from("review_submissions")
          .select("client_name, status, updated_at")
          .in("status", ["aguardando", "em_revisao"]);
        if (error) throw error;
        return (data || []).map((r: any) => ({
          client_name: r.client_name || "(sem cliente)",
          unidade: null, tributacao: null, year: 0, month: 0, demand_type: "revisao",
        }));
      }
      const demandTypeArg = isAnnual ? "all" : (INDICATOR_TO_TYPE[indicatorKey] || "all");
      const { data, error } = await supabase.rpc("backlog_drilldown" as any, {
        p_demand_type: demandTypeArg,
        p_unidade: unidade === "all" ? null : unidade,
        p_tributacao: tributacao === "all" ? null : tributacao,
        p_only_current_year: isAnnual,
      });
      if (error) throw error;
      return (data || []) as DrillRow[];
    },
  });

  // Group by client
  const grouped = useMemo(() => {
    const map = new Map<string, { client_name: string; unidade: string | null; tributacao: string | null; pendentes: number; types: Set<string> }>();
    for (const r of rows) {
      const cur = map.get(r.client_name) || { client_name: r.client_name, unidade: r.unidade, tributacao: r.tributacao, pendentes: 0, types: new Set<string>() };
      cur.pendentes += 1;
      cur.types.add(r.demand_type);
      map.set(r.client_name, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.pendentes - a.pendentes);
  }, [rows]);

  function exportCsv() {
    const header = ["Cliente", "Unidade", "Tributação", "Ano", "Mês", "Tipo"];
    const lines = [header.join(";")];
    for (const r of rows) {
      lines.push([
        `"${r.client_name.replace(/"/g, '""')}"`,
        r.unidade ?? "",
        r.tributacao ?? "",
        r.year || "",
        r.month || "",
        r.demand_type,
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
            {isLoading ? "Carregando..." : `${grouped.length} empresas • ${rows.length.toLocaleString("pt-BR")} células pendentes`}
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
        ) : grouped.length === 0 ? (
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
              {grouped.slice(0, 100).map((r) => (
                <TableRow key={r.client_name}>
                  <TableCell>
                    <div className="font-medium text-sm">{r.client_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.unidade || "—"} • {TRIB_LABELS[r.tributacao || ""] || r.tributacao || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{r.pendentes}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(r.types).map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {grouped.length > 100 && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Mostrando 100 de {grouped.length} empresas — use "Exportar CSV" para a lista completa.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Aderência ao planejamento (mantido)
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

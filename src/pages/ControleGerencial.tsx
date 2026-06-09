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

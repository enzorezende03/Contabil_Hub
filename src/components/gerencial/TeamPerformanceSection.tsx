import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { ROLE_LABELS, type TeamRole } from "@/lib/types";
import { Maximize2, ChevronRight } from "lucide-react";

type Row = {
  id: string;
  origin: "demand" | "planning";
  assignee: string;
  client: string;
  status: string;
  internal_deadline: string | null;
  completed_at: string | null;
  created_at: string | null;
};

type Bucket = "completed" | "open" | "late" | "pending";

const BUCKET_LABELS: Record<Bucket, string> = {
  completed: "Concluídas",
  open: "Em aberto",
  late: "Atrasadas",
  pending: "Pendências",
};

const BUCKET_COLORS: Record<Bucket, string> = {
  completed: "hsl(var(--status-completed))",
  open: "hsl(var(--status-waiting))",
  late: "hsl(var(--status-late))",
  pending: "hsl(var(--status-blocked))",
};

const PERIODS = [
  { value: "week", label: "Semana atual" },
  { value: "month", label: "Mês atual" },
  { value: "quarter", label: "Últimos 90 dias" },
  { value: "year", label: "Ano atual" },
  { value: "all", label: "Todo o período" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

function periodRange(p: Period): { start: Date; end: Date } | null {
  if (p === "all") return null;
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (p === "week") {
    const day = start.getDay() || 7; // segunda = 1
    start.setDate(start.getDate() - (day - 1));
    const e = new Date(start);
    e.setDate(e.getDate() + 6);
    e.setHours(23, 59, 59, 999);
    return { start, end: e };
  }
  if (p === "month") {
    start.setDate(1);
    const e = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end: e };
  }
  if (p === "quarter") {
    start.setDate(start.getDate() - 89);
    return { start, end };
  }
  start.setMonth(0, 1);
  return { start, end: new Date(start.getFullYear(), 11, 31, 23, 59, 59, 999) };
}

function inPeriod(r: Row, range: { start: Date; end: Date } | null) {
  if (!range) return true;
  const ref = r.completed_at || r.internal_deadline || r.created_at;
  if (!ref) return false;
  const t = new Date(ref).getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}

function classify(r: Row): Bucket {
  if (r.status === "completed") return "completed";
  if (r.status === "waiting_info" || r.status === "blocked") return "pending";
  if (r.status === "late") return "late";
  if (r.internal_deadline) {
    const d = new Date(r.internal_deadline);
    d.setHours(23, 59, 59, 999);
    if (d.getTime() < Date.now()) return "late";
  }
  return "open";
}

function emptyCounts() {
  return { completed: 0, open: 0, late: 0, pending: 0 } as Record<Bucket, number>;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
}

function Donut({
  counts,
  size,
  centerLabel,
  showTooltip,
}: {
  counts: Record<Bucket, number>;
  size: number;
  centerLabel: string;
  showTooltip?: boolean;
}) {
  const data = (Object.keys(BUCKET_LABELS) as Bucket[])
    .map((k) => ({ name: BUCKET_LABELS[k], value: counts[k], key: k }))
    .filter((d) => d.value > 0);
  const outer = size / 2;
  const inner = outer * 0.72;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer>
        <PieChart>
          {showTooltip && <Tooltip />}
          <Pie
            data={data.length ? data : [{ name: "Sem dados", value: 1, key: "open" as Bucket }]}
            dataKey="value"
            innerRadius={inner}
            outerRadius={outer}
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive={false}
          >
            {(data.length ? data : [{ key: "open" as Bucket }]).map((d, i) => (
              <Cell key={i} fill={data.length ? BUCKET_COLORS[d.key] : "hsl(var(--muted))"} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="font-semibold tracking-tight" style={{ fontSize: size * 0.2 }}>
          {centerLabel}
        </span>
      </div>
    </div>
  );
}

export default function TeamPerformanceSection() {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [openMember, setOpenMember] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["team-performance"],
    queryFn: async () => {
      const cols = "id, assignee, client, status, internal_deadline, completed_at, created_at";
      const [demands, plannings, profiles] = await Promise.all([
        supabase.from("demands").select(cols),
        supabase.from("plannings").select(cols),
        supabase.from("profiles").select("user_id, display_name, role").is("archived_at", null),
      ]);
      if (demands.error) throw demands.error;
      if (plannings.error) throw plannings.error;
      if (profiles.error) throw profiles.error;
      return {
        rows: [
          ...(demands.data || []).map((d: any) => ({ ...d, origin: "demand" as const })),
          ...(plannings.data || []).map((p: any) => ({ ...p, origin: "planning" as const })),
        ] as Row[],
        profiles: (profiles.data || []) as { user_id: string; display_name: string; role: string }[],
      };
    },
    staleTime: 60_000,
  });

  const range = useMemo(() => periodRange(period), [period]);

  const rows = useMemo(
    () => (data?.rows || []).filter((r) => inPeriod(r, range)),
    [data, range]
  );

  const { total, byMember } = useMemo(() => {
    const total = emptyCounts();
    const map = new Map<string, Record<Bucket, number>>();
    for (const r of rows) {
      const b = classify(r);
      total[b] += 1;
      if (!map.has(r.assignee)) map.set(r.assignee, emptyCounts());
      map.get(r.assignee)![b] += 1;
    }
    const byMember = (data?.profiles || [])
      .map((p) => {
        const counts = map.get(p.user_id) || emptyCounts();
        const sum = counts.completed + counts.open + counts.late + counts.pending;
        return { ...p, counts, sum, pct: sum ? Math.round((counts.completed / sum) * 100) : 0 };
      })
      .filter((m) => m.sum > 0)
      .sort((a, b) => b.sum - a.sum);
    return { total, byMember };
  }, [rows, data]);

  const totalSum = total.completed + total.open + total.late + total.pending;

  const filtered = byMember.filter((m) =>
    m.display_name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const member = byMember.find((m) => m.user_id === openMember);
  const memberRows = useMemo(
    () =>
      rows
        .filter((r) => r.assignee === openMember)
        .sort((a, b) => (a.internal_deadline || "").localeCompare(b.internal_deadline || "")),
    [rows, openMember]
  );

  const compareData = useMemo(
    () =>
      byMember.map((m) => ({
        name: m.display_name.split(" ")[0],
        Concluídas: m.counts.completed,
        "Em aberto": m.counts.open,
        Atrasadas: m.counts.late,
        Pendências: m.counts.pending,
      })),
    [byMember]
  );

  const periodLabel = PERIODS.find((p) => p.value === period)?.label ?? "";

  if (isLoading) {
    return (
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-72" />
        <Skeleton className="h-72 lg:col-span-2" />
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Performance da equipe</h2>
          <p className="text-xs text-muted-foreground">
            Solicitações de clientes + planejamento, por responsável · {periodLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Buscar colaborador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:w-56"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Performance geral</h3>
            <Button size="sm" variant="ghost" onClick={() => setCompareOpen(true)}>
              <Maximize2 className="w-3.5 h-3.5 mr-1" /> Expandir
            </Button>
          </div>
          <div className="flex justify-center">
            <Donut counts={total} size={200} centerLabel={totalSum.toLocaleString("pt-BR")} showTooltip />
          </div>
          <ul className="mt-4 space-y-1.5">
            {(Object.keys(BUCKET_LABELS) as Bucket[]).map((k) => (
              <li key={k} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: BUCKET_COLORS[k] }} />
                <span className="text-muted-foreground flex-1">{BUCKET_LABELS[k]}</span>
                <span className="font-medium tabular-nums">{total[k].toLocaleString("pt-BR")}</span>
                <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
                  {totalSum ? Math.round((total[k] / totalSum) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.length === 0 && (
            <Card className="p-6 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
              Nenhum colaborador com tarefas em {periodLabel.toLowerCase()}.
            </Card>
          )}
          {filtered.map((m) => (
            <Card
              key={m.user_id}
              onClick={() => setOpenMember(m.user_id)}
              className="p-4 flex items-center gap-3 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="relative shrink-0">
                <Donut counts={m.counts} size={72} centerLabel={initials(m.display_name)} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight truncate">{m.display_name}</p>
                <p className="text-xs text-muted-foreground">
                  {ROLE_LABELS[m.role as TeamRole] || m.role}
                </p>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-lg font-semibold tabular-nums">{m.sum}</span>
                  <span className="text-xs text-muted-foreground">tarefas · {m.pct}% concluídas</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>{m.counts.open} em aberto</span>
                  {m.counts.late > 0 && (
                    <span className="text-status-late font-medium">{m.counts.late} atrasadas</span>
                  )}
                  {m.counts.pending > 0 && <span>{m.counts.pending} pendências</span>}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </Card>
          ))}
        </div>
      </div>

      {/* Comparativo geral */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Comparativo da equipe · {periodLabel}</DialogTitle>
            <DialogDescription>
              {totalSum.toLocaleString("pt-BR")} tarefas · {total.completed} concluídas ·{" "}
              {total.late} atrasadas
            </DialogDescription>
          </DialogHeader>
          <div className="h-[420px]">
            <ResponsiveContainer>
              <BarChart data={compareData} margin={{ left: 8, right: 16, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Concluídas" stackId="a" fill={BUCKET_COLORS.completed} />
                <Bar dataKey="Em aberto" stackId="a" fill={BUCKET_COLORS.open} />
                <Bar dataKey="Atrasadas" stackId="a" fill={BUCKET_COLORS.late} />
                <Bar dataKey="Pendências" stackId="a" fill={BUCKET_COLORS.pending} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detalhe do colaborador */}
      <Dialog open={!!openMember} onOpenChange={(o) => !o && setOpenMember(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{member?.display_name}</DialogTitle>
            <DialogDescription>
              {member ? ROLE_LABELS[member.role as TeamRole] || member.role : ""} · {periodLabel} ·{" "}
              {member?.sum} tarefas ({member?.pct}% concluídas)
            </DialogDescription>
          </DialogHeader>

          {member && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(BUCKET_LABELS) as Bucket[]).map((k) => (
                <div key={k} className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ background: BUCKET_COLORS[k] }} />
                    {BUCKET_LABELS[k]}
                  </div>
                  <div className="text-xl font-semibold tabular-nums">{member.counts[k]}</div>
                </div>
              ))}
            </div>
          )}

          <div className="max-h-[45vh] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-2 font-medium">Empresa</th>
                  <th className="p-2 font-medium">Origem</th>
                  <th className="p-2 font-medium">Situação</th>
                  <th className="p-2 font-medium">Prazo interno</th>
                </tr>
              </thead>
              <tbody>
                {memberRows.map((r) => {
                  const b = classify(r);
                  return (
                    <tr key={`${r.origin}-${r.id}`} className="border-t">
                      <td className="p-2 truncate max-w-[220px]">{r.client}</td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {r.origin === "demand" ? "Solicitação" : "Planejamento"}
                      </td>
                      <td className="p-2">
                        <Badge
                          variant="outline"
                          style={{ borderColor: BUCKET_COLORS[b], color: BUCKET_COLORS[b] }}
                        >
                          {BUCKET_LABELS[b]}
                        </Badge>
                      </td>
                      <td className="p-2 tabular-nums text-xs">{fmtDate(r.internal_deadline)}</td>
                    </tr>
                  );
                })}
                {memberRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-sm text-muted-foreground text-center">
                      Nenhuma tarefa no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

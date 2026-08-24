import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ROLE_LABELS, type TeamRole } from "@/lib/types";

type Row = { assignee: string; status: string; internal_deadline: string | null };

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

  const { data, isLoading } = useQuery({
    queryKey: ["team-performance"],
    queryFn: async () => {
      const [demands, plannings, profiles] = await Promise.all([
        supabase.from("demands").select("assignee, status, internal_deadline"),
        supabase.from("plannings").select("assignee, status, internal_deadline"),
        supabase.from("profiles").select("user_id, display_name, role").is("archived_at", null),
      ]);
      if (demands.error) throw demands.error;
      if (plannings.error) throw plannings.error;
      if (profiles.error) throw profiles.error;
      return {
        rows: [...(demands.data || []), ...(plannings.data || [])] as Row[],
        profiles: (profiles.data || []) as { user_id: string; display_name: string; role: string }[],
      };
    },
    staleTime: 60_000,
  });

  const { total, byMember } = useMemo(() => {
    const total = emptyCounts();
    const map = new Map<string, Record<Bucket, number>>();
    for (const r of data?.rows || []) {
      const b = classify(r);
      total[b] += 1;
      if (!map.has(r.assignee)) map.set(r.assignee, emptyCounts());
      map.get(r.assignee)![b] += 1;
    }
    const byMember = (data?.profiles || [])
      .map((p) => {
        const counts = map.get(p.user_id) || emptyCounts();
        const sum = counts.completed + counts.open + counts.late + counts.pending;
        return { ...p, counts, sum };
      })
      .filter((m) => m.sum > 0)
      .sort((a, b) => b.sum - a.sum);
    return { total, byMember };
  }, [data]);

  const totalSum = total.completed + total.open + total.late + total.pending;

  const filtered = byMember.filter((m) =>
    m.display_name.toLowerCase().includes(search.trim().toLowerCase())
  );

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
            Solicitações de clientes + planejamento, por responsável
          </p>
        </div>
        <Input
          placeholder="Buscar colaborador..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:w-64"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <Card className="p-5">
          <h3 className="font-semibold text-center mb-3">Performance geral</h3>
          <div className="flex justify-center">
            <Donut counts={total} size={200} centerLabel={totalSum.toLocaleString("pt-BR")} showTooltip />
          </div>
          <ul className="mt-4 space-y-1.5">
            {(Object.keys(BUCKET_LABELS) as Bucket[]).map((k) => (
              <li key={k} className="flex items-center gap-2 text-sm">
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ background: BUCKET_COLORS[k] }}
                />
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
              Nenhum colaborador encontrado.
            </Card>
          )}
          {filtered.map((m) => {
            const pct = m.sum ? Math.round((m.counts.completed / m.sum) * 100) : 0;
            return (
              <Card key={m.user_id} className="p-4 flex items-center gap-3">
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
                    <span className="text-xs text-muted-foreground">tarefas · {pct}% concluídas</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>{m.counts.open} em aberto</span>
                    {m.counts.late > 0 && (
                      <span className="text-status-late font-medium">{m.counts.late} atrasadas</span>
                    )}
                    {m.counts.pending > 0 && <span>{m.counts.pending} pendências</span>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

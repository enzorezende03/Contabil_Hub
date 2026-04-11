import AppLayout from "@/components/AppLayout";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { MOCK_DEMANDS } from "@/lib/mock-data";
import { TEAM_MEMBERS } from "@/lib/mock-data";
import {
  DEMAND_TYPE_LABELS,
  DemandStatus,
  STATUS_LABELS,
  PRIORITY_LABELS,
  Priority,
} from "@/lib/types";
import {
  getDemandsByStatus,
  getDemandsByAssignee,
  getProductivityScore,
  getCompletionRate,
  formatMinutes,
  getAvgTimeMinutes,
  getDeadlineUrgency,
} from "@/lib/demand-utils";
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Ban,
  TrendingUp,
  Users,
  Archive,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const demands = MOCK_DEMANDS;

const PIE_COLORS = [
  "hsl(220, 10%, 60%)",
  "hsl(217, 91%, 50%)",
  "hsl(262, 83%, 58%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)",
  "hsl(142, 71%, 45%)",
  "hsl(0, 84%, 60%)",
  "hsl(25, 95%, 53%)",
  "hsl(348, 83%, 47%)",
];

export default function Dashboard() {
  const total = demands.length;
  const completed = getDemandsByStatus(demands, "completed").length;
  const inProgress = getDemandsByStatus(demands, "in_progress").length;
  const late = getDemandsByStatus(demands, "late").length;
  const blocked = getDemandsByStatus(demands, "blocked").length;
  const legacy = demands.filter((d) => d.isLegacy).length;
  const attention = getDemandsByStatus(demands, "attention").length;
  const completionRate = getCompletionRate(demands);
  const avgTime = getAvgTimeMinutes(demands);
  const totalWeighted = getProductivityScore(demands);

  // Status distribution for pie
  const statusCounts = Object.keys(STATUS_LABELS).map((s) => ({
    name: STATUS_LABELS[s as DemandStatus],
    value: getDemandsByStatus(demands, s as DemandStatus).length,
  })).filter((s) => s.value > 0);

  // Type distribution for bar chart
  const typeCounts = Object.keys(DEMAND_TYPE_LABELS).map((t) => ({
    name: DEMAND_TYPE_LABELS[t as keyof typeof DEMAND_TYPE_LABELS].replace("Contábil", "").replace("Bancária", "Banc.").trim(),
    value: demands.filter((d) => d.types.includes(t as any)).length,
  })).filter((t) => t.value > 0);

  // Priority distribution
  const priorityCounts = Object.keys(PRIORITY_LABELS).map((p) => ({
    name: PRIORITY_LABELS[p as Priority],
    value: demands.filter((d) => d.priority === p).length,
  })).filter((p) => p.value > 0);

  // Urgent demands
  const urgentDemands = demands
    .filter((d) => d.status !== "completed" && (d.status === "late" || d.status === "attention" || d.status === "blocked" || getDeadlineUrgency(d.internalDeadline) === "overdue" || getDeadlineUrgency(d.internalDeadline) === "today"))
    .slice(0, 6);

  // Team workload
  const teamWorkload = TEAM_MEMBERS.map((m) => {
    const memberDemands = getDemandsByAssignee(demands, m.id);
    const active = memberDemands.filter((d) => d.status !== "completed").length;
    const score = getProductivityScore(memberDemands);
    return { name: m.name.split(" ")[0], active, score, total: memberDemands.length };
  });

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral do departamento contábil</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title="Total de Demandas" value={total} icon={ClipboardList} variant="info" />
          <KpiCard title="Concluídas" value={completed} subtitle={`${completionRate}% do total`} icon={CheckCircle2} variant="success" />
          <KpiCard title="Em Andamento" value={inProgress} icon={Clock} variant="info" />
          <KpiCard title="Em Atraso" value={late + attention} icon={AlertTriangle} variant="danger" />
          <KpiCard title="Bloqueadas" value={blocked} icon={Ban} variant="warning" />
          <KpiCard title="Produtividade" value={totalWeighted} subtitle="pontos ponderados" icon={TrendingUp} variant="success" />
          <KpiCard title="Tempo Médio" value={formatMinutes(avgTime)} subtitle="por tarefa concluída" icon={Clock} />
          <KpiCard title="Escritas Antigas" value={legacy} icon={Archive} variant="warning" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Status Pie */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Demandas por Status</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusCounts} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                    {statusCounts.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {statusCounts.map((s, i) => (
                <span key={s.name} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {s.name} ({s.value})
                </span>
              ))}
            </div>
          </div>

          {/* Type Bar */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Demandas por Tipo</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeCounts} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" fill="hsl(217, 91%, 50%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Priority */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Por Prioridade</h3>
            <div className="space-y-3 mt-4">
              {priorityCounts.map((p) => (
                <div key={p.name} className="flex items-center justify-between">
                  <span className="text-sm">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${(p.value / total) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-6 text-right">{p.value}</span>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="text-sm font-semibold mt-6 mb-3">Carga por Colaborador</h3>
            <div className="space-y-2">
              {teamWorkload.map((m) => (
                <div key={m.name} className="flex items-center justify-between text-sm">
                  <span>{m.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{m.active} ativas</span>
                    <span className="font-medium text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{m.score}pts</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Urgent demands */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-status-late" />
            Prioridades da Semana
          </h3>
          {urgentDemands.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma demanda urgente 🎉</p>
          ) : (
            <div className="divide-y divide-border">
              {urgentDemands.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2.5 gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{d.client}</p>
                    <p className="text-xs text-muted-foreground truncate">{d.description}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">{d.competencias[0]}</span>
                    <StatusBadge status={d.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

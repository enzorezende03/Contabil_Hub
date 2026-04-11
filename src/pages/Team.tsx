import AppLayout from "@/components/AppLayout";
import { MOCK_DEMANDS, TEAM_MEMBERS } from "@/lib/mock-data";
import { ROLE_LABELS } from "@/lib/types";
import {
  getDemandsByAssignee,
  getProductivityScore,
  getCompletionRate,
  getAvgTimeMinutes,
  formatMinutes,
  getReworkRate,
  getPerformanceLevel,
} from "@/lib/demand-utils";
import { StatusBadge } from "@/components/StatusBadge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Trophy, TrendingUp, Clock, AlertTriangle, RotateCcw } from "lucide-react";

export default function TeamPage() {
  const demands = MOCK_DEMANDS;

  const memberStats = TEAM_MEMBERS.map((m) => {
    const md = getDemandsByAssignee(demands, m.id);
    const completed = md.filter((d) => d.status === "completed").length;
    const late = md.filter((d) => d.status === "late" || d.status === "attention").length;
    const active = md.filter((d) => d.status !== "completed").length;
    const score = getProductivityScore(md);
    const completionRate = getCompletionRate(md);
    const avgTime = getAvgTimeMinutes(md);
    const reworkRate = getReworkRate(md);
    const perf = getPerformanceLevel(m, demands);
    const totalWeight = md.reduce((s, d) => s + d.weight, 0);
    return { ...m, total: md.length, completed, late, active, score, completionRate, avgTime, reworkRate, perf, totalWeight, demands: md };
  }).sort((a, b) => b.score - a.score);

  const chartData = memberStats.map((m) => ({
    name: m.name.split(" ")[0],
    pontos: m.score,
    demandas: m.total,
  }));

  // Sector totals
  const totalDemands = demands.length;
  const totalCompleted = demands.filter((d) => d.status === "completed").length;
  const sectorCompletion = Math.round((totalCompleted / totalDemands) * 100);
  const sectorAvgTime = getAvgTimeMinutes(demands);
  const sectorWeighted = getProductivityScore(demands);

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipe & Produtividade</h1>
          <p className="text-sm text-muted-foreground mt-1">Performance individual e do setor</p>
        </div>

        {/* Sector KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Demandas</p>
            <p className="text-xl font-bold mt-1">{totalDemands}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Concluídas</p>
            <p className="text-xl font-bold mt-1 text-status-completed">{totalCompleted}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">% Conclusão</p>
            <p className="text-xl font-bold mt-1">{sectorCompletion}%</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Tempo Médio</p>
            <p className="text-xl font-bold mt-1">{formatMinutes(sectorAvgTime)}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Produtividade</p>
            <p className="text-xl font-bold mt-1 text-primary">{sectorWeighted}pts</p>
          </div>
        </div>

        {/* Chart */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Ranking de Produtividade (pontos ponderados)</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="pontos" fill="hsl(217, 91%, 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Individual cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {memberStats.map((m, idx) => (
            <div key={m.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {idx === 0 && <Trophy className="w-4 h-4 text-status-waiting" />}
                  <div>
                    <p className="font-semibold text-sm">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]}</p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  m.perf.level === "high" ? "bg-status-completed/10 text-status-completed" :
                  m.perf.level === "medium" ? "bg-status-waiting/10 text-status-waiting" :
                  "bg-status-late/10 text-status-late"
                }`}>
                  {m.perf.label}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><TrendingUp className="w-3 h-3" />Pontos</p>
                  <p className="text-lg font-bold text-primary">{m.score}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Clock className="w-3 h-3" />T. Médio</p>
                  <p className="text-lg font-bold">{formatMinutes(m.avgTime)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3" />Atraso</p>
                  <p className="text-lg font-bold text-status-late">{m.late}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><RotateCcw className="w-3 h-3" />Retrab.</p>
                  <p className="text-lg font-bold">{m.reworkRate}%</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{m.completed}/{m.total} concluídas</span>
                <span>·</span>
                <span>{m.active} ativas</span>
                <span>·</span>
                <span>Carga: {m.totalWeight} pts</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

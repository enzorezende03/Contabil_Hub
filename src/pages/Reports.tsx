import AppLayout from "@/components/AppLayout";
import { MOCK_DEMANDS, TEAM_MEMBERS } from "@/lib/mock-data";
import { DEMAND_TYPE_LABELS, STATUS_LABELS, PRIORITY_LABELS } from "@/lib/types";
import { getDemandsByAssignee, getProductivityScore, getCompletionRate, formatMinutes, getAvgTimeMinutes } from "@/lib/demand-utils";
import { Download } from "lucide-react";

export default function ReportsPage() {
  const demands = MOCK_DEMANDS;

  const memberReport = TEAM_MEMBERS.map((m) => {
    const md = getDemandsByAssignee(demands, m.id);
    return {
      name: m.name,
      total: md.length,
      completed: md.filter((d) => d.status === "completed").length,
      late: md.filter((d) => d.status === "late").length,
      score: getProductivityScore(md),
      completionRate: getCompletionRate(md),
      avgTime: formatMinutes(getAvgTimeMinutes(md)),
    };
  });

  const typeReport = Object.entries(DEMAND_TYPE_LABELS).map(([k, v]) => ({
    type: v,
    count: demands.filter((d) => d.type === k).length,
    completed: demands.filter((d) => d.type === k && d.status === "completed").length,
  })).filter((t) => t.count > 0);

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-1">Dados consolidados do departamento</p>
        </div>

        {/* Productivity by member */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Produtividade por Colaborador</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Colaborador</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">Total</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">Concluídas</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">Atraso</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">% Conclusão</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">Pontos</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">T. Médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {memberReport.map((m) => (
                  <tr key={m.name} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{m.name}</td>
                    <td className="px-3 py-2 text-center">{m.total}</td>
                    <td className="px-3 py-2 text-center text-status-completed">{m.completed}</td>
                    <td className="px-3 py-2 text-center text-status-late">{m.late}</td>
                    <td className="px-3 py-2 text-center">{m.completionRate}%</td>
                    <td className="px-3 py-2 text-center text-primary font-medium">{m.score}</td>
                    <td className="px-3 py-2 text-center text-muted-foreground">{m.avgTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* By type */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Demandas por Tipo</h3>
          <div className="space-y-2">
            {typeReport.map((t) => (
              <div key={t.type} className="flex items-center justify-between">
                <span className="text-sm">{t.type}</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${(t.completed / t.count) * 100}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-16 text-right">{t.completed}/{t.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

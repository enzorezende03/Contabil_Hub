import { useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { DEMAND_TYPE_LABELS } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Trophy, TrendingUp, CheckCircle2 } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  lancamentos: "Lançamentos",
  conciliacao_bancaria: "Conc. Bancária",
  conciliacao_contabil: "Conc. Contábil",
  fechamento: "Fechamento",
  revisao: "Revisão",
};

export default function TeamPage() {
  // Fetch profiles
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all demand_status_entries
  const { data: entries = [] } = useQuery({
    queryKey: ["demand_status_entries_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("demand_status_entries").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch demands from DB
  const { data: demands = [] } = useQuery({
    queryKey: ["demands"],
    queryFn: async () => {
      const { data, error } = await supabase.from("demands").select("*");
      if (error) throw error;
      return data;
    },
  });

  const memberStats = useMemo(() => {
    const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]));

    // Group entries by filled_by
    const byUser = new Map<string, any[]>();
    entries.forEach((e: any) => {
      if (!byUser.has(e.filled_by)) byUser.set(e.filled_by, []);
      byUser.get(e.filled_by)!.push(e);
    });

    // Also count demands assigned to each user
    const demandsByAssignee = new Map<string, any[]>();
    demands.forEach((d: any) => {
      if (!demandsByAssignee.has(d.assignee)) demandsByAssignee.set(d.assignee, []);
      demandsByAssignee.get(d.assignee)!.push(d);
    });

    return profiles.map((p: any) => {
      const userEntries = byUser.get(p.user_id) || [];
      const totalEntries = userEntries.length;
      const completedEntries = userEntries.filter((e: any) => e.status === "completed").length;
      const inProgressEntries = userEntries.filter((e: any) => e.status === "in_progress").length;
      const userDemands = demandsByAssignee.get(p.user_id) || [];
      const completionRate = totalEntries > 0 ? Math.round((completedEntries / totalEntries) * 100) : 0;

      // Productivity score: completed entries weighted by type
      const typeWeights: Record<string, number> = {
        lancamentos: 1,
        conciliacao_bancaria: 2,
        conciliacao_contabil: 3,
      };
      const score = userEntries
        .filter((e: any) => e.status === "completed")
        .reduce((sum: number, e: any) => sum + (typeWeights[e.demand_type] || 1), 0);

      return {
        id: p.user_id,
        name: p.display_name,
        role: p.role,
        totalEntries,
        completedEntries,
        inProgressEntries,
        totalDemands: userDemands.length,
        completionRate,
        score,
      };
    }).filter((m: any) => m.totalEntries > 0 || m.totalDemands > 0)
      .sort((a: any, b: any) => b.score - a.score);
  }, [profiles, entries, demands]);

  const chartData = memberStats.map((m) => ({
    name: m.name.split(" ")[0],
    pontos: m.score,
    concluidas: m.completedEntries,
  }));

  const totalEntries = entries.length;
  const totalCompleted = entries.filter((e: any) => e.status === "completed").length;
  const sectorCompletion = totalEntries > 0 ? Math.round((totalCompleted / totalEntries) * 100) : 0;

  // Type breakdown
  const typeReport = Object.entries(TYPE_LABELS).map(([k, v]) => ({
    type: v,
    count: entries.filter((e: any) => e.demand_type === k).length,
    completed: entries.filter((e: any) => e.demand_type === k && e.status === "completed").length,
  })).filter((t) => t.count > 0);

  const roleLabels: Record<string, string> = {
    coordenacao: "Coordenação",
    analista: "Analista",
    assistente: "Assistente",
    estagiario: "Estagiário",
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produtividade Equipe</h1>
          <p className="text-sm text-muted-foreground mt-1">Performance baseada no fechamento contábil</p>
        </div>

        {/* Sector KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Registros</p>
            <p className="text-xl font-bold mt-1">{totalEntries}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Concluídos</p>
            <p className="text-xl font-bold mt-1 text-status-completed">{totalCompleted}</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">% Conclusão</p>
            <p className="text-xl font-bold mt-1">{sectorCompletion}%</p>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Demandas Criadas</p>
            <p className="text-xl font-bold mt-1">{demands.length}</p>
          </div>
        </div>

        {/* Chart */}
        {chartData.length > 0 && (
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
        )}

        {/* Individual cards */}
        {memberStats.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {memberStats.map((m, idx) => (
              <div key={m.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {idx === 0 && <Trophy className="w-4 h-4 text-status-waiting" />}
                    <div>
                      <p className="font-semibold text-sm">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{roleLabels[m.role] || m.role}</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
                    {m.score} pts
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><TrendingUp className="w-3 h-3" />Registros</p>
                    <p className="text-lg font-bold">{m.totalEntries}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><CheckCircle2 className="w-3 h-3" />Concluídos</p>
                    <p className="text-lg font-bold text-status-completed">{m.completedEntries}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">% Conclusão</p>
                    <p className="text-lg font-bold">{m.completionRate}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            <p className="text-sm">Nenhum dado de produtividade ainda.</p>
            <p className="text-xs mt-1">Complete atividades no Fechamento Contábil para gerar dados.</p>
          </div>
        )}

        {/* Table */}
        {memberStats.length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Produtividade por Colaborador</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Colaborador</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Registros</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Concluídos</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Em Andamento</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">% Conclusão</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Pontos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {memberStats.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{m.name}</td>
                      <td className="px-3 py-2 text-center">{m.totalEntries}</td>
                      <td className="px-3 py-2 text-center text-status-completed">{m.completedEntries}</td>
                      <td className="px-3 py-2 text-center">{m.inProgressEntries}</td>
                      <td className="px-3 py-2 text-center">{m.completionRate}%</td>
                      <td className="px-3 py-2 text-center text-primary font-medium">{m.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* By type */}
        {typeReport.length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Atividades por Tipo</h3>
            <div className="space-y-2">
              {typeReport.map((t) => (
                <div key={t.type} className="flex items-center justify-between">
                  <span className="text-sm">{t.type}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${t.count > 0 ? (t.completed / t.count) * 100 : 0}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-16 text-right">{t.completed}/{t.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

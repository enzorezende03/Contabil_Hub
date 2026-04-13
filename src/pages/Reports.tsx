import { useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const TYPE_LABELS: Record<string, string> = {
  lancamentos: "Lançamentos",
  conciliacao_bancaria: "Conc. Bancária",
  conciliacao_contabil: "Conc. Contábil",
  fechamento: "Fechamento",
  revisao: "Revisão",
};

export default function ReportsPage() {
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["demand_status_entries_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("demand_status_entries").select("*");
      if (error) throw error;
      return data;
    },
  });

  const memberReport = useMemo(() => {
    const byUser = new Map<string, any[]>();
    entries.forEach((e: any) => {
      if (!byUser.has(e.filled_by)) byUser.set(e.filled_by, []);
      byUser.get(e.filled_by)!.push(e);
    });

    const typeWeights: Record<string, number> = {
      lancamentos: 1,
      conciliacao_bancaria: 2,
      conciliacao_contabil: 3,
    };

    return profiles.map((p: any) => {
      const userEntries = byUser.get(p.user_id) || [];
      const total = userEntries.length;
      const completed = userEntries.filter((e: any) => e.status === "completed").length;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
      const score = userEntries
        .filter((e: any) => e.status === "completed")
        .reduce((sum: number, e: any) => sum + (typeWeights[e.demand_type] || 1), 0);

      return { name: p.display_name, total, completed, completionRate, score };
    }).filter((m: any) => m.total > 0)
      .sort((a: any, b: any) => b.score - a.score);
  }, [profiles, entries]);

  const typeReport = useMemo(() => {
    return Object.entries(TYPE_LABELS).map(([k, v]) => ({
      type: v,
      count: entries.filter((e: any) => e.demand_type === k).length,
      completed: entries.filter((e: any) => e.demand_type === k && e.status === "completed").length,
    })).filter((t) => t.count > 0);
  }, [entries]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-1">Dados consolidados do departamento</p>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Produtividade por Colaborador</h3>
          {memberReport.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Colaborador</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Registros</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Concluídos</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">% Conclusão</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Pontos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {memberReport.map((m) => (
                    <tr key={m.name} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{m.name}</td>
                      <td className="px-3 py-2 text-center">{m.total}</td>
                      <td className="px-3 py-2 text-center text-status-completed">{m.completed}</td>
                      <td className="px-3 py-2 text-center">{m.completionRate}%</td>
                      <td className="px-3 py-2 text-center text-primary font-medium">{m.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum dado de produtividade ainda. Complete atividades no Fechamento Contábil.</p>
          )}
        </div>

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

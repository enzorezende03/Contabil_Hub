import { useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { KpiCard } from "@/components/KpiCard";
import { DEMAND_TYPE_LABELS } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  TrendingUp,
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

const PIE_COLORS = [
  "hsl(220, 10%, 60%)",
  "hsl(217, 91%, 50%)",
  "hsl(262, 83%, 58%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)",
  "hsl(142, 71%, 45%)",
];

const TYPE_LABELS: Record<string, string> = {
  lancamentos: "Lançamentos",
  conciliacao_bancaria: "Conc. Bancária",
  conciliacao_contabil: "Conc. Contábil",
  fechamento: "Fechamento",
  revisao: "Revisão",
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Não Iniciada",
  in_progress: "Em Andamento",
  waiting_info: "Aguard. Doc.",
  completed: "Concluída",
  blocked: "Bloqueada",
};

export default function Dashboard() {
  const { data: entries = [] } = useQuery({
    queryKey: ["demand_status_entries_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("demand_status_entries").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: demands = [] } = useQuery({
    queryKey: ["demands"],
    queryFn: async () => {
      const { data, error } = await supabase.from("demands").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const totalEntries = entries.length;
  const completedEntries = entries.filter((e: any) => e.status === "completed").length;
  const inProgressEntries = entries.filter((e: any) => e.status === "in_progress").length;
  const waitingEntries = entries.filter((e: any) => e.status === "waiting_info").length;
  const completionRate = totalEntries > 0 ? Math.round((completedEntries / totalEntries) * 100) : 0;

  // Status distribution for pie
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    entries.forEach((e: any) => {
      counts[e.status] = (counts[e.status] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([status, value]) => ({ name: STATUS_LABELS[status] || status, value }))
      .filter((s) => s.value > 0);
  }, [entries]);

  // Type distribution
  const typeCounts = useMemo(() => {
    return Object.entries(TYPE_LABELS).map(([k, v]) => ({
      name: v,
      value: entries.filter((e: any) => e.demand_type === k).length,
    })).filter((t) => t.value > 0);
  }, [entries]);

  // Team workload from entries
  const teamWorkload = useMemo(() => {
    const byUser = new Map<string, { completed: number; total: number }>();
    entries.forEach((e: any) => {
      if (!byUser.has(e.filled_by)) byUser.set(e.filled_by, { completed: 0, total: 0 });
      const u = byUser.get(e.filled_by)!;
      u.total++;
      if (e.status === "completed") u.completed++;
    });

    const profileMap = new Map(profiles.map((p: any) => [p.user_id, p.display_name]));

    return [...byUser.entries()].map(([userId, stats]) => ({
      name: (profileMap.get(userId) || "Usuário").split(" ")[0],
      concluidos: stats.completed,
      total: stats.total,
    })).sort((a, b) => b.concluidos - a.concluidos);
  }, [entries, profiles]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral do departamento contábil</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title="Registros Totais" value={totalEntries} icon={ClipboardList} variant="info" />
          <KpiCard title="Concluídos" value={completedEntries} subtitle={`${completionRate}% do total`} icon={CheckCircle2} variant="success" />
          <KpiCard title="Em Andamento" value={inProgressEntries} icon={Clock} variant="info" />
          <KpiCard title="Demandas Criadas" value={demands.length} icon={TrendingUp} variant="success" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Status Pie */}
          {statusCounts.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Por Status</h3>
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
          )}

          {/* Type Bar */}
          {typeCounts.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Por Tipo de Atividade</h3>
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
          )}

          {/* Team workload */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Produtividade por Colaborador</h3>
            {teamWorkload.length > 0 ? (
              <div className="space-y-2">
                {teamWorkload.map((m) => (
                  <div key={m.name} className="flex items-center justify-between text-sm">
                    <span>{m.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{m.concluidos}/{m.total}</span>
                      <span className="font-medium text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        {m.total > 0 ? Math.round((m.concluidos / m.total) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum dado ainda.</p>
            )}
          </div>
        </div>

        {totalEntries === 0 && (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            <p className="text-sm">Nenhum dado registrado ainda.</p>
            <p className="text-xs mt-1">Preencha o Fechamento Contábil e crie demandas para gerar dados no dashboard.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

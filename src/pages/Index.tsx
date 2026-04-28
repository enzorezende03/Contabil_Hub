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
  ShieldCheck,
  AlertTriangle,
  Reply,
  Repeat,
} from "lucide-react";
import { Link } from "react-router-dom";
import { REVIEW_STATUS_LABEL, REVIEW_STATUS_BADGE, type ReviewStatus } from "@/lib/review-utils";
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

  const { data: plannings = [] } = useQuery({
    queryKey: ["plannings_dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plannings").select("*");
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

  // KPIs de revisão de demonstrativos
  const { data: reviewSubs = [] } = useQuery({
    queryKey: ["dashboard-review-subs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_submissions")
        .select("id, status, cycle_number, submitted_at, reviewed_at, client_id, competencia, submitted_by");
      if (error) throw error;
      return data as Array<{ id: string; status: ReviewStatus; cycle_number: number; submitted_at: string; reviewed_at: string | null; client_id: string; competencia: string; submitted_by: string }>;
    },
  });

  const reviewKpis = useMemo(() => {
    const aguardando = reviewSubs.filter((s) => s.status === "aguardando").length;
    const emRevisao = reviewSubs.filter((s) => s.status === "em_revisao").length;
    const devolvidas = reviewSubs.filter((s) => s.status === "devolvido").length;
    const stale = reviewSubs.filter((s) => {
      if (s.status !== "aguardando") return false;
      return (Date.now() - new Date(s.submitted_at).getTime()) > 24 * 3600_000;
    }).length;

    // Ciclo médio (h) entre submitted_at e reviewed_at em submissões resolvidas
    const resolved = reviewSubs.filter((s) => (s.status === "aprovado" || s.status === "devolvido") && s.reviewed_at);
    const avgCycleH = resolved.length > 0
      ? resolved.reduce((acc, s) => acc + (new Date(s.reviewed_at!).getTime() - new Date(s.submitted_at).getTime()), 0) / resolved.length / 3600_000
      : 0;

    // Taxa de aprovação na 1ª submissão: % de (client+competência) cuja submissão #1 foi aprovada sem ciclos extras
    const byKey = new Map<string, typeof reviewSubs>();
    reviewSubs.forEach((s) => {
      const k = `${s.client_id}|${s.competencia}`;
      const arr = byKey.get(k) || [];
      arr.push(s);
      byKey.set(k, arr);
    });
    let firstPassOk = 0; let firstPassTotal = 0;
    byKey.forEach((arr) => {
      const approved = arr.find((s) => s.status === "aprovado");
      if (!approved) return;
      firstPassTotal++;
      if (approved.cycle_number === 1) firstPassOk++;
    });
    const firstPassRate = firstPassTotal > 0 ? Math.round((firstPassOk / firstPassTotal) * 100) : 0;

    return { aguardando, emRevisao, devolvidas, stale, avgCycleH, firstPassRate, totalResolved: firstPassTotal };
  }, [reviewSubs]);

  const recentReviews = useMemo(() => {
    return [...reviewSubs]
      .filter((s) => s.status === "aguardando" || s.status === "em_revisao" || s.status === "devolvido")
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
      .slice(0, 5);
  }, [reviewSubs]);


  // Build status map from entries: client|competencia|type -> status
  const statusMap = useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach((e: any) => {
      map.set(`${e.client_name}|${e.month}/${e.year}|${e.demand_type}`, e.status);
    });
    return map;
  }, [entries]);

  // Expand plannings into individual units (client × competencia × type)
  type Unit = { status: string; assignee: string; type: string };
  const planningUnits = useMemo<Unit[]>(() => {
    const units: Unit[] = [];
    plannings.forEach((p: any) => {
      (p.competencias || []).forEach((comp: string) => {
        (p.types || []).forEach((t: string) => {
          const key = `${p.client}|${comp}|${t}`;
          const status = statusMap.get(key) || p.status || "not_started";
          units.push({ status, assignee: p.assignee, type: t });
        });
      });
    });
    return units;
  }, [plannings, statusMap]);

  const totalUnits = planningUnits.length;
  const completedUnits = planningUnits.filter((u) => u.status === "completed").length;
  const inProgressUnits = planningUnits.filter((u) => u.status === "in_progress").length;
  const completionRate = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

  // Status distribution
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    planningUnits.forEach((u) => {
      counts[u.status] = (counts[u.status] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([status, value]) => ({ name: STATUS_LABELS[status] || status, value }))
      .filter((s) => s.value > 0);
  }, [planningUnits]);

  // Type distribution
  const typeCounts = useMemo(() => {
    return Object.entries(TYPE_LABELS).map(([k, v]) => ({
      name: v,
      value: planningUnits.filter((u) => u.type === k).length,
    })).filter((t) => t.value > 0);
  }, [planningUnits]);

  // Team workload from planning units
  const teamWorkload = useMemo(() => {
    const byUser = new Map<string, { completed: number; total: number }>();
    planningUnits.forEach((u) => {
      if (!u.assignee) return;
      if (!byUser.has(u.assignee)) byUser.set(u.assignee, { completed: 0, total: 0 });
      const s = byUser.get(u.assignee)!;
      s.total++;
      if (u.status === "completed") s.completed++;
    });

    const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]));

    return [...byUser.entries()]
      .filter(([userId]) => {
        const p: any = profileMap.get(userId);
        return p && p.role !== "coordenacao";
      })
      .map(([userId, stats]) => ({
        name: ((profileMap.get(userId) as any)?.display_name || "Usuário").split(" ")[0],
        concluidos: stats.completed,
        total: stats.total,
      })).sort((a, b) => b.concluidos - a.concluidos);
  }, [planningUnits, profiles]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral do departamento contábil</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title="Atividades Planejadas" value={totalUnits} icon={ClipboardList} variant="info" />
          <KpiCard title="Concluídas" value={completedUnits} subtitle={`${completionRate}% do total`} icon={CheckCircle2} variant="success" />
          <KpiCard title="Em Andamento" value={inProgressUnits} icon={Clock} variant="info" />
          <KpiCard title="Planejamentos" value={plannings.length} icon={TrendingUp} variant="success" />
        </div>

        {/* Revisão de Demonstrativos */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" /> Revisão de Demonstrativos
            </h2>
            <Link to="/revisao" className="text-xs text-primary hover:underline">Abrir caixa de revisão →</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              title="Aguardando revisão"
              value={reviewKpis.aguardando}
              subtitle={reviewKpis.stale > 0 ? `${reviewKpis.stale} > 24h` : "Em dia"}
              icon={ShieldCheck}
              variant="info"
            />
            <KpiCard title="Em revisão" value={reviewKpis.emRevisao} icon={Clock} variant="info" />
            <KpiCard title="Devolvidas" value={reviewKpis.devolvidas} icon={Reply} variant="info" />
            <KpiCard
              title="Aprovação na 1ª"
              value={`${reviewKpis.firstPassRate}%`}
              subtitle={`${reviewKpis.totalResolved} resolvidas · ciclo médio ${reviewKpis.avgCycleH > 0 ? reviewKpis.avgCycleH.toFixed(1) + "h" : "—"}`}
              icon={Repeat}
              variant="success"
            />
          </div>

          {recentReviews.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold mb-2">Últimas movimentações</h3>
              <div className="space-y-1.5">
                {recentReviews.map((s) => {
                  const ageH = (Date.now() - new Date(s.submitted_at).getTime()) / 3600_000;
                  const stale = s.status === "aguardando" && ageH > 24;
                  return (
                    <Link
                      to="/revisao"
                      key={s.id}
                      className="flex items-center gap-2 text-xs hover:bg-muted/50 rounded-md px-2 py-1.5"
                    >
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${REVIEW_STATUS_BADGE[s.status]}`}>
                        {REVIEW_STATUS_LABEL[s.status]}
                      </span>
                      <span className="text-muted-foreground">
                        {String(s.competencia).slice(0, 7).split("-").reverse().join("/")} · #{s.cycle_number}ª
                      </span>
                      {stale && (
                        <span className="text-warning flex items-center gap-1 text-[10px]">
                          <AlertTriangle className="w-3 h-3" /> {Math.round(ageH)}h
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
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

        {totalUnits === 0 && (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            <p className="text-sm">Nenhum dado registrado ainda.</p>
            <p className="text-xs mt-1">Preencha o Fechamento Contábil e crie demandas para gerar dados no dashboard.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

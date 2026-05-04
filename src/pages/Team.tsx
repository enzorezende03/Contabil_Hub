import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Trophy, RefreshCw, Info, ChevronRight, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useActionPermissions, canPerformAction } from "@/hooks/use-action-permissions";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  useSnapshots,
  scoreColor,
  scoreBg,
  recalcSnapshots,
  currentAndPrevPeriod,
  monthLabel,
  type Snapshot,
} from "@/hooks/use-productivity";

const ROLE_LABELS: Record<string, string> = {
  coordenacao: "Coordenação",
  analista: "Analista",
  assistente: "Assistente",
  estagiario: "Estagiário",
};

type Mode = "atual" | "anterior" | "comparar";

export default function TeamPage() {
  const { user, profile } = useAuth();
  useActionPermissions();
  const canSeeTeam = canPerformAction("ver_produtividade_equipe", profile?.role);
  const canSeeOwn = canPerformAction("ver_propria_produtividade", profile?.role);
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("comparar");
  const [recalcing, setRecalcing] = useState(false);
  const [drawerUser, setDrawerUser] = useState<string | null>(null);
  const [drawerPeriod, setDrawerPeriod] = useState<{ ano: number; mes: number } | null>(null);

  const { cur, prev } = useMemo(currentAndPrevPeriod, []);
  const periods = mode === "atual" ? [cur] : mode === "anterior" ? [prev] : [cur, prev];

  const { data: snapshots = [], isLoading: loadingSnaps } = useSnapshots([cur, prev]);
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data || [];
    },
  });
  const { data: capCfg } = useQuery({
    queryKey: ["productivity_capacity_config"],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "productivity_capacity_config")
        .maybeSingle();
      return (data?.value || {}) as any;
    },
  });

  const warmupUntil = capCfg?.warmup_qualidade_until as string | undefined;
  const inWarmup = warmupUntil ? new Date() < new Date(warmupUntil + "T23:59:59") : false;

  const profileById = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of profiles) m.set(p.user_id, p);
    return m;
  }, [profiles]);

  const snapByKey = useMemo(() => {
    const m = new Map<string, Snapshot>();
    for (const s of snapshots) m.set(`${s.user_id}-${s.ano}-${s.mes}`, s);
    return m;
  }, [snapshots]);

  const mySnap = (p: { ano: number; mes: number }) =>
    user ? snapByKey.get(`${user.id}-${p.ano}-${p.mes}`) : undefined;

  // Ranking entre pares (mesma role do usuário, mês corrente)
  const peers = useMemo(() => {
    if (!profile?.role) return [];
    return profiles
      .filter((p: any) => p.role === profile.role)
      .map((p: any) => ({
        ...p,
        snap: snapByKey.get(`${p.user_id}-${cur.ano}-${cur.mes}`),
      }))
      .sort((a: any, b: any) => (b.snap?.composite_score || 0) - (a.snap?.composite_score || 0));
  }, [profiles, profile, snapByKey, cur]);

  const myRank = useMemo(() => {
    if (!user) return null;
    const idx = peers.findIndex((p: any) => p.user_id === user.id);
    return idx >= 0 ? { pos: idx + 1, total: peers.length } : null;
  }, [peers, user]);

  // Ranking equipe agrupado por cargo
  const teamByRole = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const p of profiles) {
      const arr = groups.get(p.role) || [];
      arr.push({
        ...p,
        snapCur: snapByKey.get(`${p.user_id}-${cur.ano}-${cur.mes}`),
        snapPrev: snapByKey.get(`${p.user_id}-${prev.ano}-${prev.mes}`),
      });
      groups.set(p.role, arr);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => (b.snapCur?.composite_score || 0) - (a.snapCur?.composite_score || 0));
    }
    return groups;
  }, [profiles, snapByKey, cur, prev]);

  const handleRecalc = async () => {
    setRecalcing(true);
    try {
      const r: any = await recalcSnapshots({});
      toast.success(`Recalculado: ${r?.snapshots_written ?? 0} snapshots`);
      queryClient.invalidateQueries({ queryKey: ["productivity_snapshots"] });
    } catch (e: any) {
      toast.error("Erro ao recalcular: " + e.message);
    } finally {
      setRecalcing(false);
    }
  };

  // Progresso do mês atual
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const monthProgress = Math.round((today.getDate() / lastDay) * 100);

  if (!canSeeOwn) {
    return (
      <AppLayout>
        <div className="p-6 max-w-4xl">
          <h1 className="text-2xl font-bold tracking-tight">Produtividade</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Você não tem permissão para visualizar produtividade.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Produtividade</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Score composto: esforço × qualidade × prazo
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border bg-card overflow-hidden">
              {(["atual", "anterior", "comparar"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  {m === "atual" ? "Mês atual" : m === "anterior" ? "Mês anterior" : "Comparar"}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={handleRecalc} disabled={recalcing}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${recalcing ? "animate-spin" : ""}`} />
              Recalcular
            </Button>
          </div>
        </div>

        {/* Warm-up notice */}
        {inWarmup && warmupUntil && (
          <div className="rounded-lg border border-status-waiting/30 bg-status-waiting/10 p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-status-waiting mt-0.5 flex-shrink-0" />
            <div className="text-xs">
              <p className="font-medium">Qualidade em warm-up até {new Date(warmupUntil).toLocaleDateString("pt-BR")}</p>
              <p className="text-muted-foreground mt-0.5">
                Como o módulo de revisão é novo, a qualidade ainda não tem histórico estatístico. Os pesos foram rebalanceados temporariamente para 70% esforço / 30% prazo.
              </p>
            </div>
          </div>
        )}

        {/* Progresso do mês */}
        {(mode === "atual" || mode === "comparar") && (
          <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {monthLabel(cur)} — dia {today.getDate()} de {lastDay}
            </span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${monthProgress}%` }} />
            </div>
            <span className="text-xs font-medium">{monthProgress}%</span>
          </div>
        )}

        {/* Minha produtividade */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">Minha produtividade</h2>
          <div className={`grid gap-3 ${mode === "comparar" ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
            {periods.map((p) => {
              const s = mySnap(p);
              const sPrev = mode === "comparar" && p.ano === cur.ano && p.mes === cur.mes ? mySnap(prev) : null;
              const delta = s && sPrev ? s.composite_score - sPrev.composite_score : null;
              return (
                <MyCard
                  key={`${p.ano}-${p.mes}`}
                  period={p}
                  snap={s}
                  delta={delta}
                  rank={p.ano === cur.ano && p.mes === cur.mes ? myRank : null}
                  roleLabel={ROLE_LABELS[profile?.role || ""] || profile?.role}
                  onOpenDetails={() => {
                    setDrawerUser(user?.id || null);
                    setDrawerPeriod(p);
                  }}
                />
              );
            })}
          </div>
        </section>

        {/* Equipe (somente quem tem permissão) */}
        {canSeeTeam && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">Equipe</h2>
            {[...teamByRole.entries()].map(([role, members]) => (
              <div key={role} className="rounded-lg border bg-card">
                <div className="px-4 py-2 border-b bg-muted/30">
                  <h3 className="text-sm font-semibold">{ROLE_LABELS[role] || role}</h3>
                </div>
                <div className="divide-y">
                  {members.map((m: any, idx: number) => {
                    const s: Snapshot | undefined = m.snapCur;
                    const sp: Snapshot | undefined = m.snapPrev;
                    const delta = s && sp ? s.composite_score - sp.composite_score : null;
                    return (
                      <div key={m.user_id} className="px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                          {idx === 0 ? <Trophy className="w-4 h-4" /> : (m.display_name?.[0] || "?").toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{m.display_name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Esf {Math.round(s?.effort_score_pct || 0)}% · Qual {s?.quality_score_pct === null || s?.quality_score_pct === undefined ? "—" : `${Math.round(s.quality_score_pct)}%`} · Prz {Math.round(s?.timeliness_score_pct || 0)}%
                          </p>
                        </div>
                        {delta !== null && (
                          <span className={`text-[10px] font-medium ${delta >= 0 ? "text-status-completed" : "text-destructive"}`}>
                            {delta >= 0 ? "+" : ""}{delta.toFixed(1)}
                          </span>
                        )}
                        <span className={`text-lg font-bold ${scoreColor(s?.composite_score || 0)}`}>
                          {Math.round(s?.composite_score || 0)}
                        </span>
                        <button
                          onClick={() => { setDrawerUser(m.user_id); setDrawerPeriod(cur); }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {/* Mini chart */}
                {members.some((m: any) => m.snapCur?.composite_score) && (
                  <div className="p-3 border-t">
                    <div className="h-32">
                      <ResponsiveContainer>
                        <BarChart data={members.map((m: any) => ({ name: m.display_name?.split(" ")[0] || "?", score: Math.round(m.snapCur?.composite_score || 0) }))}>
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                          <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                            {members.map((m: any, i: number) => {
                              const sc = m.snapCur?.composite_score || 0;
                              const color = sc >= 80 ? "hsl(142, 71%, 45%)" : sc >= 60 ? "hsl(38, 92%, 50%)" : "hsl(0, 84%, 60%)";
                              return <Cell key={i} fill={color} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {/* Por dimensão (anônimo) */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">Por dimensão</h2>
          <ByDimension snapshots={snapshots.filter((s) => s.ano === cur.ano && s.mes === cur.mes)} />
        </section>
      </div>

      <DetailsDrawer
        open={!!drawerUser && !!drawerPeriod}
        onOpenChange={(o) => { if (!o) { setDrawerUser(null); setDrawerPeriod(null); } }}
        userId={drawerUser}
        period={drawerPeriod}
        snapshots={snapshots}
        userName={drawerUser ? profileById.get(drawerUser)?.display_name : ""}
      />
    </AppLayout>
  );
}

function MyCard({
  period, snap, delta, rank, roleLabel, onOpenDetails,
}: {
  period: { ano: number; mes: number };
  snap?: Snapshot;
  delta: number | null;
  rank: { pos: number; total: number } | null;
  roleLabel?: string;
  onOpenDetails: () => void;
}) {
  const sc = snap?.composite_score || 0;
  return (
    <div className={`rounded-lg border-2 p-5 ${scoreBg(sc)}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-muted-foreground">{monthLabel(period)}</p>
          <p className="text-xs text-muted-foreground/80">{roleLabel}</p>
        </div>
        {delta !== null && (
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${delta >= 0 ? "bg-status-completed/20 text-status-completed" : "bg-destructive/20 text-destructive"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)} vs. mês anterior
          </span>
        )}
      </div>
      <div className="flex items-end gap-2 mb-4">
        <span className={`text-5xl font-bold leading-none ${scoreColor(sc)}`}>
          {snap ? Math.round(sc) : "—"}
        </span>
        <span className="text-sm text-muted-foreground mb-1">/ 100</span>
      </div>
      {rank && rank.total > 1 && (
        <p className="text-xs text-muted-foreground mb-3">
          Sua posição: <span className="font-semibold text-foreground">{rank.pos}º de {rank.total}</span> entre seus pares
        </p>
      )}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <SubMetric label="Esforço" pct={snap?.effort_score_pct} sub={snap ? `${snap.effort_points.toFixed(0)} pts / ${snap.capacity_minutes} min` : ""} />
        <SubMetric label="Qualidade" pct={snap?.quality_score_pct} sub={snap ? `${snap.submissions_approved_first}/${snap.submissions_total} aprov. 1ª` : ""} />
        <SubMetric label="Prazo" pct={snap?.timeliness_score_pct} sub={snap ? `${snap.tasks_on_time_count}/${snap.tasks_completed_count} no prazo` : ""} />
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={onOpenDetails} disabled={!snap}>
        Ver detalhamento
      </Button>
      {snap?.calculated_at && (
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          Atualizado em {new Date(snap.calculated_at).toLocaleString("pt-BR")}
        </p>
      )}
    </div>
  );
}

function SubMetric({ label, pct, sub }: { label: string; pct: number | null | undefined; sub: string }) {
  return (
    <div className="rounded-md bg-card border p-2 text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${pct === null || pct === undefined ? "text-muted-foreground" : scoreColor(pct)}`}>
        {pct === null || pct === undefined ? "—" : `${Math.round(pct)}%`}
      </p>
      <p className="text-[9px] text-muted-foreground mt-0.5 truncate" title={sub}>{sub}</p>
    </div>
  );
}

function ByDimension({ snapshots }: { snapshots: Snapshot[] }) {
  const histogram = useMemo(() => {
    const bins = [0, 20, 40, 60, 80, 100];
    const counts = bins.slice(0, -1).map((b, i) => ({
      faixa: `${b}-${bins[i + 1]}`,
      qtd: snapshots.filter((s) => s.composite_score >= b && s.composite_score < bins[i + 1]).length,
    }));
    return counts;
  }, [snapshots]);

  const topClients = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of snapshots) {
      const tasks = s.details?.sample_tasks || [];
      for (const t of tasks) {
        if (!t.cliente) continue;
        map.set(t.cliente, (map.get(t.cliente) || 0) + (t.pontos || 0));
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [snapshots]);

  if (!snapshots.length) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
        <AlertCircle className="w-5 h-5 mx-auto mb-2 opacity-50" />
        Nenhum snapshot disponível ainda. Clique em "Recalcular" para gerar.
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div className="rounded-lg border bg-card p-4">
        <h4 className="text-xs font-semibold mb-3 text-muted-foreground">Distribuição de scores no time</h4>
        <div className="h-40">
          <ResponsiveContainer>
            <BarChart data={histogram}>
              <XAxis dataKey="faixa" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Bar dataKey="qtd" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <h4 className="text-xs font-semibold mb-3 text-muted-foreground">Top 5 clientes (pontos gerados)</h4>
        {topClients.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados.</p>
        ) : (
          <div className="space-y-1.5">
            {topClients.map(([name, pts]) => (
              <div key={name} className="flex items-center justify-between text-xs">
                <span className="truncate">{name}</span>
                <span className="font-semibold text-primary">{pts.toFixed(0)} pts</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailsDrawer({
  open, onOpenChange, userId, period, snapshots, userName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string | null;
  period: { ano: number; mes: number } | null;
  snapshots: Snapshot[];
  userName?: string;
}) {
  const snap = useMemo(() => {
    if (!userId || !period) return null;
    return snapshots.find((s) => s.user_id === userId && s.ano === period.ano && s.mes === period.mes);
  }, [snapshots, userId, period]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{userName || "Detalhamento"} — {period ? monthLabel(period) : ""}</SheetTitle>
          <SheetDescription>Composição completa do score do mês</SheetDescription>
        </SheetHeader>
        {!snap ? (
          <p className="text-sm text-muted-foreground mt-6">Sem snapshot calculado para este período.</p>
        ) : (
          <div className="space-y-5 mt-5">
            <div className="grid grid-cols-3 gap-2">
              <SubMetric label="Esforço" pct={snap.effort_score_pct} sub={`${snap.effort_points.toFixed(1)} pts`} />
              <SubMetric label="Qualidade" pct={snap.quality_score_pct} sub={`${snap.submissions_approved_first}/${snap.submissions_total}`} />
              <SubMetric label="Prazo" pct={snap.timeliness_score_pct} sub={`${snap.tasks_on_time_count}/${snap.tasks_completed_count}`} />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
              <p><b>Capacidade:</b> {snap.details?.business_days || 0} dias úteis × {snap.capacity_minutes > 0 ? Math.round(snap.capacity_minutes / Math.max(1, snap.details?.business_days || 1)) : 0} min/dia = {snap.capacity_minutes} min</p>
              {snap.details?.absent_minutes > 0 && (
                <p><b>Ausências:</b> -{snap.details.absent_minutes} min</p>
              )}
              {snap.details?.warmup_active && (
                <p className="text-status-waiting"><b>Warm-up ativo:</b> qualidade desconsiderada, pesos rebalanceados</p>
              )}
              {snap.details?.weights_applied && (
                <p><b>Pesos aplicados:</b> esforço {(snap.details.weights_applied.esforco * 100).toFixed(0)}% · qualidade {(snap.details.weights_applied.qualidade * 100).toFixed(0)}% · prazo {(snap.details.weights_applied.prazo * 100).toFixed(0)}%</p>
              )}
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Tarefas concluídas (amostra)</h4>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-2 py-1.5">Origem</th>
                      <th className="text-left px-2 py-1.5">Cliente</th>
                      <th className="text-left px-2 py-1.5">Compl.</th>
                      <th className="text-right px-2 py-1.5">× cli</th>
                      <th className="text-right px-2 py-1.5">× cmpx</th>
                      <th className="text-right px-2 py-1.5">Pts</th>
                      <th className="text-center px-2 py-1.5">Prz</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(snap.details?.sample_tasks || []).map((t: any, i: number) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5">{t.origem}</td>
                        <td className="px-2 py-1.5 truncate max-w-[120px]">{t.cliente}</td>
                        <td className="px-2 py-1.5">{t.complexidade}</td>
                        <td className="px-2 py-1.5 text-right">{t.multiplicador_cliente?.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right">{t.multiplicador_complexidade?.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right font-semibold text-primary">{t.pontos}</td>
                        <td className="px-2 py-1.5 text-center">{t.no_prazo ? "✓" : "✗"}</td>
                      </tr>
                    ))}
                    {(!snap.details?.sample_tasks?.length) && (
                      <tr><td colSpan={7} className="px-2 py-3 text-center text-muted-foreground">Sem tarefas no período.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

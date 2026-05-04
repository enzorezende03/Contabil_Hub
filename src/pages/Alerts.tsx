import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Clock, FileCheck2, MessageSquareReply, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

type Severity = "vencido" | "vence_hoje" | "proximo";

function severityFromDeadline(deadline: string | null): Severity | null {
  if (!deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deadline);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return "vencido";
  if (diff === 0) return "vence_hoje";
  if (diff <= 3) return "proximo";
  return null;
}

const SEVERITY_BADGE: Record<Severity, { label: string; className: string }> = {
  vencido: { label: "Vencido", className: "bg-red-500/15 text-red-600 border-red-500/30" },
  vence_hoje: { label: "Vence hoje", className: "bg-amber-500/20 text-amber-700 border-amber-500/40" },
  proximo: { label: "Próximo", className: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30" },
};

interface ClientMin { id: string; razao_social: string; }
interface ProfileMin { user_id: string; display_name: string; }

export default function AlertsPage() {
  const navigate = useNavigate();

  const { data: clients = [] } = useQuery({
    queryKey: ["alerts-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, razao_social");
      if (error) throw error;
      return (data || []) as ClientMin[];
    },
  });
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c.razao_social])), [clients]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["alerts-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, display_name");
      if (error) throw error;
      return (data || []) as ProfileMin[];
    },
  });
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p.display_name])), [profiles]);

  const { data: plannings = [] } = useQuery({
    queryKey: ["alerts-plannings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plannings")
        .select("id, client, description, internal_deadline, status, assignee, types")
        .neq("status", "completed")
        .order("internal_deadline", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: demands = [] } = useQuery({
    queryKey: ["alerts-demands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("demands")
        .select("id, client, description, client_deadline, internal_deadline, status, assignee, types")
        .neq("status", "completed")
        .order("client_deadline", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["alerts-reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_submissions")
        .select("id, client_id, competencia, status, submitted_at, reviewer_id, submitted_by")
        .in("status", ["aguardando", "em_revisao"])
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: pendenciesResponded = [] } = useQuery({
    queryKey: ["alerts-pendencies-responded"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pendencies")
        .select("id, client_id, descricao, competencia, status, last_client_submit_at, client_submit_count, responsavel_id")
        .eq("tipo", "externa")
        .not("last_client_submit_at", "is", null)
        .in("status", ["aguardando_resposta", "resolvida"])
        .order("last_client_submit_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Filtragens
  const alertPlannings = plannings
    .map((p: any) => ({ ...p, _sev: severityFromDeadline(p.internal_deadline) }))
    .filter((p) => p._sev !== null);

  const alertDemands = demands
    .map((d: any) => ({ ...d, _sev: severityFromDeadline(d.client_deadline || d.internal_deadline) }))
    .filter((d) => d._sev !== null);

  const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";
  const fmtComp = (d?: string | null) => d ? new Date(d).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "—";
  const fmtDateTime = (d?: string | null) => d ? new Date(d).toLocaleString("pt-BR") : "—";

  const totalAlerts = alertPlannings.length + alertDemands.length + reviews.length + pendenciesResponded.length;

  return (
    <AppLayout>
      <div className="p-6 space-y-4 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alertas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalAlerts === 0 ? "Tudo em dia ✅" : `${totalAlerts} situação(ões) que requerem atenção`}
          </p>
        </div>

        {/* Planejamentos */}
        <SectionCard
          title="Planejamentos próximos a vencer ou vencidos"
          icon={CalendarClock}
          color="text-amber-600"
          count={alertPlannings.length}
          onSeeAll={() => navigate("/planejamento")}
          empty="Nenhum planejamento em alerta ✅"
        >
          {alertPlannings.map((p: any) => (
            <RowItem
              key={p.id}
              onClick={() => navigate("/planejamento")}
              title={p.client}
              subtitle={`${p.description || "(sem descrição)"} · prazo ${fmtDate(p.internal_deadline)}`}
              right={
                <>
                  <span className="text-xs text-muted-foreground">
                    {profileMap.get(p.assignee) || p.assignee || "—"}
                  </span>
                  <SeverityBadge sev={p._sev} />
                </>
              }
            />
          ))}
        </SectionCard>

        {/* Solicitações de cliente (demandas) */}
        <SectionCard
          title="Solicitações de clientes próximas a vencer ou vencidas"
          icon={Clock}
          color="text-red-600"
          count={alertDemands.length}
          onSeeAll={() => navigate("/demandas")}
          empty="Nenhuma solicitação em alerta ✅"
        >
          {alertDemands.map((d: any) => (
            <RowItem
              key={d.id}
              onClick={() => navigate("/demandas")}
              title={d.client}
              subtitle={`${d.description || "(sem descrição)"} · prazo cliente ${fmtDate(d.client_deadline)}`}
              right={
                <>
                  <span className="text-xs text-muted-foreground">
                    {profileMap.get(d.assignee) || d.assignee || "—"}
                  </span>
                  <SeverityBadge sev={d._sev} />
                </>
              }
            />
          ))}
        </SectionCard>

        {/* Revisões em aberto */}
        <SectionCard
          title="Pedidos de revisão em aberto"
          icon={FileCheck2}
          color="text-blue-600"
          count={reviews.length}
          onSeeAll={() => navigate("/revisao")}
          empty="Nenhum pedido de revisão em aberto ✅"
        >
          {reviews.map((r: any) => {
            const ageH = Math.floor((Date.now() - new Date(r.submitted_at).getTime()) / 3_600_000);
            const stale = ageH > 24 && r.status === "aguardando";
            return (
              <RowItem
                key={r.id}
                onClick={() => navigate("/revisao")}
                title={clientMap.get(r.client_id) || "Cliente"}
                subtitle={`Competência ${fmtComp(r.competencia)} · enviado ${fmtDateTime(r.submitted_at)}`}
                right={
                  <>
                    <span className="text-xs text-muted-foreground">
                      Revisor: {profileMap.get(r.reviewer_id) || "—"}
                    </span>
                    <span className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                      r.status === "em_revisao"
                        ? "bg-blue-500/15 text-blue-600 border-blue-500/30"
                        : stale
                          ? "bg-red-500/15 text-red-600 border-red-500/30"
                          : "bg-amber-500/15 text-amber-700 border-amber-500/30"
                    )}>
                      {r.status === "em_revisao" ? "Em revisão" : stale ? "Aguardando >24h" : "Aguardando"}
                    </span>
                  </>
                }
              />
            );
          })}
        </SectionCard>

        {/* Pendências respondidas */}
        <SectionCard
          title="Pendências respondidas pelos clientes"
          icon={MessageSquareReply}
          color="text-emerald-600"
          count={pendenciesResponded.length}
          onSeeAll={() => navigate("/pendencias")}
          empty="Nenhuma resposta pendente de análise ✅"
        >
          {pendenciesResponded.map((p: any) => (
            <RowItem
              key={p.id}
              onClick={() => navigate("/pendencias")}
              title={clientMap.get(p.client_id) || "Cliente"}
              subtitle={`${p.descricao || "—"} · competência ${fmtComp(p.competencia)} · respondido ${fmtDateTime(p.last_client_submit_at)}`}
              right={
                <>
                  <span className="text-xs text-muted-foreground">
                    {p.client_submit_count} envio(s)
                  </span>
                  <span className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                    p.status === "resolvida"
                      ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                      : "bg-amber-500/15 text-amber-700 border-amber-500/30"
                  )}>
                    {p.status === "resolvida" ? "Completa" : "Parcial"}
                  </span>
                </>
              }
            />
          ))}
        </SectionCard>
      </div>
    </AppLayout>
  );
}

function SectionCard({ title, icon: Icon, color, count, empty, onSeeAll, children }: {
  title: string; icon: any; color: string; count: number; empty: string; onSeeAll?: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className={cn("text-sm font-semibold flex items-center gap-2", color)}>
          <Icon className="w-4 h-4" />
          {title}
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{count}</span>
        </h3>
        {onSeeAll && count > 0 && (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Ver todos
          </button>
        )}
      </div>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y divide-border">{children}</div>
      )}
    </div>
  );
}

function RowItem({ title, subtitle, right, onClick }: {
  title: string; subtitle: string; right: React.ReactNode; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between py-2 gap-4 text-left hover:bg-muted/40 transition-colors px-1 rounded"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">{right}</div>
    </button>
  );
}

function SeverityBadge({ sev }: { sev: Severity }) {
  const cfg = SEVERITY_BADGE[sev];
  return (
    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap", cfg.className)}>
      {cfg.label}
    </span>
  );
}

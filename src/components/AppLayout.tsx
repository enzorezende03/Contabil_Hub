import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessPage, type AppPage } from "@/lib/permissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePlanningAlerts } from "@/hooks/use-planning-alerts";
import { PlanningNotifications } from "@/components/PlanningNotifications";
import { useActionPermissions, canPerformAction } from "@/hooks/use-action-permissions";
import type { Demand } from "@/lib/types";

import {
  LayoutDashboard,
  ListTodo,
  Users,
  Calendar,
  BarChart3,
  Archive,
  Settings,
  AlertTriangle,
  LogOut,
  UserCog,
  Building2,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  AlertOctagon,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", path: "/" as AppPage, icon: LayoutDashboard },
  { label: "Solicitação de Clientes", path: "/demandas" as AppPage, icon: ListTodo },
  { label: "Planejamento", path: "/planejamento" as AppPage, icon: ClipboardList },
  { label: "Produtividade Equipe", path: "/equipe" as AppPage, icon: Users },
  { label: "Ausências", path: "/ausencias" as AppPage, icon: Calendar },
  { label: "Fechamento Contábil", path: "/competencias" as AppPage, icon: Calendar },
  { label: "Revisão", path: "/revisao" as AppPage, icon: ShieldCheck },
  { label: "Pendências", path: "/pendencias" as AppPage, icon: AlertOctagon },
  { label: "Alertas", path: "/alertas" as AppPage, icon: AlertTriangle },
  { label: "Clientes", path: "/clientes" as AppPage, icon: Building2 },
  { label: "Configurações", path: "/configuracoes" as AppPage, icon: Settings },
  { label: "Usuários", path: "/usuarios" as AppPage, icon: UserCog },
];

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const { profile, signOut, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const initials = profile?.display_name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "??";
  const userRole = profile?.role;

  const { data: plannings = [] } = useQuery({
    queryKey: ["plannings-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plannings").select("*").neq("status", "completed");
      if (error) throw error;
      return (data || []).map((d: any): Demand => ({
        id: d.id,
        client: d.client,
        competencias: d.competencias,
        types: d.types,
        description: d.description,
        assignee: d.assignee,
        complexity: "media",
        weight: 1,
        priority: d.priority,
        internalDeadline: d.internal_deadline,
        clientDeadline: d.internal_deadline,
        status: d.status,
        timeSpentMinutes: 0,
        notes: d.notes,
        isLegacy: false,
        createdAt: d.created_at,
      }));
    },
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
  });

  const alertData = usePlanningAlerts(plannings);

  // Review badge: count submissions where the current user should act
  useActionPermissions();
  const canSupervise = canPerformAction("supervisionar_revisao", userRole);
  const queryClient = useQueryClient();


  const { data: reviewBadge = { mine: 0, total: 0, stale: false } } = useQuery({
    queryKey: ["review-badge", user?.id, canSupervise],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!user) return { mine: 0, total: 0, stale: false };
      // Meu trabalho: revisões designadas a mim (aguardando+em_revisao) + devoluções minhas
      const { data: assignedToMe } = await supabase
        .from("review_submissions")
        .select("id, submitted_at, status")
        .in("status", ["aguardando", "em_revisao"])
        .eq("reviewer_id", user.id);
      const { data: returnedToMe } = await supabase
        .from("review_submissions")
        .select("id, submitted_at, status")
        .eq("status", "devolvido")
        .eq("submitted_by", user.id);
      const mineList = [...(assignedToMe || []), ...(returnedToMe || [])];
      const stale = mineList.some((r: any) => {
        const ageH = (Date.now() - new Date(r.submitted_at).getTime()) / 3_600_000;
        return ageH > 24;
      });
      let total = mineList.length;
      if (canSupervise) {
        const { count } = await supabase
          .from("review_submissions")
          .select("id", { count: "exact", head: true })
          .in("status", ["aguardando", "em_revisao", "devolvido"]);
        total = count || 0;
      }
      return { mine: mineList.length, total, stale };
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("review-badge-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "review_submissions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["review-badge"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  // Pendency badge: "para cobrar hoje" do usuário atual
  const { data: pendencyBadge = { toCobrar: 0, vencidas: 0 } } = useQuery({
    queryKey: ["pendency-badge", user?.id],
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user) return { toCobrar: 0, vencidas: 0 };
      const { data } = await supabase
        .from("pendencies")
        .select("id, prazo_resposta, next_followup_at, followup_paused")
        .eq("responsavel_id", user.id)
        .not("status", "in", "(resolvida,cancelada)");
      const today = new Date(new Date().toDateString());
      const now = new Date();
      const list = data || [];
      return {
        toCobrar: list.filter((p: any) => !p.followup_paused && p.next_followup_at && new Date(p.next_followup_at) <= now).length,
        vencidas: list.filter((p: any) => p.prazo_resposta && new Date(p.prazo_resposta) < today).length,
      };
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("pendency-badge-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "pendencies" }, () => {
        queryClient.invalidateQueries({ queryKey: ["pendency-badge"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const navItems = NAV_ITEMS.filter((item) => canAccessPage(userRole, item.path));

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${collapsed ? "w-14" : "w-60"} flex-shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border transition-all duration-200`}
      >
        <div className="h-16 flex items-center justify-between px-3 border-b border-sidebar-border">
          {!collapsed && (
            <div className="leading-tight">
              <span className="font-semibold text-sidebar-accent-foreground tracking-tight text-base block">Contábil Hub</span>
              <span className="text-[10px] text-sidebar-foreground/60">2M Grupo</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <PlanningNotifications {...alertData} />
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1.5 rounded-md text-sidebar-foreground/60 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50 transition-colors"
              title={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const showBadge = item.path === "/revisao" && reviewBadge.mine > 0;
            const showTotalBadge = item.path === "/revisao" && canSupervise && reviewBadge.total > reviewBadge.mine;
            const showPendencyBadge = item.path === "/pendencias" && pendencyBadge.toCobrar > 0;
            const pendencyAlert = item.path === "/pendencias" && pendencyBadge.vencidas > 0;
            return (
              <Link
                key={item.path}
                to={item.path}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                } ${collapsed ? "justify-center px-0" : ""}`}
              >
                <span className="relative flex-shrink-0">
                  <item.icon className="w-4 h-4" />
                  {showBadge && collapsed && (
                    <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${reviewBadge.stale ? "bg-destructive" : "bg-warning"}`} />
                  )}
                  {showPendencyBadge && collapsed && (
                    <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${pendencyAlert ? "bg-destructive" : "bg-warning"}`} />
                  )}
                </span>
                {!collapsed && (
                  <span className="flex-1 flex items-center justify-between gap-1">
                    {item.label}
                    <span className="flex items-center gap-1">
                      {showBadge && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${reviewBadge.stale ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground"}`}>
                          {reviewBadge.mine}
                        </span>
                      )}
                      {showTotalBadge && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground" title="Total no sistema (supervisão)">
                          /{reviewBadge.total}
                        </span>
                      )}
                      {showPendencyBadge && (
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${pendencyAlert ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground"}`}
                          title={pendencyAlert ? `${pendencyBadge.vencidas} vencida(s)` : "Para cobrar hoje"}
                        >
                          {pendencyBadge.toCobrar}
                        </span>
                      )}
                    </span>
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-2 border-t border-sidebar-border">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-medium text-sidebar-accent-foreground">
                {initials}
              </div>
              <button onClick={signOut} className="text-sidebar-foreground/60 hover:text-sidebar-accent-foreground transition-colors" title="Sair">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-medium text-sidebar-accent-foreground">
                {initials}
              </div>
              <div className="text-xs flex-1">
                <div className="font-medium text-sidebar-accent-foreground">{profile?.display_name || "—"}</div>
                <div className="text-sidebar-foreground/60 capitalize">{profile?.role || "—"}</div>
              </div>
              <button onClick={signOut} className="text-sidebar-foreground/60 hover:text-sidebar-accent-foreground transition-colors" title="Sair">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

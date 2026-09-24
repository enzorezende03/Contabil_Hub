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
import logo2m from "@/assets/logo-2m-grupo.png";
import { Button } from "@/components/ui/button";

import {
  ListTodo,
  Calendar,
  Settings,
  LogOut,
  UserCog,
  Building2,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  AlertOctagon,
  Gauge,
  Menu,
  Clock3,
} from "lucide-react";

const NAV_ITEMS = [
  // Ocultos temporariamente até serem mais desenvolvidos:
  // Dashboard ("/"), Produtividade Equipe ("/equipe"), Ausências ("/ausencias"), Alertas ("/alertas")
  { label: "Solicitação de Clientes", path: "/demandas" as AppPage, icon: ListTodo, group: "OPERAÇÃO" },
  { label: "Planejamento", path: "/planejamento" as AppPage, icon: ClipboardList, group: "OPERAÇÃO" },
  { label: "Fechamento Contábil", path: "/competencias" as AppPage, icon: Calendar, group: "OPERAÇÃO" },
  { label: "Revisão", path: "/revisao" as AppPage, icon: ShieldCheck, group: "OPERAÇÃO" },
  { label: "Pendências", path: "/pendencias" as AppPage, icon: AlertOctagon, group: "OPERAÇÃO" },
  { label: "Controle Gerencial", path: "/controle-gerencial" as AppPage, icon: Gauge, group: "GESTÃO" },
  { label: "Clientes", path: "/clientes" as AppPage, icon: Building2, group: "GESTÃO" },
  { label: "Configurações", path: "/configuracoes" as AppPage, icon: Settings, group: "ADMINISTRAÇÃO" },
  { label: "Usuários", path: "/usuarios" as AppPage, icon: UserCog, group: "ADMINISTRAÇÃO" },
];

const PAGE_TITLES: Record<string, string> = {
  "/demandas": "Solicitação de Clientes",
  "/planejamento": "Planejamento",
  "/competencias": "Fechamento Contábil",
  "/revisao": "Revisão",
  "/pendencias": "Pendências",
  "/controle-gerencial": "Controle Gerencial",
  "/clientes": "Cadastro de Clientes",
  "/configuracoes": "Configurações",
  "/usuarios": "Usuários",
};

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const { profile, signOut, user, isAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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

  const navItems = NAV_ITEMS.filter((item) => isAdmin || canAccessPage(userRole, item.path));
  const pageTitle = Object.entries(PAGE_TITLES).find(([path]) => location.pathname.startsWith(path))?.[1] || "Contábil Hub";
  const navGroups = ["OPERAÇÃO", "GESTÃO", "ADMINISTRAÇÃO"];

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-foreground/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      {/* Sidebar */}
      <aside
        className={`${collapsed ? "lg:w-16" : "lg:w-60"} ${mobileOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-50 w-60 flex-shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border transition-all duration-200 lg:static lg:translate-x-0`}
      >
        <div className="h-[106px] flex items-center justify-between px-7 border-b border-sidebar-border">
          {!collapsed && (
            <div className="flex items-center gap-5 min-w-0">
              <img src={logo2m} alt="2M Grupo" className="h-12 w-12 object-contain" />
              <div className="min-w-0">
                <span className="font-bold text-sidebar-accent-foreground text-base leading-tight block">CONTÁBIL HUB</span>
                <span className="mt-1 text-[11px] leading-[15px] font-semibold text-sidebar-foreground/65 uppercase block">2M SAÚDE</span>
                <span className="text-[11px] leading-[15px] font-semibold text-sidebar-foreground/65 uppercase block">2M CONTABILIDADE</span>
              </div>
            </div>
          )}
          {collapsed && <img src={logo2m} alt="2M Grupo" className="hidden lg:block h-9 w-9 object-contain mx-auto" />}
        </div>

        <nav className="flex-1 py-5 px-2 space-y-5 overflow-y-auto">
          {navGroups.map((group) => {
            const groupItems = navItems.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group} className="space-y-1">
                {!collapsed && <p className="px-3 pb-1.5 text-[10px] font-semibold text-sidebar-foreground/45">{group}</p>}
                {groupItems.map((item) => {
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
                    ? "bg-sidebar-accent text-sidebar-primary font-medium shadow-sm"
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
              </div>
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
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="h-[72px] flex-shrink-0 border-b bg-card px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
              <Menu />
            </Button>
            <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
            <div className="min-w-0">
              <h1 className="font-semibold text-base text-foreground truncate">{pageTitle}</h1>
              <p className="text-xs text-muted-foreground truncate">Ambiente operacional Contábil Hub</p>
            </div>
          </div>
          <div className="flex items-center rounded-lg border bg-secondary/40 p-1 shadow-sm">
            <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground" title="Acompanhamento de prazos">
              <Clock3 />
            </Button>
            <PlanningNotifications {...alertData} />
            <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground" onClick={signOut} title="Sair">
              <LogOut />
            </Button>
          </div>
        </header>
        <main className="flex-1 min-w-0 overflow-y-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}

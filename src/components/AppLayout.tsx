import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessPage, type AppPage } from "@/lib/permissions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePlanningAlerts } from "@/hooks/use-planning-alerts";
import { PlanningNotifications } from "@/components/PlanningNotifications";
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
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", path: "/" as AppPage, icon: LayoutDashboard },
  { label: "Solicitação de Clientes", path: "/demandas" as AppPage, icon: ListTodo },
  { label: "Planejamento", path: "/planejamento" as AppPage, icon: ClipboardList },
  { label: "Produtividade Equipe", path: "/equipe" as AppPage, icon: Users },
  { label: "Fechamento Contábil", path: "/competencias" as AppPage, icon: Calendar },
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
  const { profile, signOut } = useAuth();
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
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && item.label}
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

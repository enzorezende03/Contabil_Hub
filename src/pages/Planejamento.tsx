import { useState, useMemo, useEffect } from "react";
import { usePersistedFilter } from "@/hooks/use-persisted-filter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { useTeamMembers } from "@/hooks/use-team-members";
import { useActionPermissions, canPerformAction } from "@/hooks/use-action-permissions";
import {
  DEMAND_TYPE_LABELS,
  DemandStatus,
  DemandType,
  STATUS_LABELS,
  PRIORITY_LABELS,
  Priority,
  type Demand,
} from "@/lib/types";
import { formatMinutes, getDeadlineUrgency } from "@/lib/demand-utils";
import { Search, LayoutGrid, List, Clock, Plus, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreatePlanningDialog } from "@/components/CreatePlanningDialog";
import { WorkloadPanel } from "@/components/WorkloadPanel";
import { PlanningTimeline } from "@/components/PlanningTimeline";
import { toast } from "sonner";

type ViewMode = "list" | "kanban" | "timeline";

const KANBAN_COLUMNS: DemandStatus[] = [
  "not_started",
  "in_progress",
  "in_review",
  "waiting_info",
  "blocked",
  "completed",
];

const PRIORITY_ORDER: Record<Priority, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };

export default function PlanejamentoPage() {
  const [view, setView] = usePersistedFilter<ViewMode>("planejamento", "view", "kanban");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = usePersistedFilter<string>("planejamento", "type", "all");
  const [filterAssignee, setFilterAssignee] = usePersistedFilter<string>("planejamento", "assignee", "all");
  const [createOpen, setCreateOpen] = useState(false);
  const { members: teamMembers } = useTeamMembers();
  const { user, profile } = useAuth();
  useActionPermissions();
  const canSeeAll = canPerformAction("ver_todas_demandas", profile?.role);

  const { data: dbPlannings = [], refetch } = useQuery({
    queryKey: ["plannings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plannings").select("*").order("created_at", { ascending: false });
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
  });

  const [statusEntries, setStatusEntries] = useState<Record<string, DemandStatus>>({});

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("demand_status_entries")
        .select("client_name, month, year, demand_type, status");
      if (data) {
        const map: Record<string, DemandStatus> = {};
        data.forEach((d: any) => {
          const key = `${d.client_name}|${d.month}/${d.year}|${d.demand_type}`;
          map[key] = d.status as DemandStatus;
        });
        setStatusEntries(map);
      }
    };
    load();
  }, []);

  const planningsWithDerivedStatus = useMemo(() => {
    return dbPlannings.map((d) => {
      const closingTypes = ["lancamentos", "conciliacao_bancaria", "conciliacao_contabil"];
      const relevantTypes = d.types.filter((t) => closingTypes.includes(t));
      if (relevantTypes.length === 0 || d.competencias.length === 0) return d;

      const allStatuses: DemandStatus[] = [];
      d.competencias.forEach((comp) => {
        relevantTypes.forEach((type) => {
          const key = `${d.client}|${comp}|${type}`;
          allStatuses.push(statusEntries[key] || "not_started");
        });
      });

      let derivedStatus: DemandStatus;
      if (allStatuses.every((s) => s === "completed")) derivedStatus = "completed";
      else if (allStatuses.some((s) => s === "waiting_info")) derivedStatus = "waiting_info";
      else if (allStatuses.some((s) => s === "blocked")) derivedStatus = "blocked";
      else if (allStatuses.some((s) => s !== "not_started")) derivedStatus = "in_progress";
      else derivedStatus = "not_started";

      return { ...d, status: derivedStatus };
    });
  }, [dbPlannings, statusEntries]);

  const filtered = useMemo(() => {
    return planningsWithDerivedStatus
      .filter((d) => {
        if (search && !d.client.toLowerCase().includes(search.toLowerCase()) && !d.description.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterType !== "all" && !d.types.includes(filterType as DemandType)) return false;
        if (filterAssignee !== "all" && d.assignee !== filterAssignee) return false;
        return true;
      })
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }, [search, filterType, filterAssignee, planningsWithDerivedStatus]);

  const getMember = (id: string) => teamMembers.find((m) => m.id === id);

  const urgencyClass = (deadline: string) => {
    const u = getDeadlineUrgency(deadline);
    if (u === "overdue") return "text-status-late font-medium";
    if (u === "today") return "text-status-waiting font-medium";
    if (u === "soon") return "text-status-waiting/70";
    return "text-muted-foreground";
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-4 max-w-7xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Planejamento Interno</h1>
            <p className="text-sm text-muted-foreground mt-1">{filtered.length} planejamentos</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" />
              Novo Planejamento
            </Button>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              <button onClick={() => setView("kanban")} className={`p-1.5 rounded-md transition-colors ${view === "kanban" ? "bg-card shadow-sm" : ""}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setView("list")} className={`p-1.5 rounded-md transition-colors ${view === "list" ? "bg-card shadow-sm" : ""}`}>
                <List className="w-4 h-4" />
              </button>
              <button onClick={() => setView("timeline")} className={`p-1.5 rounded-md transition-colors ${view === "timeline" ? "bg-card shadow-sm" : ""}`}>
                <CalendarRange className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-muted-foreground" />
            <input
              placeholder="Buscar empresa ou descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 pr-3 text-sm border rounded-md bg-card focus:outline-none focus:ring-1 focus:ring-primary w-56"
            />
          </div>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-8 px-2 text-sm border rounded-md bg-card">
            <option value="all">Todos os tipos</option>
            {Object.entries(DEMAND_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className="h-8 px-2 text-sm border rounded-md bg-card">
            <option value="all">Todos responsáveis</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Workload Panel */}
        <WorkloadPanel
          plannings={planningsWithDerivedStatus}
          activeFilter={filterAssignee}
          onFilterByAssignee={setFilterAssignee}
        />

        {view === "kanban" && (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {KANBAN_COLUMNS.map((status) => {
              const col = filtered.filter((d) => d.status === status);
              return (
                <div key={status} className="flex-shrink-0 w-72">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <StatusBadge status={status} />
                    <span className="text-xs text-muted-foreground font-medium">{col.length}</span>
                  </div>
                  <div className="space-y-2">
                    {col.map((d) => (
                      <div key={d.id} className="rounded-lg border bg-card p-3 hover:border-primary/30 transition-colors cursor-pointer">
                        <div className="flex items-start justify-between mb-1.5">
                          <p className="text-sm font-medium leading-tight">{d.client}</p>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            d.priority === "urgente" ? "bg-destructive/10 text-destructive" :
                            d.priority === "alta" ? "bg-status-waiting/10 text-status-waiting" :
                            "bg-muted text-muted-foreground"
                          }`}>
                            {PRIORITY_LABELS[d.priority]}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {d.types.map((t) => (
                            <span key={t} className="text-[9px] bg-muted px-1.5 py-0.5 rounded font-medium">
                              {DEMAND_TYPE_LABELS[t]}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {d.competencias.length > 2
                              ? `${d.competencias[0]} … ${d.competencias[d.competencias.length - 1]}`
                              : d.competencias.join(", ")}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={urgencyClass(d.internalDeadline)}>
                              <Clock className="w-3 h-3 inline mr-0.5" />
                              {new Date(d.internalDeadline).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                            </span>
                            <span className="text-muted-foreground">
                              {getMember(d.assignee)?.name.split(" ")[0]}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {col.length === 0 && (
                      <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                        Nenhum planejamento
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === "list" && (
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Empresa</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Atividades</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Competências</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Prazo</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/30 transition-colors cursor-pointer">
                    <td className="px-3 py-2.5 font-medium">{d.client}</td>
                    <td className="px-3 py-2.5 text-xs max-w-40">
                      <div className="flex flex-wrap gap-1">
                        {d.types.map((t) => (
                          <span key={t} className="bg-muted px-1 py-0.5 rounded text-[10px]">{DEMAND_TYPE_LABELS[t]}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{d.competencias.join(", ")}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={d.status} /></td>
                    <td className={`px-3 py-2.5 text-xs ${urgencyClass(d.internalDeadline)}`}>
                      {new Date(d.internalDeadline).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-3 py-2.5 text-xs">{getMember(d.assignee)?.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {view === "timeline" && (
          <PlanningTimeline plannings={filtered} />
        )}
      </div>

      <CreatePlanningDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existingPlannings={planningsWithDerivedStatus}
        onCreated={() => {
          refetch();
          toast.success("Planejamento criado com sucesso!");
        }}
      />
    </AppLayout>
  );
}

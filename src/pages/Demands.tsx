import { useState, useMemo, useEffect } from "react";
import { usePersistedFilter } from "@/hooks/use-persisted-filter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { useTeamMembers } from "@/hooks/use-team-members";
import {
  DEMAND_TYPE_LABELS,
  DemandStatus,
  DemandType,
  STATUS_LABELS,
  PRIORITY_LABELS,
  Priority,
  type Demand,
} from "@/lib/types";
import { getDeadlineUrgency } from "@/lib/demand-utils";
import { Search, LayoutGrid, List, Plus, AlertTriangle, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { CreateDemandDialog } from "@/components/CreateDemandDialog";
import { DemandDetailsDialog } from "@/components/DemandDetailsDialog";
import { PlanningCard } from "@/components/planning/PlanningCard";
import { useIsMobile } from "@/hooks/use-mobile";
import { useActionPermissions, canPerformAction } from "@/hooks/use-action-permissions";
import { toast } from "sonner";

type ViewMode = "list" | "kanban";
type ActiveCol = "not_started" | "in_progress" | "paused";

const ACTIVE_COLS: ActiveCol[] = ["not_started", "in_progress", "paused"];
const PRIORITY_ORDER: Record<Priority, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
const COL_INITIAL_LIMIT = 20;

export default function DemandsPage() {
  const [view, setView] = usePersistedFilter<ViewMode>("demandas", "view", "kanban");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = usePersistedFilter<string>("demandas", "type", "all");
  const [filterPriority, setFilterPriority] = usePersistedFilter<string>("demandas", "priority", "all");
  const [filterAssignee, setFilterAssignee] = usePersistedFilter<string>("demandas", "assignee", "all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDemand, setSelectedDemand] = useState<Demand | null>(null);
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({});
  const [completedOpen, setCompletedOpen] = useState(false);
  const isMobile = useIsMobile();

  const { members: teamMembers } = useTeamMembers({ excludeCoordenacao: true });
  const { user, profile } = useAuth();
  useActionPermissions();
  const canSeeAll = canPerformAction("ver_todas_demandas", profile?.role);

  const { data: dbDemands = [], refetch: refetchDemands } = useQuery({
    queryKey: ["demands"],
    queryFn: async () => {
      const { data, error } = await supabase.from("demands").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((d: any): Demand => ({
        id: d.id,
        client: d.client,
        competencias: d.competencias,
        types: d.types,
        description: d.description,
        assignee: d.assignee,
        complexity: d.complexity,
        weight: d.weight,
        priority: d.priority,
        internalDeadline: d.internal_deadline,
        clientDeadline: d.client_deadline,
        status: d.status,
        timeSpentMinutes: d.time_spent_minutes,
        notes: d.notes,
        isLegacy: d.is_legacy,
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

  const demandsWithDerivedStatus = useMemo(() => {
    return dbDemands.map((d) => {
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
  }, [dbDemands, statusEntries]);

  const filtered = useMemo(() => {
    return demandsWithDerivedStatus
      .filter((d) => {
        if (!canSeeAll && user && d.assignee !== user.id) return false;
        if (search && !d.client.toLowerCase().includes(search.toLowerCase()) && !d.description.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterType !== "all" && !d.types.includes(filterType as DemandType)) return false;
        if (filterPriority !== "all" && d.priority !== filterPriority) return false;
        if (filterAssignee !== "all" && d.assignee !== filterAssignee) return false;
        return true;
      })
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }, [search, filterType, filterPriority, filterAssignee, demandsWithDerivedStatus, canSeeAll, user]);

  const getMember = (id: string) => teamMembers.find((m) => m.id === id);

  const completedDemands = useMemo(
    () => filtered.filter((d) => d.status === "completed"),
    [filtered]
  );
  const activeOnly = useMemo(
    () => filtered.filter((d) => d.status !== "completed"),
    [filtered]
  );

  const columnsData = useMemo(() => {
    const cols: Record<ActiveCol, Demand[]> = { not_started: [], in_progress: [], paused: [] };
    activeOnly.forEach((d) => {
      if (d.status === "waiting_info" || d.status === "blocked") cols.paused.push(d);
      else if (d.status === "not_started") cols.not_started.push(d);
      else cols.in_progress.push(d);
    });
    return cols;
  }, [activeOnly]);

  const renderColumn = (col: ActiveCol) => {
    const items = columnsData[col];
    const isPaused = col === "paused";
    const isExpanded = expandedCols[col] || false;
    const visible = isExpanded ? items : items.slice(0, COL_INITIAL_LIMIT);
    const hidden = items.length - visible.length;

    const headerLabel =
      col === "not_started" ? "Não iniciada" : col === "in_progress" ? "Em andamento" : "Pausada · aguardando";
    const headerTone =
      col === "not_started"
        ? "text-muted-foreground border-border"
        : col === "in_progress"
          ? "text-info border-info/30"
          : "text-warning border-warning";
    const pillTone =
      col === "not_started"
        ? "bg-muted text-muted-foreground"
        : col === "in_progress"
          ? "bg-info/15 text-info"
          : "bg-warning text-warning-foreground";

    return (
      <div
        key={col}
        className={`flex flex-col rounded-lg ${isPaused ? "bg-warning/[0.06] border border-warning/40 p-2" : ""}`}
      >
        <div className={`flex items-center justify-between gap-2 mb-2 px-1 pb-1.5 border-b ${headerTone}`}>
          <div className="flex items-center gap-1.5">
            {isPaused && <AlertTriangle className="w-3.5 h-3.5" />}
            <span className="text-[11px] font-semibold uppercase tracking-[0.3px]">{headerLabel}</span>
          </div>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${pillTone}`}>
            {items.length}
          </span>
        </div>
        <div className="space-y-2">
          {visible.map((d) => (
            <PlanningCard
              key={d.id}
              demand={d}
              pendencies={[]}
              memberName={getMember(d.assignee)?.name}
              onClick={() => setSelectedDemand(d)}
            />
          ))}
          {items.length === 0 && (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              {isPaused ? "Nenhuma demanda aguardando" : "Nenhuma demanda"}
            </div>
          )}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpandedCols((s) => ({ ...s, [col]: true }))}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2 rounded border border-dashed"
            >
              + {hidden} outras
            </button>
          )}
        </div>
      </div>
    );
  };

  const segBtn = (active: boolean) =>
    `inline-flex items-center justify-center p-1.5 rounded-md transition-colors ${active ? "bg-card shadow-sm" : ""}`;

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-4 max-w-7xl">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Solicitação de Clientes</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filtered.length} demanda{filtered.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
              <button onClick={() => setView("kanban")} className={segBtn(view === "kanban")} aria-label="Kanban">
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setView("list")} className={segBtn(view === "list")} aria-label="Lista">
                <List className="w-4 h-4" />
              </button>
            </div>
            <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" />
              Nova Demanda
            </Button>
          </div>
        </div>

        {/* FILTERS */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-muted-foreground" />
            <input
              placeholder="Buscar cliente ou descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full pl-8 pr-3 text-sm border rounded-md bg-card focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-8 px-2 text-xs border rounded-full bg-card">
            <option value="all">Todos os tipos</option>
            {Object.entries(DEMAND_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="h-8 px-2 text-xs border rounded-full bg-card">
            <option value="all">Todas prioridades</option>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className="h-8 px-2 text-xs border rounded-full bg-card">
            <option value="all">Todos responsáveis</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* KANBAN */}
        {view === "kanban" && (
          <>
            {isMobile ? (
              <Tabs defaultValue="in_progress" className="w-full">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="not_started" className="text-[11px]">Não iniciada ({columnsData.not_started.length})</TabsTrigger>
                  <TabsTrigger value="in_progress" className="text-[11px]">Em andamento ({columnsData.in_progress.length})</TabsTrigger>
                  <TabsTrigger value="paused" className="text-[11px] data-[state=active]:text-warning">
                    Pausada ({columnsData.paused.length})
                  </TabsTrigger>
                </TabsList>
                {ACTIVE_COLS.map((c) => (
                  <TabsContent key={c} value={c} className="mt-3">
                    {renderColumn(c)}
                  </TabsContent>
                ))}
              </Tabs>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {ACTIVE_COLS.map(renderColumn)}
              </div>
            )}

            {/* Completed section */}
            <Collapsible open={completedOpen} onOpenChange={setCompletedOpen} className="mt-4">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2.5 hover:bg-muted/40 transition"
                >
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-success" />
                    <span className="text-sm font-medium">Concluídas</span>
                    <span className="text-xs font-semibold bg-success/15 text-success px-1.5 py-0.5 rounded-full">
                      {completedDemands.length}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground transition-transform ${completedOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {completedDemands.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground mt-2">
                    Nenhuma demanda concluída.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                    {completedDemands.map((d) => (
                      <PlanningCard
                        key={d.id}
                        demand={d}
                        pendencies={[]}
                        memberName={getMember(d.assignee)?.name}
                        onClick={() => setSelectedDemand(d)}
                      />
                    ))}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </>
        )}

        {/* LIST */}
        {view === "list" && (
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Cliente</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Atividades</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Competências</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Prioridade</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Prazo</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setSelectedDemand(d)}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{d.client}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-48">{d.description}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs max-w-40">
                      {d.types.length > 1 ? `${d.types.length} tarefas` : DEMAND_TYPE_LABELS[d.types[0]]}
                    </td>
                    <td className="px-3 py-2.5 text-xs">{d.competencias.join(", ")}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs font-medium ${
                        d.priority === "urgente" ? "text-destructive" :
                        d.priority === "alta" ? "text-status-waiting" :
                        "text-muted-foreground"
                      }`}>
                        {PRIORITY_LABELS[d.priority]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5"><StatusBadge status={d.status} /></td>
                    <td className="px-3 py-2.5 text-xs">
                      {new Date(d.internalDeadline).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-3 py-2.5 text-xs">{getMember(d.assignee)?.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateDemandDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          refetchDemands();
          toast.success("Demanda criada com sucesso!");
        }}
      />

      <DemandDetailsDialog
        open={!!selectedDemand}
        onOpenChange={(o) => !o && setSelectedDemand(null)}
        demand={selectedDemand}
      />
    </AppLayout>
  );
}

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
  VISIBLE_PLANNING_TYPE_ENTRIES,
  DemandStatus,
  DemandType,
  STATUS_LABELS,
  Priority,
  type Demand,
} from "@/lib/types";
import { getDeadlineUrgency } from "@/lib/demand-utils";
import { Search, LayoutGrid, List, Plus, CalendarRange, AlertTriangle, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CreatePlanningDialog } from "@/components/CreatePlanningDialog";
import { EditPlanningDialog } from "@/components/EditPlanningDialog";
import { PlanningTimeline } from "@/components/PlanningTimeline";
import { useActivePendenciesByPlanning, type CellPendencyInfo } from "@/hooks/use-pendencies";
import { useIsMobile } from "@/hooks/use-mobile";
import { PlanningCard } from "@/components/planning/PlanningCard";
import { PlanningWorkloadBar } from "@/components/planning/PlanningWorkloadBar";
import { CompletedPlanningsDrawer } from "@/components/planning/CompletedPlanningsDrawer";
import { toast } from "sonner";

type ViewMode = "list" | "kanban" | "timeline";
type ActiveCol = "not_started" | "in_progress" | "paused_pendency";

const ACTIVE_COLS: ActiveCol[] = ["not_started", "in_progress", "paused_pendency"];
const PRIORITY_ORDER: Record<Priority, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
const COL_INITIAL_LIMIT = 20;

const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default function PlanejamentoPage() {
  const [view, setView] = usePersistedFilter<ViewMode>("planejamento", "view", "kanban");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = usePersistedFilter<string>("planejamento", "type", "all");
  const [filterAssignee, setFilterAssignee] = usePersistedFilter<string>("planejamento", "assignee", "all");
  const [filterStatus, setFilterStatus] = usePersistedFilter<string>("planejamento", "status", "all");
  const [filterWithPendency, setFilterWithPendency] = usePersistedFilter<string>("planejamento", "withPendency", "all");
  const _now = new Date();
  const _monthStart = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-01`;
  const _monthEnd = (() => {
    const d = new Date(_now.getFullYear(), _now.getMonth() + 1, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const [filterDateFrom, setFilterDateFrom] = usePersistedFilter<string>("planejamento", "dateFromV2", _monthStart);
  const [filterDateTo, setFilterDateTo] = usePersistedFilter<string>("planejamento", "dateToV2", _monthEnd);
  const [draftDateFrom, setDraftDateFrom] = useState<string>(filterDateFrom);
  const [draftDateTo, setDraftDateTo] = useState<string>(filterDateTo);
  const [createOpen, setCreateOpen] = useState(false);
  const [editPlanning, setEditPlanning] = useState<Demand | null>(null);
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({});
  const isMobile = useIsMobile();

  const { members: teamMembers } = useTeamMembers({ excludeCoordenacao: true });
  const { user, profile } = useAuth();
  useActionPermissions();
  const canSeeAll = canPerformAction("ver_todas_demandas", profile?.role);
  const canSeeWorkloadByRole = canPerformAction("ver_carga_equipe", profile?.role);
  const canReassign = canPerformAction("gerenciar_ausencias_equipe", profile?.role);

  const { data: workloadExtraUsers = [] } = useQuery({
    queryKey: ["ver_carga_equipe_users"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("value").eq("key", "ver_carga_equipe_users").maybeSingle();
      return ((data?.value as unknown as string[]) || []);
    },
    staleTime: 60_000,
  });
  const canSeeWorkload = canSeeWorkloadByRole || (user ? workloadExtraUsers.includes(user.id) : false);

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

  const { data: statusEntries = {}, refetch: refetchStatuses } = useQuery({
    queryKey: ["demand_status_entries_map"],
    queryFn: async () => {
      const map: Record<string, DemandStatus> = {};
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("demand_status_entries")
          .select("client_name, month, year, demand_type, status")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        (data || []).forEach((d: any) => {
          const key = `${d.client_name}|${d.month}/${d.year}|${d.demand_type}`;
          map[key] = d.status as DemandStatus;
        });
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }
      return map;
    },
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const channel = supabase
      .channel("planejamento-status-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "demand_status_entries" }, () => {
        refetchStatuses();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetchStatuses]);

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
      else if (allStatuses.some((s) => s !== "not_started")) derivedStatus = "in_progress";
      else derivedStatus = "not_started";
      return { ...d, status: derivedStatus };
    });
  }, [dbPlannings, statusEntries]);

  useEffect(() => {
    const toSync = planningsWithDerivedStatus.filter((d) => {
      const original = dbPlannings.find((o) => o.id === d.id);
      return original && original.status !== d.status;
    });
    if (toSync.length === 0) return;
    (async () => {
      await Promise.all(
        toSync.map((d) => supabase.from("plannings").update({ status: d.status }).eq("id", d.id))
      );
      refetch();
    })();
  }, [planningsWithDerivedStatus, dbPlannings, refetch]);

  const { data: pendenciesByPlanning } = useActivePendenciesByPlanning();

  const getPendenciesFor = (d: Demand): CellPendencyInfo[] => {
    if (!pendenciesByPlanning) return [];
    const out: CellPendencyInfo[] = [];
    const seen = new Set<string>();
    d.competencias.forEach((comp) => {
      const arr = pendenciesByPlanning.get(`${d.client}|${comp}`) || [];
      arr.forEach((p) => { if (!seen.has(p.id)) { seen.add(p.id); out.push(p); } });
    });
    return out;
  };

  // Base list ignoring the status filter — used so the "concluídas" drawer always
  // reflects completions in the selected period regardless of the kanban status filter.
  const filteredIgnoringStatus = useMemo(() => {
    return planningsWithDerivedStatus
      .filter((d) => {
        if (!canSeeAll && user && d.assignee !== user.id) return false;
        if (search && !d.client.toLowerCase().includes(search.toLowerCase()) && !d.description.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterType !== "all" && !d.types.includes(filterType as DemandType)) return false;
        if (filterAssignee !== "all" && d.assignee !== filterAssignee) return false;
        if (filterDateFrom && d.internalDeadline < filterDateFrom) return false;
        if (filterDateTo && d.internalDeadline > filterDateTo) return false;
        if (filterWithPendency !== "all") {
          const pend = getPendenciesFor(d);
          if (filterWithPendency === "with" && pend.length === 0) return false;
          if (filterWithPendency === "overdue" && !pend.some((p) => p.vencida)) return false;
          if (filterWithPendency === "without" && pend.length > 0) return false;
        }
        return true;
      })
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }, [search, filterType, filterAssignee, filterDateFrom, filterDateTo, filterWithPendency, planningsWithDerivedStatus, canSeeAll, user, pendenciesByPlanning]);

  const filtered = useMemo(() => {
    return filteredIgnoringStatus.filter((d) => {
      if (filterStatus === "overdue") {
        if (d.status === "completed") return false;
        if (getDeadlineUrgency(d.internalDeadline) !== "overdue") return false;
      } else if (filterStatus !== "all" && d.status !== filterStatus) return false;
      return true;
    });
  }, [filteredIgnoringStatus, filterStatus]);

  const getMember = (id: string) => teamMembers.find((m) => m.id === id);

  // Period label for header subtitle
  const periodLabel = useMemo(() => {
    if (!filterDateFrom && !filterDateTo) return "todos os prazos";
    try {
      const d = new Date(filterDateFrom || filterDateTo);
      return `${MONTH_LABELS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
    } catch { return ""; }
  }, [filterDateFrom, filterDateTo]);

  // Active vs completed for kanban
  const completedInPeriod = useMemo(
    () => filteredIgnoringStatus.filter((d) => d.status === "completed"),
    [filteredIgnoringStatus]
  );
  const activeOnly = useMemo(
    () => filtered.filter((d) => d.status !== "completed"),
    [filtered]
  );


  const columnsData = useMemo(() => {
    const cols: Record<ActiveCol, Demand[]> = { not_started: [], in_progress: [], paused_pendency: [] };
    activeOnly.forEach((d) => {
      const hasPend = getPendenciesFor(d).length > 0;
      if (hasPend) cols.paused_pendency.push(d);
      else if (d.status === "not_started") cols.not_started.push(d);
      else cols.in_progress.push(d);
    });
    return cols;
  }, [activeOnly, pendenciesByPlanning]);

  const activeFilterCount =
    (filterType !== "all" ? 1 : 0) +
    (filterWithPendency !== "all" ? 1 : 0) +
    (filterDateFrom !== _monthStart || filterDateTo !== _monthEnd ? 1 : 0);

  const renderColumn = (col: ActiveCol) => {
    const items = columnsData[col];
    const isPaused = col === "paused_pendency";
    const isExpanded = expandedCols[col] || false;
    const visible = isExpanded ? items : items.slice(0, COL_INITIAL_LIMIT);
    const hidden = items.length - visible.length;

    const headerLabel =
      col === "not_started" ? "Não iniciada" : col === "in_progress" ? "Em andamento" : "Pausada · pendência";
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
              pendencies={getPendenciesFor(d)}
              memberName={getMember(d.assignee)?.name}
              onClick={() => setEditPlanning(d)}
              canReassign={canReassign}
              reassignMembers={teamMembers.map((m) => ({ id: m.id, name: m.name }))}
              onReassigned={() => refetch()}
            />
          ))}
          {items.length === 0 && (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              {isPaused ? "Nenhuma demanda pausada" : "Nenhum planejamento"}
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
            <h1 className="text-2xl font-semibold tracking-tight">Planejamento interno</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filtered.length} planejamento{filtered.length !== 1 ? "s" : ""} · prazo {periodLabel}
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
              <button onClick={() => setView("timeline")} className={segBtn(view === "timeline")} aria-label="Calendário">
                <CalendarRange className="w-4 h-4" />
              </button>
            </div>
            <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" />
              Novo
            </Button>
          </div>
        </div>

        {/* FILTERS BAR */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-muted-foreground" />
            <input
              placeholder="Buscar empresa ou descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full pl-8 pr-3 text-sm border rounded-md bg-card focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-8 px-2 text-xs border rounded-full bg-card"
          >
            <option value="all">Todos status</option>
            <option value="not_started">{STATUS_LABELS.not_started}</option>
            <option value="in_progress">{STATUS_LABELS.in_progress}</option>
            <option value="completed">{STATUS_LABELS.completed}</option>
            <option value="overdue">Em atraso</option>
          </select>
          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="h-8 px-2 text-xs border rounded-full bg-card"
          >
            <option value="all">Todos responsáveis</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground hidden sm:inline">Prazo: {periodLabel}</span>

          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1 h-8 px-2.5 text-xs border rounded-full bg-card hover:bg-muted transition">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Mais filtros
                {activeFilterCount > 0 && (
                  <span className="ml-1 bg-primary text-primary-foreground rounded-full px-1.5 text-[10px] font-semibold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tipo de demanda</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="mt-1 h-8 w-full px-2 text-sm border rounded-md bg-card"
                >
                  <option value="all">Todos os tipos</option>
                  {VISIBLE_PLANNING_TYPE_ENTRIES.map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Pendências</label>
                <select
                  value={filterWithPendency}
                  onChange={(e) => setFilterWithPendency(e.target.value)}
                  className="mt-1 h-8 w-full px-2 text-sm border rounded-md bg-card"
                >
                  <option value="all">Todas (com/sem)</option>
                  <option value="with">Com pendências abertas</option>
                  <option value="overdue">Com pendências vencidas</option>
                  <option value="without">Sem pendências</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Prazo (intervalo)</label>
                <div className="mt-1 flex items-center gap-1">
                  <input
                    type="date"
                    value={draftDateFrom}
                    onChange={(e) => setDraftDateFrom(e.target.value)}
                    className="h-8 flex-1 px-2 text-xs border rounded-md bg-card"
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <input
                    type="date"
                    value={draftDateTo}
                    onChange={(e) => setDraftDateTo(e.target.value)}
                    className="h-8 flex-1 px-2 text-xs border rounded-md bg-card"
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    size="sm"
                    className="h-7"
                    onClick={() => { setFilterDateFrom(draftDateFrom); setFilterDateTo(draftDateTo); }}
                  >
                    Aplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => {
                      setSearch("");
                      setFilterType("all");
                      setFilterAssignee("all");
                      setFilterStatus("all");
                      setFilterWithPendency("all");
                      setDraftDateFrom(_monthStart);
                      setDraftDateTo(_monthEnd);
                      setFilterDateFrom(_monthStart);
                      setFilterDateTo(_monthEnd);
                    }}
                  >
                    Limpar
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* WORKLOAD BAR */}
        {canSeeWorkload && (
          <PlanningWorkloadBar
            plannings={planningsWithDerivedStatus}
            activeFilter={filterAssignee}
            onFilterByAssignee={setFilterAssignee}
          />
        )}

        {/* KANBAN */}
        {view === "kanban" && (
          <>
            <div className="flex justify-end">
              <CompletedPlanningsDrawer
                completed={completedInPeriod}
                onOpenDemand={(d) => setEditPlanning(d)}
                periodLabel={periodLabel}
              />
            </div>

            {isMobile ? (
              <Tabs defaultValue="paused_pendency" className="w-full">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="not_started" className="text-[11px]">Não iniciada ({columnsData.not_started.length})</TabsTrigger>
                  <TabsTrigger value="in_progress" className="text-[11px]">Em andamento ({columnsData.in_progress.length})</TabsTrigger>
                  <TabsTrigger value="paused_pendency" className="text-[11px] data-[state=active]:text-warning">
                    Pausada ({columnsData.paused_pendency.length})
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
          </>
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
                {filtered.map((d) => {
                  const pend = getPendenciesFor(d);
                  return (
                    <tr key={d.id} onClick={() => setEditPlanning(d)} className="hover:bg-muted/30 transition-colors cursor-pointer">
                      <td className="px-3 py-2.5 font-medium">{d.client}</td>
                      <td className="px-3 py-2.5 text-xs max-w-40">
                        {d.types.length > 1 ? `${d.types.length} tarefas` : d.types[0]}
                      </td>
                      <td className="px-3 py-2.5 text-xs">{d.competencias.join(", ")}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={d.status} />
                          {pend.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-warning">
                              <AlertTriangle className="w-3 h-3" />
                              {pend.length}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {new Date(d.internalDeadline).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-3 py-2.5 text-xs">{getMember(d.assignee)?.name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {view === "timeline" && <PlanningTimeline plannings={filtered} />}
      </div>

      <EditPlanningDialog
        open={!!editPlanning}
        onOpenChange={(o) => !o && setEditPlanning(null)}
        planning={editPlanning}
        onSaved={() => refetch()}
      />

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

import { useState, useMemo } from "react";
import { usePersistedFilter } from "@/hooks/use-persisted-filter";
import AppLayout from "@/components/AppLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { MOCK_DEMANDS, TEAM_MEMBERS } from "@/lib/mock-data";
import {
  DEMAND_TYPE_LABELS,
  DemandStatus,
  DemandType,
  STATUS_LABELS,
  PRIORITY_LABELS,
  Priority,
  ROLE_LABELS,
  type Demand,
} from "@/lib/types";
import { formatMinutes, getDeadlineUrgency } from "@/lib/demand-utils";
import { Search, Filter, LayoutGrid, List, Clock, User, AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateDemandDialog } from "@/components/CreateDemandDialog";
import { toast } from "sonner";

type ViewMode = "list" | "kanban";

const KANBAN_COLUMNS: DemandStatus[] = [
  "not_started",
  "in_progress",
  "in_review",
  "waiting_info",
  "blocked",
  "completed",
];

const PRIORITY_ORDER: Record<Priority, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };

export default function DemandsPage() {
  const [view, setView] = usePersistedFilter<ViewMode>("demandas", "view", "kanban");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = usePersistedFilter<string>("demandas", "type", "all");
  const [filterPriority, setFilterPriority] = usePersistedFilter<string>("demandas", "priority", "all");
  const [filterAssignee, setFilterAssignee] = usePersistedFilter<string>("demandas", "assignee", "all");
  const [createOpen, setCreateOpen] = useState(false);
  const [localDemands, setLocalDemands] = useState<Demand[]>(MOCK_DEMANDS);

  const filtered = useMemo(() => {
    return localDemands
      .filter((d) => {
        if (search && !d.client.toLowerCase().includes(search.toLowerCase()) && !d.description.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterType !== "all" && d.type !== filterType) return false;
        if (filterPriority !== "all" && d.priority !== filterPriority) return false;
        if (filterAssignee !== "all" && d.assignee !== filterAssignee) return false;
        return true;
      })
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }, [search, filterType, filterPriority, filterAssignee]);

  const getMember = (id: string) => TEAM_MEMBERS.find((m) => m.id === id);

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
            <h1 className="text-2xl font-bold tracking-tight">Fila de Trabalho</h1>
            <p className="text-sm text-muted-foreground mt-1">{filtered.length} demandas</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" />
              Nova Demanda
            </Button>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              <button onClick={() => setView("kanban")} className={`p-1.5 rounded-md transition-colors ${view === "kanban" ? "bg-card shadow-sm" : ""}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setView("list")} className={`p-1.5 rounded-md transition-colors ${view === "list" ? "bg-card shadow-sm" : ""}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-muted-foreground" />
            <input
              placeholder="Buscar cliente ou descrição..."
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
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="h-8 px-2 text-sm border rounded-md bg-card">
            <option value="all">Todas prioridades</option>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className="h-8 px-2 text-sm border rounded-md bg-card">
            <option value="all">Todos responsáveis</option>
            {TEAM_MEMBERS.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Kanban View */}
        {view === "kanban" && (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {KANBAN_COLUMNS.map((status) => {
              const columnDemands = filtered.filter((d) => d.status === status);
              return (
                <div key={status} className="flex-shrink-0 w-72">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <StatusBadge status={status} />
                    <span className="text-xs text-muted-foreground font-medium">{columnDemands.length}</span>
                  </div>
                  <div className="space-y-2">
                    {columnDemands.map((d) => (
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
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{d.description}</p>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{d.competencia}</span>
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
                    {columnDemands.length === 0 && (
                      <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                        Nenhuma demanda
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* List View */}
        {view === "list" && (
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Cliente</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tipo</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Comp.</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Prioridade</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Prazo</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Responsável</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tempo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/30 transition-colors cursor-pointer">
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{d.client}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-48">{d.description}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{DEMAND_TYPE_LABELS[d.type]}</td>
                    <td className="px-3 py-2.5 text-xs">{d.competencia}</td>
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
                    <td className={`px-3 py-2.5 text-xs ${urgencyClass(d.internalDeadline)}`}>
                      {new Date(d.internalDeadline).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-3 py-2.5 text-xs">{getMember(d.assignee)?.name}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatMinutes(d.timeSpentMinutes)}</td>
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
        onCreated={(demands) => {
          setLocalDemands((prev) => [...demands, ...prev]);
          toast.success(`${demands.length} demanda${demands.length > 1 ? "s" : ""} criada${demands.length > 1 ? "s" : ""} com sucesso!`);
        }}
      />
    </AppLayout>
  );
}

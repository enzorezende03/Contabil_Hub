import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { useTeamMembers } from "@/hooks/use-team-members";
import { ROLE_LABELS, type Demand, type TeamRole } from "@/lib/types";
import { Progress } from "@/components/ui/progress";

interface Props {
  plannings: Demand[];
  activeFilter: string;
  onFilterByAssignee: (id: string) => void;
}

const STORAGE_KEY = "planejamento.workload.expanded";
const MAX_LOAD = 10;
const ROLE_PRIORITY: Record<TeamRole, number> = { analista: 0, assistente: 1, coordenacao: 2, estagiario: 3 };

export function PlanningWorkloadBar({ plannings, activeFilter, onFilterByAssignee }: Props) {
  const { members } = useTeamMembers({ excludeCoordenacao: true });

  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, expanded ? "1" : "0");
  }, [expanded]);

  const rows = useMemo(() => {
    return [...members]
      .sort((a, b) => ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role])
      .map((m) => {
        const assigned = plannings.filter((p) => p.assignee === m.id);
        const active = assigned.filter((p) => p.status !== "completed").length;
        const completed = assigned.length - active;
        return { member: m, active, completed, total: assigned.length, overloaded: active >= MAX_LOAD };
      });
  }, [plannings, members]);

  const totalActive = rows.reduce((s, r) => s + r.active, 0);
  const overloaded = rows.filter((r) => r.overloaded);

  return (
    <div className="rounded-lg border bg-muted/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-xs font-medium text-foreground">Carga da equipe</span>
          <span className="text-xs text-muted-foreground">
            {rows.length} pessoas · {totalActive} tarefas ativas
          </span>
          {overloaded.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium truncate">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {overloaded.length} com sobrecarga · {overloaded.map((o) => o.member.name.split(" ")[0]).join(", ")}
            </span>
          )}
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          {expanded ? "Recolher" : "Ver detalhes"}
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>

      {expanded && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 p-3 pt-0 border-t border-border/60">
          {rows.map(({ member, active, completed, overloaded }) => {
            const pct = Math.min((active / MAX_LOAD) * 100, 100);
            const isSelected = activeFilter === member.id;
            return (
              <button
                key={member.id}
                onClick={() => onFilterByAssignee(isSelected ? "all" : member.id)}
                className={`rounded-md border p-2 text-left bg-card transition hover:border-primary/40 ${
                  isSelected ? "border-primary ring-1 ring-primary/20" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium truncate">{member.name.split(" ")[0]}</span>
                  {overloaded && (
                    <AlertTriangle className="w-3 h-3 text-destructive shrink-0" aria-label="Sobrecarga" />
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mb-1">{ROLE_LABELS[member.role]}</div>
                <Progress
                  value={pct}
                  className={`h-1 ${overloaded ? "[&>div]:bg-destructive" : active >= 7 ? "[&>div]:bg-warning" : "[&>div]:bg-primary"}`}
                />
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {active}/{MAX_LOAD} tarefas — {Math.round((active / MAX_LOAD) * 100)}% da capacidade
                </div>
                <div className="text-[10px] text-muted-foreground">{completed} concluídas</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useMemo } from "react";
import { useTeamMembers } from "@/hooks/use-team-members";
import { ROLE_LABELS, type Demand, type TeamMember, type TeamRole } from "@/lib/types";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  plannings: Demand[];
  activeFilter: string;
  onFilterByAssignee: (id: string) => void;
}

const MAX_LOAD = 10;

const ROLE_PRIORITY: Record<TeamRole, number> = {
  analista: 0,
  assistente: 1,
  coordenacao: 2,
  estagiario: 3,
};

export function WorkloadPanel({ plannings, activeFilter, onFilterByAssignee }: Props) {
  const { members } = useTeamMembers();

  const workload = useMemo(() => {
    return [...members]
      .sort((a, b) => ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role])
      .map((member) => {
        const assigned = plannings.filter((p) => p.assignee === member.id);
        const active = assigned.filter((p) => p.status !== "completed");
        const completed = assigned.filter((p) => p.status === "completed");
        return { member, active: active.length, completed: completed.length, total: assigned.length };
      });
  }, [plannings, members]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
      <TooltipProvider delayDuration={200}>
        {workload.map(({ member, active, completed, total }) => {
          const loadPercent = Math.min((active / MAX_LOAD) * 100, 100);
          const isOverloaded = active >= MAX_LOAD;
          const isSelected = activeFilter === member.id;

          return (
            <Tooltip key={member.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onFilterByAssignee(isSelected ? "all" : member.id)}
                  className={`rounded-lg border p-2.5 text-left transition-all hover:border-primary/40 cursor-pointer ${
                    isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate">{member.name.split(" ")[0]}</span>
                    {isOverloaded && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                  </div>
                  <div className="text-[10px] text-muted-foreground mb-1.5">
                    {ROLE_LABELS[member.role]}
                  </div>
                  <Progress
                    value={loadPercent}
                    className={`h-1.5 ${isOverloaded ? "[&>div]:bg-destructive" : active >= 7 ? "[&>div]:bg-status-waiting" : "[&>div]:bg-primary"}`}
                  />
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-muted-foreground">{active} ativo{active !== 1 ? "s" : ""}</span>
                    <span className="text-[10px] text-muted-foreground">{completed} ✓</span>
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">
                  <strong>{member.name}</strong> — {ROLE_LABELS[member.role]}<br />
                  {active} planejamentos ativos, {completed} concluídos ({total} total)
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
    </div>
  );
}

/** Returns the member ID with lowest active load, prioritizing analistas/assistentes */
export function suggestAssignee(
  plannings: Demand[],
  teamMembers: TeamMember[]
): { id: string; name: string; activeCount: number } | null {
  const preferred: TeamRole[] = ["analista", "assistente"];
  const candidates = teamMembers.filter((m) => preferred.includes(m.role));
  if (candidates.length === 0) return null;

  const loads = candidates.map((m) => ({
    id: m.id,
    name: m.name,
    activeCount: plannings.filter((p) => p.assignee === m.id && p.status !== "completed").length,
  }));

  loads.sort((a, b) => a.activeCount - b.activeCount);
  return loads[0];
}

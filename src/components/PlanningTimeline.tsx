import { useMemo, useState } from "react";
import { useTeamMembers } from "@/hooks/use-team-members";
import { PRIORITY_LABELS, type Demand, type Priority } from "@/lib/types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  plannings: Demand[];
}

const PRIORITY_COLORS: Record<Priority, string> = {
  urgente: "bg-destructive/80 border-destructive",
  alta: "bg-status-waiting/60 border-status-waiting",
  media: "bg-primary/50 border-primary",
  baixa: "bg-muted border-border",
};

const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export function PlanningTimeline({ plannings }: Props) {
  const { members } = useTeamMembers();
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [groupByAssignee, setGroupByAssignee] = useState(false);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const today = now.getFullYear() === viewYear && now.getMonth() === viewMonth ? now.getDate() : null;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const getMember = (id: string) => members.find((m) => m.id === id);

  const rows = useMemo(() => {
    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd = new Date(viewYear, viewMonth, daysInMonth, 23, 59, 59);

    const visible = plannings.filter((p) => {
      const created = new Date(p.createdAt);
      const deadline = new Date(p.internalDeadline);
      return created <= monthEnd && deadline >= monthStart;
    });

    if (!groupByAssignee) return [{ label: null, items: visible }];

    const groups: Record<string, Demand[]> = {};
    visible.forEach((p) => {
      const key = p.assignee;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });

    return Object.entries(groups).map(([assigneeId, items]) => ({
      label: getMember(assigneeId)?.name || assigneeId,
      items,
    }));
  }, [plannings, viewMonth, viewYear, groupByAssignee, daysInMonth]);

  const getBarStyle = (p: Demand) => {
    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd = new Date(viewYear, viewMonth, daysInMonth);
    const created = new Date(p.createdAt);
    const deadline = new Date(p.internalDeadline);

    const startDay = Math.max(1, created < monthStart ? 1 : created.getDate());
    const endDay = Math.min(daysInMonth, deadline > monthEnd ? daysInMonth : deadline.getDate());

    const left = ((startDay - 1) / daysInMonth) * 100;
    const width = Math.max(((endDay - startDay + 1) / daysInMonth) * 100, 2);
    const isOverdue = deadline < now && p.status !== "completed";

    return { left: `${left}%`, width: `${width}%`, isOverdue };
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium min-w-[100px] text-center">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <button
          onClick={() => setGroupByAssignee(!groupByAssignee)}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            groupByAssignee ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
          }`}
        >
          Agrupar por responsável
        </button>
      </div>

      {/* Day headers */}
      <div className="relative border-b">
        <div className="flex">
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
            <div
              key={day}
              className={`flex-1 text-center text-[9px] py-1 border-r last:border-r-0 ${
                day === today ? "bg-primary/10 font-bold text-primary" : "text-muted-foreground"
              }`}
            >
              {day}
            </div>
          ))}
        </div>
      </div>

      {/* Timeline body */}
      <TooltipProvider delayDuration={150}>
        <div className="divide-y max-h-[500px] overflow-y-auto">
          {rows.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground bg-muted/20">
                  {group.label}
                </div>
              )}
              {group.items.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                  Nenhum planejamento neste período
                </div>
              )}
              {group.items.map((p) => {
                const bar = getBarStyle(p);
                return (
                  <div key={p.id} className="relative h-8 hover:bg-muted/20 transition-colors">
                    {/* Today line */}
                    {today && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-primary/30 z-0"
                        style={{ left: `${((today - 0.5) / daysInMonth) * 100}%` }}
                      />
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`absolute top-1.5 h-5 rounded-full border text-[9px] flex items-center px-1.5 truncate cursor-default z-10 ${
                            PRIORITY_COLORS[p.priority]
                          } ${bar.isOverdue ? "ring-1 ring-destructive" : ""}`}
                          style={{ left: bar.left, width: bar.width }}
                        >
                          <span className="truncate">{p.client}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-xs">
                          <strong>{p.client}</strong><br />
                          {PRIORITY_LABELS[p.priority]} · {getMember(p.assignee)?.name}<br />
                          Prazo: {new Date(p.internalDeadline).toLocaleDateString("pt-BR")}
                          {bar.isOverdue && <span className="text-destructive"> (atrasado)</span>}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </TooltipProvider>

      {/* Legend */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t bg-muted/20">
        {(["urgente", "alta", "media", "baixa"] as Priority[]).map((p) => (
          <div key={p} className="flex items-center gap-1">
            <div className={`w-3 h-2 rounded-full ${PRIORITY_COLORS[p]}`} />
            <span className="text-[9px] text-muted-foreground">{PRIORITY_LABELS[p]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

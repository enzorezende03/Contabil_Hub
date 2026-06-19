import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Check } from "lucide-react";
import type { Demand } from "@/lib/types";
import { DEMAND_TYPE_LABELS } from "@/lib/types";
import { useTeamMembers } from "@/hooks/use-team-members";
import { fmtPeriod, sentenceCase } from "./planning-utils";

interface Props {
  completed: Demand[];
  onOpenDemand: (d: Demand) => void;
  periodLabel: string;
}

export function CompletedPlanningsDrawer({ completed, onOpenDemand, periodLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState("all");
  const [type, setType] = useState("all");
  const { members } = useTeamMembers({ excludeCoordenacao: true });

  const list = useMemo(() => {
    return completed.filter((d) => {
      if (assignee !== "all" && d.assignee !== assignee) return false;
      if (type !== "all" && !d.types.includes(type as any)) return false;
      return true;
    });
  }, [completed, assignee, type]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
        >
          <Check className="w-3.5 h-3.5 text-success" />
          <span className="font-medium text-success">{completed.length}</span>
          <span>concluídas em {periodLabel} · ver lista</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Concluídas — {periodLabel}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-wrap gap-2 mt-4 mb-3">
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="h-8 px-2 text-xs border rounded-md bg-card"
          >
            <option value="all">Todos responsáveis</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-8 px-2 text-xs border rounded-md bg-card"
          >
            <option value="all">Todos tipos</option>
            {Object.entries(DEMAND_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          {list.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhuma concluída no período.</p>
          )}
          {list.map((d) => {
            const member = members.find((m) => m.id === d.assignee);
            return (
              <button
                key={d.id}
                onClick={() => {
                  setOpen(false);
                  onOpenDemand(d);
                }}
                className="w-full text-left rounded-md border bg-card hover:border-primary/40 p-2.5 transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium truncate">{sentenceCase(d.client)}</p>
                  <Check className="w-3.5 h-3.5 text-success shrink-0" />
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {d.types.length > 1 ? `${d.types.length} tarefas` : DEMAND_TYPE_LABELS[d.types[0]]} · {fmtPeriod(d.competencias)}
                </p>
                {member && <p className="text-[10px] text-muted-foreground mt-0.5">{member.name}</p>}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CellPendencyInfo } from "@/hooks/use-pendencies";
import { STATUS_LABELS as PEND_STATUS_LABELS } from "@/lib/pendency-types";

interface Props {
  pendencies: CellPendencyInfo[];
  compact?: boolean;
}

/** Visual derived tag shown next to a planning status when there are active related pendencies. */
export function PlanningPendencyBadge({ pendencies, compact }: Props) {
  if (!pendencies?.length) return null;
  const vencidas = pendencies.filter((p) => p.vencida).length;
  const tone = vencidas > 0
    ? "bg-destructive/10 text-destructive border-destructive/40"
    : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40";
  const label = vencidas > 0
    ? `${vencidas} pendência${vencidas > 1 ? "s" : ""} vencida${vencidas > 1 ? "s" : ""}`
    : `${pendencies.length} pendência${pendencies.length > 1 ? "s" : ""}`;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border font-medium",
              compact ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]",
              tone,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <AlertTriangle className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="text-xs font-semibold">Pendências relacionadas</p>
            <ul className="space-y-0.5">
              {pendencies.slice(0, 6).map((p) => (
                <li key={p.id} className="text-[11px]">
                  <span className={cn("font-medium", p.vencida && "text-destructive")}>
                    [{p.tipo === "externa" ? "Externa" : "Interna"}]
                  </span>{" "}
                  {p.descricao?.slice(0, 60) || PEND_STATUS_LABELS[p.status as keyof typeof PEND_STATUS_LABELS] || p.status}
                  {p.vencida && " · vencida"}
                </li>
              ))}
              {pendencies.length > 6 && (
                <li className="text-[11px] text-muted-foreground">+ {pendencies.length - 6} outras…</li>
              )}
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

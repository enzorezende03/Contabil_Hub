import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Demand } from "@/lib/types";
import type { CellPendencyInfo } from "@/hooks/use-pendencies";
import {
  avatarColor,
  deadlineClass,
  deadlineLabel,
  deadlineTone,
  fmtPeriod,
  initials,
  pendencyAlertKind,
  sentenceCase,
} from "./planning-utils";
import { DEMAND_TYPE_LABELS } from "@/lib/types";

interface Props {
  demand: Demand;
  pendencies: CellPendencyInfo[];
  memberName?: string;
  onClick?: () => void;
}

export function PlanningCard({ demand, pendencies, memberName, onClick }: Props) {
  const tone = deadlineTone(demand.internalDeadline);
  const kind = pendencyAlertKind(pendencies);
  const showPriority = demand.priority === "alta" || demand.priority === "urgente";

  // Subtitle: aggregate types
  const typesLabel =
    demand.types.length === 0
      ? ""
      : demand.types.length === 1
        ? DEMAND_TYPE_LABELS[demand.types[0]]
        : `${demand.types.length} tarefas`;

  const period = fmtPeriod(demand.competencias);
  const subtitle = [typesLabel, period].filter(Boolean).join(" · ");

  const alert =
    kind === "vencida"
      ? { className: "bg-destructive/15 text-destructive", text: `Vencida · ${pendencies.length} pendência${pendencies.length > 1 ? "s" : ""}` }
      : kind === "externa"
        ? { className: "bg-destructive/10 text-destructive", text: `Aguardando cliente · ${pendencies.length} pendência${pendencies.length > 1 ? "s" : ""} externa${pendencies.length > 1 ? "s" : ""}` }
        : kind === "interna"
          ? { className: "bg-warning/15 text-warning", text: `Aguardando setor · ${pendencies.length} pendência${pendencies.length > 1 ? "s" : ""} interna${pendencies.length > 1 ? "s" : ""}` }
          : null;

  const deadlineFmt = demand.internalDeadline
    ? new Date(demand.internalDeadline).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : "";

  const avInitials = initials(memberName ?? "");

  return (
    <div
      onClick={onClick}
      className="rounded-lg border bg-card hover:border-primary/40 transition-colors cursor-pointer p-2.5 space-y-1.5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium leading-snug truncate" title={demand.client}>
          {sentenceCase(demand.client)}
        </p>
        {showPriority && (
          <span
            className={`shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
              demand.priority === "urgente" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"
            }`}
          >
            {demand.priority === "urgente" ? "Urgente" : "Alta"}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="text-[10px] text-muted-foreground truncate" title={subtitle}>
          {subtitle}
        </p>
      )}

      {alert && (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium ${alert.className}`}>
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span className="truncate">{alert.text}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <ul className="space-y-0.5">
                {pendencies.slice(0, 5).map((p) => (
                  <li key={p.id} className="text-[11px]">
                    [{p.tipo === "externa" ? "Externa" : "Interna"}] {p.descricao?.slice(0, 60) || p.status}
                    {p.vencida && " · vencida"}
                  </li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <div className="flex items-center justify-between pt-0.5">
        <span className={`text-[10px] ${deadlineClass(tone)}`}>vence {deadlineFmt}</span>
        {memberName && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-[9px] font-semibold ${avatarColor(demand.assignee)}`}
                >
                  {avInitials}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">{memberName}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { AlertTriangle, UserCog, Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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

interface ReassignMember {
  id: string;
  name: string;
}

interface Props {
  demand: Demand;
  pendencies: CellPendencyInfo[];
  memberName?: string;
  onClick?: () => void;
  canReassign?: boolean;
  reassignMembers?: ReassignMember[];
  onReassigned?: () => void;
}

export function PlanningCard({
  demand,
  pendencies,
  memberName,
  onClick,
  canReassign,
  reassignMembers = [],
  onReassigned,
}: Props) {
  const [reassignOpen, setReassignOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const tone = deadlineTone(demand.internalDeadline);
  const kind = pendencyAlertKind(pendencies);
  const showPriority = demand.priority === "alta" || demand.priority === "urgente";

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

  const filteredMembers = reassignMembers.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleReassign = async (newAssigneeId: string) => {
    if (newAssigneeId === demand.assignee) {
      setReassignOpen(false);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("plannings")
      .update({ assignee: newAssigneeId })
      .eq("id", demand.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao remanejar: " + error.message);
      return;
    }
    const newName = reassignMembers.find((m) => m.id === newAssigneeId)?.name ?? "responsável";
    toast.success(`Demanda remanejada para ${newName}`);
    setReassignOpen(false);
    setSearch("");
    onReassigned?.();
  };

  return (
    <div
      onClick={onClick}
      className="rounded-lg border bg-card hover:border-primary/40 transition-colors cursor-pointer p-2.5 space-y-1.5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium leading-snug truncate" title={demand.client}>
          {sentenceCase(demand.client)}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {showPriority && (
            <span
              className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                demand.priority === "urgente" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"
              }`}
            >
              {demand.priority === "urgente" ? "Urgente" : "Alta"}
            </span>
          )}
          {canReassign && (
            <Popover open={reassignOpen} onOpenChange={setReassignOpen}>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                        aria-label="Remanejar"
                      >
                        <UserCog className="w-3.5 h-3.5" />
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top">Remanejar</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <PopoverContent
                align="end"
                className="w-64 p-2"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-xs font-semibold mb-2 px-1">Remanejar para…</div>
                <input
                  autoFocus
                  placeholder="Buscar responsável..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-7 w-full px-2 text-xs border rounded-md bg-card mb-2 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {filteredMembers.length === 0 && (
                    <div className="text-[11px] text-muted-foreground p-2 text-center">
                      Nenhum responsável encontrado
                    </div>
                  )}
                  {filteredMembers.map((m) => {
                    const isCurrent = m.id === demand.assignee;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={saving}
                        onClick={() => handleReassign(m.id)}
                        className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted transition ${
                          isCurrent ? "bg-muted/50" : ""
                        } disabled:opacity-50`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-semibold ${avatarColor(m.id)}`}>
                            {initials(m.name)}
                          </span>
                          <span className="truncate">{m.name}</span>
                        </span>
                        {isCurrent && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
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
        <span className={`text-[10px] ${deadlineClass(tone)}`}>{deadlineLabel(demand.internalDeadline)} {deadlineFmt}</span>
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

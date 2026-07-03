import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import {
  DEMAND_TYPE_LABELS,
  PRIORITY_LABELS,
  type Demand,
} from "@/lib/types";
import { formatMinutes } from "@/lib/demand-utils";
import { useTeamMembers } from "@/hooks/use-team-members";
import { Calendar, Clock, User, Flag, FileText, Layers, CalendarDays, Hash } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  demand: Demand | null;
}

export function DemandDetailsDialog({ open, onOpenChange, demand }: Props) {
  const { members } = useTeamMembers();
  if (!demand) return null;

  const assigneeName = members.find((m) => m.id === demand.assignee)?.name || "—";
  const fmtDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString("pt-BR") : "—";
  const fmtDateTime = (d?: string) =>
    d ? new Date(d).toLocaleString("pt-BR") : "—";

  const priorityTone =
    demand.priority === "urgente"
      ? "bg-destructive/15 text-destructive"
      : demand.priority === "alta"
        ? "bg-warning/15 text-warning"
        : "bg-muted text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {demand.client}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status + prioridade */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={demand.status} />
            <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded ${priorityTone}`}>
              <Flag className="w-3 h-3 inline mr-1" />
              {PRIORITY_LABELS[demand.priority]}
            </span>
          </div>

          {/* Descrição */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <FileText className="w-3.5 h-3.5" />
              Descrição da demanda
            </div>
            <p className="text-sm whitespace-pre-wrap">
              {demand.description?.trim() || <span className="text-muted-foreground italic">Sem descrição informada.</span>}
            </p>
          </div>

          {/* Atividades */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <Layers className="w-3.5 h-3.5" />
              Atividades
            </div>
            <div className="flex flex-wrap gap-1.5">
              {demand.types.map((t) => (
                <span key={t} className="text-[11px] bg-muted px-2 py-0.5 rounded font-medium">
                  {DEMAND_TYPE_LABELS[t]}
                </span>
              ))}
            </div>
          </div>

          {/* Competências */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Competências
            </div>
            <div className="flex flex-wrap gap-1.5">
              {demand.competencias.map((c) => (
                <span key={c} className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Grid de metadados */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
            <Info icon={<User className="w-3.5 h-3.5" />} label="Responsável" value={assigneeName} />
            <Info icon={<Calendar className="w-3.5 h-3.5" />} label="Prazo interno" value={fmtDate(demand.internalDeadline)} />
            <Info icon={<Calendar className="w-3.5 h-3.5" />} label="Prazo cliente" value={fmtDate(demand.clientDeadline)} />
            <Info icon={<Clock className="w-3.5 h-3.5" />} label="Tempo gasto" value={formatMinutes(demand.timeSpentMinutes || 0)} />
            <Info icon={<Flag className="w-3.5 h-3.5" />} label="Complexidade" value={demand.complexity} />
            <Info icon={<Hash className="w-3.5 h-3.5" />} label="Peso" value={String(demand.weight ?? "—")} />
            <Info icon={<Calendar className="w-3.5 h-3.5" />} label="Criada em" value={fmtDateTime(demand.createdAt)} />
            <Info icon={<Hash className="w-3.5 h-3.5" />} label="ID" value={demand.id.slice(0, 8)} mono />
          </div>

          {demand.notes && (
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs font-medium text-muted-foreground mb-1">Notas</div>
              <p className="text-sm whitespace-pre-wrap">{demand.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-0.5">
        {icon}
        {label}
      </div>
      <div className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

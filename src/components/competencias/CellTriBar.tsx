import type { DemandStatus } from "@/lib/demand-status";

export type TriBarMode = "normal" | "sem_movimento" | "disabled";

export const TRI_BAR_TYPES = [
  { type: "lancamentos" as const, short: "L", label: "Lançamento" },
  { type: "conciliacao_bancaria" as const, short: "B", label: "Conc. Bancária" },
  { type: "conciliacao_contabil" as const, short: "C", label: "Conc. Contábil" },
];

function statusClass(status: DemandStatus | undefined): string {
  switch (status) {
    case "completed":
      return "bg-success";
    case "in_progress":
      return "bg-warning/70";
    case "waiting_info":
      return "bg-destructive/70";
    case "blocked":
      return "bg-destructive";
    case "late":
      return "bg-destructive/90";
    case "in_review":
      return "bg-info/80";
    case "not_started":
    default:
      return "bg-muted/50";
  }
}

interface CellTriBarProps {
  mode?: TriBarMode;
  statuses: {
    lancamentos?: DemandStatus;
    conciliacao_bancaria?: DemandStatus;
    conciliacao_contabil?: DemandStatus;
  };
}

export function CellTriBar({ mode = "normal", statuses }: CellTriBarProps) {
  if (mode === "disabled") {
    return (
      <div className="grid grid-cols-3 gap-px w-7 h-[22px] mx-auto rounded-sm overflow-hidden opacity-30">
        <div className="bg-muted/30" />
        <div className="bg-muted/30" />
        <div className="bg-muted/30" />
      </div>
    );
  }

  if (mode === "sem_movimento") {
    return (
      <div
        className="grid grid-cols-3 gap-px w-7 h-[22px] mx-auto rounded-sm overflow-hidden"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, hsl(var(--warning) / 0.35) 0 3px, hsl(var(--warning) / 0.15) 3px 6px)",
        }}
        aria-label="Sem movimento"
      >
        <div />
        <div />
        <div />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-px w-7 h-[22px] mx-auto rounded-sm overflow-hidden">
      <div className={statusClass(statuses.lancamentos)} />
      <div className={statusClass(statuses.conciliacao_bancaria)} />
      <div className={statusClass(statuses.conciliacao_contabil)} />
    </div>
  );
}

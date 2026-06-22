import type { DemandStatus } from "@/lib/types";

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
      <div className="w-7 h-[22px] mx-auto rounded-sm bg-muted/30 opacity-30" />
    );
  }

  if (mode === "sem_movimento") {
    return (
      <div
        className="w-7 h-[22px] mx-auto rounded-sm"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, hsl(var(--warning) / 0.35) 0 3px, hsl(var(--warning) / 0.15) 3px 6px)",
        }}
        aria-label="Sem movimento"
      />
    );
  }

  // Find the last completed demand following the workflow order
  const order = [
    { key: "lancamentos", short: "L", status: statuses.lancamentos },
    { key: "conciliacao_bancaria", short: "B", status: statuses.conciliacao_bancaria },
    { key: "conciliacao_contabil", short: "C", status: statuses.conciliacao_contabil },
  ] as const;

  const lastCompleted = [...order].reverse().find((s) => s.status === "completed");
  // If nothing completed, fall back to the most "advanced" non-not_started status
  const fallback = [...order].reverse().find((s) => s.status && s.status !== "not_started");
  const display = lastCompleted ?? fallback;

  const bg = statusClass(display?.status);
  const label = display?.short ?? "";
  const textColor = display?.status === "completed" || display?.status === "blocked" || display?.status === "late"
    ? "text-white"
    : display?.status
    ? "text-foreground"
    : "text-muted-foreground";

  return (
    <div className={`w-7 h-[22px] mx-auto rounded-sm flex items-center justify-center text-[10px] font-semibold ${bg} ${textColor}`}>
      {label}
    </div>
  );
}

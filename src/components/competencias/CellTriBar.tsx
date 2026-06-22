import type { DemandStatus } from "@/lib/types";

export type TriBarMode = "normal" | "sem_movimento" | "disabled";

export const TRI_BAR_TYPES = [
  { type: "lancamentos" as const, short: "L", label: "Lançamento", colorClass: "bg-purple-500" },
  { type: "conciliacao_bancaria" as const, short: "B", label: "Conc. Bancária", colorClass: "bg-blue-500" },
  { type: "conciliacao_contabil" as const, short: "C", label: "Conc. Contábil", colorClass: "bg-green-500" },
];

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
    { key: "lancamentos" as const, short: "L", status: statuses.lancamentos, colorClass: "bg-purple-500" as const },
    { key: "conciliacao_bancaria" as const, short: "B", status: statuses.conciliacao_bancaria, colorClass: "bg-blue-500" as const },
    { key: "conciliacao_contabil" as const, short: "C", status: statuses.conciliacao_contabil, colorClass: "bg-green-500" as const },
  ] as const;

  const lastCompleted = [...order].reverse().find((s) => s.status === "completed");
  // If nothing completed, fall back to the most "advanced" non-not_started status
  const fallback = [...order].reverse().find((s) => s.status && s.status !== "not_started");
  const display = lastCompleted ?? fallback;

  const bg = display?.colorClass ?? "bg-muted/50";
  const label = display?.short ?? "";

  return (
    <div className={`w-7 h-[22px] mx-auto rounded-sm flex items-center justify-center text-[10px] font-semibold text-white ${bg}`}>
      {label}
    </div>
  );
}

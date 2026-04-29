import { Cog, MailWarning } from "lucide-react";
import { cn } from "@/lib/utils";

interface CellPendency { id: string; tipo: "interna" | "externa"; vencida: boolean; demand_type: string | null; }

interface Props { pendencies: CellPendency[]; }

/** Small icon shown on top-right of a matrix cell when there are open pendencies. */
export function CellPendencyIndicator({ pendencies }: Props) {
  if (!pendencies?.length) return null;
  const hasVencida = pendencies.some((p) => p.vencida);
  const hasInterna = pendencies.some((p) => p.tipo === "interna");
  const hasExterna = pendencies.some((p) => p.tipo === "externa");
  // Choose dominant icon
  const Icon = hasExterna ? MailWarning : Cog;
  const colorClass = hasVencida
    ? "text-red-500 animate-pulse"
    : hasExterna && hasInterna
    ? "text-amber-500"
    : hasExterna
    ? "text-yellow-500"
    : "text-orange-500";

  return (
    <span
      className={cn("absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-card border border-border shadow-sm", pendencies.length > 1 ? "w-4 h-4 px-0.5" : "w-3.5 h-3.5")}
      title={`${pendencies.length} pendência(s) aberta(s)${hasVencida ? " — alguma vencida!" : ""}`}
    >
      {pendencies.length > 1 ? (
        <span className={cn("text-[8px] font-bold leading-none", colorClass)}>{pendencies.length}</span>
      ) : (
        <Icon className={cn("w-2.5 h-2.5", colorClass)} />
      )}
    </span>
  );
}

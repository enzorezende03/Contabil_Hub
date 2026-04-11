import { DemandStatus, STATUS_COLORS, STATUS_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: DemandStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full", className)}>
      <span className={cn("status-dot", STATUS_COLORS[status])} />
      {STATUS_LABELS[status]}
    </span>
  );
}

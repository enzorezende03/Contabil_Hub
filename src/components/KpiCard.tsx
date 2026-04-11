import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}

const variantStyles = {
  default: "border-border",
  success: "border-status-completed/30",
  warning: "border-status-waiting/30",
  danger: "border-status-late/30",
  info: "border-primary/30",
};

const iconVariantStyles = {
  default: "bg-muted text-muted-foreground",
  success: "bg-status-completed/10 text-status-completed",
  warning: "bg-status-waiting/10 text-status-waiting",
  danger: "bg-status-late/10 text-status-late",
  info: "bg-primary/10 text-primary",
};

export function KpiCard({ title, value, subtitle, icon: Icon, variant = "default", className }: KpiCardProps) {
  return (
    <div className={cn("rounded-lg border bg-card p-4 flex items-start gap-3", variantStyles[variant], className)}>
      <div className={cn("rounded-lg p-2", iconVariantStyles[variant])}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{title}</p>
        <p className="text-2xl font-bold tracking-tight mt-0.5">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

import { useState } from "react";
import { Bell, Clock, AlertTriangle, CalendarClock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type PlanningAlert, getAlertLabel, getMemberName } from "@/hooks/use-planning-alerts";

interface Props {
  alerts: PlanningAlert[];
  overdue: PlanningAlert[];
  today: PlanningAlert[];
  soon: PlanningAlert[];
}

const ICON_MAP = {
  overdue: Clock,
  today: AlertTriangle,
  soon: CalendarClock,
};

const COLOR_MAP = {
  overdue: "text-destructive",
  today: "text-status-waiting",
  soon: "text-primary",
};

export function PlanningNotifications({ alerts, overdue, today, soon }: Props) {
  const [open, setOpen] = useState(false);
  const total = alerts.length;

  const renderGroup = (items: PlanningAlert[], label: string, type: PlanningAlert["type"]) => {
    if (items.length === 0) return null;
    const Icon = ICON_MAP[type];
    return (
      <div className="space-y-1">
        <div className={`flex items-center gap-1.5 text-xs font-semibold ${COLOR_MAP[type]} px-1`}>
          <Icon className="w-3.5 h-3.5" />
          {label} ({items.length})
        </div>
        {items.slice(0, 5).map((a) => (
          <div key={a.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/50 text-xs">
            <div className="min-w-0">
              <p className="font-medium truncate">{a.client}</p>
              <p className="text-muted-foreground text-[10px]">
                {getMemberName(a.assignee)} · {new Date(a.deadline).toLocaleDateString("pt-BR")}
              </p>
            </div>
          </div>
        ))}
        {items.length > 5 && (
          <p className="text-[10px] text-muted-foreground px-2">+{items.length - 5} mais</p>
        )}
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-1.5 rounded-md text-sidebar-foreground/60 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50 transition-colors">
          <Bell className="w-4 h-4" />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-bold">
              {total > 9 ? "9+" : total}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="px-3 py-2 border-b">
          <h4 className="text-sm font-semibold">Notificações</h4>
          <p className="text-[10px] text-muted-foreground">{total} alerta{total !== 1 ? "s" : ""} de prazo</p>
        </div>
        <div className="p-2 space-y-3 max-h-80 overflow-y-auto">
          {total === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum alerta ✅</p>
          ) : (
            <>
              {renderGroup(overdue, "Atrasados", "overdue")}
              {renderGroup(today, "Vencem hoje", "today")}
              {renderGroup(soon, "Próximos do prazo", "soon")}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

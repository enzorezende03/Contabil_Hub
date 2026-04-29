import { useState, useEffect, useMemo } from "react";
import { Bell, Clock, AlertTriangle, CalendarClock, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type PlanningAlert, getMemberName } from "@/hooks/use-planning-alerts";

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

const DISMISSED_KEY = "planning-alerts-dismissed";

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export function PlanningNotifications({ alerts, overdue, today, soon }: Props) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  useEffect(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]));
    } catch {}
  }, [dismissed]);

  const filterFn = (a: PlanningAlert) => !dismissed.has(a.id);
  const visibleAlerts = useMemo(() => alerts.filter(filterFn), [alerts, dismissed]);
  const visibleOverdue = useMemo(() => overdue.filter(filterFn), [overdue, dismissed]);
  const visibleToday = useMemo(() => today.filter(filterFn), [today, dismissed]);
  const visibleSoon = useMemo(() => soon.filter(filterFn), [soon, dismissed]);
  const total = visibleAlerts.length;

  const clearAll = () => {
    setDismissed(new Set(alerts.map((a) => a.id)));
  };

  const dismissOne = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

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
          <div key={a.id} className="group flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-muted/50 text-xs">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{a.client}</p>
              <p className="text-muted-foreground text-[10px]">
                {getMemberName(a.assignee)} · {new Date(a.deadline).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <button
              onClick={() => dismissOne(a.id)}
              className="opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground hover:text-foreground transition-opacity px-1.5 py-0.5 rounded hover:bg-background"
              title="Dispensar"
            >
              ✕
            </button>
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
        <div className="px-3 py-2 border-b flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold">Notificações</h4>
            <p className="text-[10px] text-muted-foreground">{total} alerta{total !== 1 ? "s" : ""} de prazo</p>
          </div>
          {total > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
              title="Limpar todos os avisos"
            >
              <CheckCheck className="w-3 h-3" />
              Limpar
            </button>
          )}
        </div>
        <div className="p-2 space-y-3 max-h-80 overflow-y-auto">
          {total === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum alerta ✅</p>
          ) : (
            <>
              {renderGroup(visibleOverdue, "Atrasados", "overdue")}
              {renderGroup(visibleToday, "Vencem hoje", "today")}
              {renderGroup(visibleSoon, "Próximos do prazo", "soon")}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

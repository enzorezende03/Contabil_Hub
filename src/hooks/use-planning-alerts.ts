import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { type Demand } from "@/lib/types";
import { getDeadlineUrgency } from "@/lib/demand-utils";
import { TEAM_MEMBERS } from "@/lib/mock-data";

export interface PlanningAlert {
  id: string;
  client: string;
  assignee: string;
  deadline: string;
  type: "overdue" | "today" | "soon";
}

const ALERT_LABELS = {
  overdue: "🔴 Atrasado",
  today: "🟡 Vence hoje",
  soon: "🟠 Vence em breve",
};

export function usePlanningAlerts(plannings: Demand[]) {
  const notifiedRef = useRef(false);

  const alerts: PlanningAlert[] = plannings
    .filter((p) => p.status !== "completed")
    .map((p) => {
      const urgency = getDeadlineUrgency(p.internalDeadline);
      if (urgency === "normal") return null;
      return {
        id: p.id,
        client: p.client,
        assignee: p.assignee,
        deadline: p.internalDeadline,
        type: urgency,
      } as PlanningAlert;
    })
    .filter(Boolean) as PlanningAlert[];

  const overdue = alerts.filter((a) => a.type === "overdue");
  const today = alerts.filter((a) => a.type === "today");
  const soon = alerts.filter((a) => a.type === "soon");

  useEffect(() => {
    if (notifiedRef.current || plannings.length === 0) return;
    notifiedRef.current = true;

    if (overdue.length > 0) {
      toast.error(`${overdue.length} planejamento${overdue.length > 1 ? "s" : ""} atrasado${overdue.length > 1 ? "s" : ""}`, {
        description: overdue.slice(0, 3).map((a) => a.client).join(", ") + (overdue.length > 3 ? ` +${overdue.length - 3}` : ""),
        duration: 8000,
      });
    }

    if (today.length > 0) {
      toast.warning(`${today.length} planejamento${today.length > 1 ? "s" : ""} vence${today.length > 1 ? "m" : ""} hoje`, {
        description: today.slice(0, 3).map((a) => a.client).join(", "),
        duration: 6000,
      });
    }

    if (soon.length > 0) {
      toast.info(`${soon.length} planejamento${soon.length > 1 ? "s" : ""} vence${soon.length > 1 ? "m" : ""} em breve`, {
        duration: 5000,
      });
    }
  }, [plannings.length, overdue.length, today.length, soon.length]);

  return { alerts, overdue, today, soon };
}

export function getAlertLabel(type: PlanningAlert["type"]) {
  return ALERT_LABELS[type];
}

export function getMemberName(id: string) {
  return TEAM_MEMBERS.find((m) => m.id === id)?.name || id;
}

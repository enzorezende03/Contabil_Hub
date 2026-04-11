import { Demand, TeamMember, DEMAND_TYPE_LABELS, DEFAULT_WEIGHTS, DemandStatus } from "./types";

export function getWeightForType(type: string): number {
  return DEFAULT_WEIGHTS.find((w) => w.type === type)?.weight ?? 1;
}

export function getDemandsByStatus(demands: Demand[], status: DemandStatus): Demand[] {
  return demands.filter((d) => d.status === status);
}

export function getDemandsByAssignee(demands: Demand[], assigneeId: string): Demand[] {
  return demands.filter((d) => d.assignee === assigneeId);
}

export function getProductivityScore(demands: Demand[]): number {
  return demands
    .filter((d) => d.status === "completed")
    .reduce((sum, d) => sum + d.weight, 0);
}

export function getCompletionRate(demands: Demand[]): number {
  if (demands.length === 0) return 0;
  const completed = demands.filter((d) => d.status === "completed").length;
  return Math.round((completed / demands.length) * 100);
}

export function getAvgTimeMinutes(demands: Demand[]): number {
  const completed = demands.filter((d) => d.status === "completed" && d.timeSpentMinutes > 0);
  if (completed.length === 0) return 0;
  return Math.round(completed.reduce((s, d) => s + d.timeSpentMinutes, 0) / completed.length);
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function getReworkRate(demands: Demand[]): number {
  if (demands.length === 0) return 0;
  const reopened = demands.filter((d) => d.status === "reopened").length;
  return Math.round((reopened / demands.length) * 100);
}

export function getPerformanceLevel(member: TeamMember, demands: Demand[]): { level: "high" | "medium" | "low"; color: string; label: string } {
  const myDemands = getDemandsByAssignee(demands, member.id);
  if (myDemands.length === 0) return { level: "medium", color: "text-status-waiting", label: "Sem dados" };
  
  const completionRate = getCompletionRate(myDemands);
  const lateCount = myDemands.filter((d) => d.status === "late").length;
  const reworkRate = getReworkRate(myDemands);
  
  const score = completionRate - (lateCount * 10) - (reworkRate * 5);
  
  if (score >= 70) return { level: "high", color: "text-status-completed", label: "Alta Performance" };
  if (score >= 40) return { level: "medium", color: "text-status-waiting", label: "Média" };
  return { level: "low", color: "text-status-late", label: "Baixa" };
}

export function getDeadlineUrgency(deadline: string): "overdue" | "today" | "soon" | "normal" {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dl = new Date(deadline);
  dl.setHours(0, 0, 0, 0);
  const diff = (dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 3) return "soon";
  return "normal";
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Snapshot = {
  id: string;
  user_id: string;
  ano: number;
  mes: number;
  effort_points: number;
  capacity_minutes: number;
  effort_score_pct: number;
  quality_score_pct: number | null;
  timeliness_score_pct: number;
  composite_score: number;
  tasks_completed_count: number;
  tasks_on_time_count: number;
  submissions_approved_first: number;
  submissions_total: number;
  details: any;
  calculated_at: string | null;
};

export function useSnapshots(periods: { ano: number; mes: number }[]) {
  return useQuery({
    queryKey: ["productivity_snapshots", periods],
    queryFn: async () => {
      if (!periods.length) return [] as Snapshot[];
      const ors = periods.map((p) => `and(ano.eq.${p.ano},mes.eq.${p.mes})`).join(",");
      const { data, error } = await supabase
        .from("productivity_snapshots")
        .select("*")
        .or(ors);
      if (error) throw error;
      return (data || []) as Snapshot[];
    },
  });
}

export function scoreColor(score: number): string {
  if (score >= 80) return "text-status-completed";
  if (score >= 60) return "text-status-waiting";
  return "text-destructive";
}

export function scoreBg(score: number): string {
  if (score >= 80) return "bg-status-completed/10 border-status-completed/30";
  if (score >= 60) return "bg-status-waiting/10 border-status-waiting/30";
  return "bg-destructive/10 border-destructive/30";
}

export async function recalcSnapshots(payload: { user_id?: string; ano?: number; mes?: number } = {}) {
  const { data, error } = await supabase.functions.invoke("compute-productivity-snapshots", {
    body: payload,
  });
  if (error) throw error;
  return data;
}

export function currentAndPrevPeriod() {
  const now = new Date();
  const cur = { ano: now.getFullYear(), mes: now.getMonth() + 1 };
  const prev = cur.mes === 1 ? { ano: cur.ano - 1, mes: 12 } : { ano: cur.ano, mes: cur.mes - 1 };
  return { cur, prev };
}

export function monthLabel(p: { ano: number; mes: number }) {
  const names = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${names[p.mes - 1]}/${p.ano}`;
}

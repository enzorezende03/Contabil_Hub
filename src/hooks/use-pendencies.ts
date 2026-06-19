import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Pendency, PendencyCommunication } from "@/lib/pendency-types";

export interface PendencyFilters {
  clientId?: string;
  competencia?: string; // YYYY-MM-DD
  status?: string[];
  tipo?: "interna" | "externa";
  responsavelId?: string;
  setor?: string;
  onlyActive?: boolean;
  toFollowupToday?: boolean;
}

/** List pendencies with optional filters. Subscribes to realtime updates. */
export function usePendencies(filters: PendencyFilters = {}) {
  const qc = useQueryClient();
  const key = ["pendencies", filters];

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = supabase.from("pendencies").select("*").order("created_at", { ascending: false });
      if (filters.clientId) q = q.eq("client_id", filters.clientId);
      if (filters.competencia) q = q.eq("competencia", filters.competencia);
      if (filters.tipo) q = q.eq("tipo", filters.tipo);
      if (filters.responsavelId) q = q.eq("responsavel_id", filters.responsavelId);
      if (filters.setor) q = q.eq("setor_responsavel", filters.setor);
      if (filters.status?.length) q = q.in("status", filters.status);
      if (filters.onlyActive) q = q.not("status", "in", "(resolvida,cancelada)");
      if (filters.toFollowupToday) {
        q = q.lte("next_followup_at", new Date().toISOString()).eq("followup_paused", false);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Pendency[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("pendencies-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "pendencies" }, () => {
        qc.invalidateQueries({ queryKey: ["pendencies"] });
        qc.invalidateQueries({ queryKey: ["pendencies-by-cell"] });
        qc.invalidateQueries({ queryKey: ["pendencies-by-planning"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pendency_communications" }, () => {
        qc.invalidateQueries({ queryKey: ["pendencies"] });
        qc.invalidateQueries({ queryKey: ["pendency-comms"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return query;
}

/** Active pendencies grouped by client+month for the matrix indicator. */
export function useActivePendenciesByCell(year: string) {
  return useQuery({
    queryKey: ["pendencies-by-cell", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pendencies")
        .select("id, client_id, competencia, demand_type, tipo, status, prazo_resposta")
        .gte("competencia", `${year}-01-01`)
        .lte("competencia", `${year}-12-31`)
        .not("status", "in", "(resolvida,cancelada)");
      if (error) throw error;
      const map = new Map<string, Array<{ id: string; tipo: "interna" | "externa"; vencida: boolean; demand_type: string | null }>>();
      const today = new Date(new Date().toDateString());
      (data || []).forEach((p: any) => {
        const month = p.competencia.slice(5, 7);
        const key = `${p.client_id}|${month}`;
        const vencida = !!p.prazo_resposta && new Date(p.prazo_resposta) < today;
        const arr = map.get(key) || [];
        arr.push({ id: p.id, tipo: p.tipo, vencida, demand_type: p.demand_type });
        map.set(key, arr);
      });
      return map;
    },
  });
}

export function usePendencyCommunications(pendencyId: string | null) {
  return useQuery({
    queryKey: ["pendency-comms", pendencyId],
    enabled: !!pendencyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pendency_communications")
        .select("*")
        .eq("pendency_id", pendencyId!)
        .order("realizado_em", { ascending: false });
      if (error) throw error;
      return (data || []) as PendencyCommunication[];
    },
  });
}

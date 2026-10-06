import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PortfolioClient = {
  id: string;
  razao_social: string;
  tributacao: string;
  unidade: string;
  data_fim_contrato: string | null;
  carteira_responsavel_id: string | null;
};

/** Clients with their portfolio owner. `ownerByName` maps lowercased razao_social -> owner user_id. */
export function useClientPortfolio() {
  const q = useQuery({
    queryKey: ["client-portfolio"],
    queryFn: async (): Promise<PortfolioClient[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, razao_social, tributacao, unidade, data_fim_contrato, carteira_responsavel_id" as any)
        .order("razao_social");
      if (error) throw error;
      return (data as any) || [];
    },
    staleTime: 60_000,
  });
  const clients = q.data ?? [];
  const ownerByName = new Map<string, string | null>();
  clients.forEach((c) => ownerByName.set(c.razao_social.trim().toLowerCase(), c.carteira_responsavel_id));
  const ownerOf = (name?: string) => (name ? ownerByName.get(name.trim().toLowerCase()) ?? null : null);
  return { clients, ownerOf, isLoading: q.isLoading, refetch: q.refetch };
}

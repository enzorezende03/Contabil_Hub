import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TeamMember, TeamRole } from "@/lib/types";

const VALID_ROLES: TeamRole[] = ["estagiario", "assistente", "analista", "coordenacao"];

interface UseTeamMembersOptions {
  /** If true, exclude users with role "coordenacao" from the result. */
  excludeCoordenacao?: boolean;
}

/**
 * Fetches real team members from the profiles table.
 * Uses profile.user_id as the member id (used as `assignee` in plannings/demands).
 */
export function useTeamMembers(options: UseTeamMembersOptions = {}) {
  const { excludeCoordenacao = false } = options;

  const query = useQuery({
    queryKey: ["team-members"],
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, role, archived_at")
        .is("archived_at", null)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data || []).map((p: any) => ({
        id: p.user_id,
        name: p.display_name || "Sem nome",
        role: (VALID_ROLES.includes(p.role) ? p.role : "assistente") as TeamRole,
      }));
    },
    staleTime: 60_000,
  });

  const members = (query.data ?? []).filter(
    (m) => !excludeCoordenacao || m.role !== "coordenacao"
  );

  return {
    members,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

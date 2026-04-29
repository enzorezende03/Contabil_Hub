import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActionPermissions } from "@/hooks/use-action-permissions";

export type ReviewerCandidate = {
  user_id: string;
  display_name: string;
  role: string;
  pending_count: number;
};

/**
 * Lista usuários que podem ser designados como revisora de uma submissão.
 * Critério: cargo está em action_permissions.revisar_demonstrativos OU profile.can_review = true.
 * Cada item vem com a contagem de submissões pendentes (aguardando + em_revisao) onde a pessoa é reviewer_id.
 * Ordenado por carga crescente.
 */
export function useReviewers() {
  const perms = useActionPermissions();
  const allowedRoles = perms.revisar_demonstrativos || [];

  return useQuery({
    queryKey: ["reviewer-candidates", allowedRoles.join(",")],
    queryFn: async (): Promise<ReviewerCandidate[]> => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, role, can_review");
      if (error) throw error;

      const candidates = (profiles || []).filter(
        (p: any) => p.can_review === true || allowedRoles.includes(p.role)
      );

      // Carga atual: count de submissões aguardando+em_revisao por reviewer_id
      const { data: pending } = await supabase
        .from("review_submissions")
        .select("reviewer_id, status")
        .in("status", ["aguardando", "em_revisao"]);

      const counts = new Map<string, number>();
      (pending || []).forEach((p: any) => {
        if (!p.reviewer_id) return;
        counts.set(p.reviewer_id, (counts.get(p.reviewer_id) || 0) + 1);
      });

      return candidates
        .map((p: any) => ({
          user_id: p.user_id,
          display_name: p.display_name || "Sem nome",
          role: p.role || "—",
          pending_count: counts.get(p.user_id) || 0,
        }))
        .sort((a, b) => a.pending_count - b.pending_count || a.display_name.localeCompare(b.display_name));
    },
    staleTime: 30_000,
  });
}


-- Fix 1: closing_deliverables — restrict NULL-submission reads
DROP POLICY IF EXISTS "Deliverables: scoped by submission" ON public.closing_deliverables;
CREATE POLICY "Deliverables: scoped by submission"
  ON public.closing_deliverables FOR SELECT
  USING (
    CASE
      WHEN review_submission_id IS NOT NULL THEN public.can_view_submission(review_submission_id)
      ELSE (
        gerado_por = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR public.is_coordenacao(auth.uid())
        OR public.has_action_permission(auth.uid(), 'supervisionar_revisao')
      )
    END
  );

-- Fix 2: pendency_access_tokens — restrict SELECT to creator/admin only
-- (managers can still INSERT/rotate via existing policies; rotation regenerates the token)
DROP POLICY IF EXISTS "Tokens: view by creator/admin/manager" ON public.pendency_access_tokens;
CREATE POLICY "Tokens: view by creator or admin"
  ON public.pendency_access_tokens FOR SELECT
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

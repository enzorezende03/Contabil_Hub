DROP POLICY IF EXISTS "Apontamentos: only reviewer can insert" ON public.review_apontamentos;

CREATE POLICY "Apontamentos: reviewer, admin or supervisor can insert"
ON public.review_apontamentos
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM public.review_submissions s
      WHERE s.id = review_apontamentos.submission_id
        AND s.reviewer_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_action_permission(auth.uid(), 'supervisionar_revisao')
    OR public.has_action_permission(auth.uid(), 'revisar_demonstrativos')
  )
);
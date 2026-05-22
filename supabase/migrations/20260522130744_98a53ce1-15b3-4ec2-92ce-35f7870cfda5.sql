DROP POLICY IF EXISTS "Authenticated users can update closing entries" ON public.demand_status_entries;

CREATE POLICY "Team members can update closing entries"
ON public.demand_status_entries
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('coordenacao', 'analista', 'assistente', 'estagiario')
  )
)
WITH CHECK (
  auth.uid() = filled_by
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('coordenacao', 'analista', 'assistente', 'estagiario')
  )
);
DROP POLICY IF EXISTS "Authenticated users can update entries" ON public.demand_status_entries;

CREATE POLICY "Authenticated users can update closing entries"
ON public.demand_status_entries
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (auth.uid() = filled_by);
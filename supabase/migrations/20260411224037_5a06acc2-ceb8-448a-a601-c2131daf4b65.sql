
DROP POLICY "Authenticated users can update entries" ON public.demand_status_entries;

CREATE POLICY "Authenticated users can update entries"
  ON public.demand_status_entries FOR UPDATE TO authenticated
  USING (auth.uid() = filled_by);

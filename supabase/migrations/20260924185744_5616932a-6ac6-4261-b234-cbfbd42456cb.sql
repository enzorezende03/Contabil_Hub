CREATE TABLE public.demand_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id uuid NOT NULL,
  client text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  justificativa text NOT NULL CHECK (length(trim(justificativa)) >= 5 AND length(justificativa) <= 1000),
  deleted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.demand_deletions TO authenticated;
GRANT ALL ON public.demand_deletions TO service_role;
ALTER TABLE public.demand_deletions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coord/admin insert deletions" ON public.demand_deletions FOR INSERT TO authenticated
  WITH CHECK (deleted_by = auth.uid() AND (public.is_coordenacao(auth.uid()) OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "Coord/admin view deletions" ON public.demand_deletions FOR SELECT TO authenticated
  USING (public.is_coordenacao(auth.uid()) OR public.has_role(auth.uid(),'admin'));
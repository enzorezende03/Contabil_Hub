
CREATE TABLE public.plannings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client text NOT NULL,
  competencias text[] NOT NULL,
  types text[] NOT NULL,
  description text NOT NULL DEFAULT '',
  assignee text NOT NULL,
  priority text NOT NULL DEFAULT 'media',
  internal_deadline date NOT NULL,
  status text NOT NULL DEFAULT 'not_started',
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.plannings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all plannings"
  ON public.plannings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert plannings"
  ON public.plannings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update plannings"
  ON public.plannings FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete plannings"
  ON public.plannings FOR DELETE TO authenticated
  USING (true);

CREATE TRIGGER update_plannings_updated_at
  BEFORE UPDATE ON public.plannings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

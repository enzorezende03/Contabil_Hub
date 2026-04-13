CREATE TABLE public.demands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client text NOT NULL,
  competencias text[] NOT NULL,
  types text[] NOT NULL,
  description text NOT NULL DEFAULT '',
  assignee text NOT NULL,
  complexity text NOT NULL DEFAULT 'media',
  weight integer NOT NULL DEFAULT 1,
  priority text NOT NULL DEFAULT 'media',
  internal_deadline date NOT NULL,
  client_deadline date NOT NULL,
  status text NOT NULL DEFAULT 'not_started',
  time_spent_minutes integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  is_legacy boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.demands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all demands"
  ON public.demands FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert demands"
  ON public.demands FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update demands"
  ON public.demands FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete demands"
  ON public.demands FOR DELETE TO authenticated
  USING (true);

CREATE TRIGGER update_demands_updated_at
  BEFORE UPDATE ON public.demands
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
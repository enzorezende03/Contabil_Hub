CREATE TABLE public.client_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_contacts_client_id ON public.client_contacts(client_id);

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view client contacts"
  ON public.client_contacts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert client contacts"
  ON public.client_contacts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated can update client contacts"
  ON public.client_contacts FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete client contacts"
  ON public.client_contacts FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_client_contacts_updated_at
  BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
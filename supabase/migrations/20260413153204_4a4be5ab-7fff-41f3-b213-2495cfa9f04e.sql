
CREATE TABLE public.nibo_document_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_cnpj TEXT NOT NULL,
  client_name TEXT NOT NULL,
  month TEXT NOT NULL,
  year TEXT NOT NULL,
  document_count INTEGER NOT NULL DEFAULT 0,
  last_filed_date TIMESTAMP WITH TIME ZONE,
  nibo_status TEXT NOT NULL DEFAULT 'pending',
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_cnpj, month, year)
);

ALTER TABLE public.nibo_document_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view nibo alerts"
ON public.nibo_document_alerts FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Service role can manage nibo alerts"
ON public.nibo_document_alerts FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE TRIGGER update_nibo_document_alerts_updated_at
  BEFORE UPDATE ON public.nibo_document_alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

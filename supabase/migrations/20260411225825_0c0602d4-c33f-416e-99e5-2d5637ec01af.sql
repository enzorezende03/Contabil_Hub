
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cnpj TEXT NOT NULL,
  razao_social TEXT NOT NULL,
  tributacao TEXT NOT NULL DEFAULT 'simples_nacional',
  competencia_inicio TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(cnpj)
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all clients"
ON public.clients FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert clients"
ON public.clients FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update clients"
ON public.clients FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete clients"
ON public.clients FOR DELETE TO authenticated
USING (true);

CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

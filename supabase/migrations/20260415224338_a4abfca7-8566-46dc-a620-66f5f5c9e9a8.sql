
-- Storage bucket for accounting statements
INSERT INTO storage.buckets (id, name, public) VALUES ('demonstracoes-contabeis', 'demonstracoes-contabeis', true);

-- Storage policies
CREATE POLICY "Authenticated users can view demonstracoes" 
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'demonstracoes-contabeis');

CREATE POLICY "Authenticated users can upload demonstracoes" 
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'demonstracoes-contabeis');

CREATE POLICY "Authenticated users can update demonstracoes" 
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'demonstracoes-contabeis');

CREATE POLICY "Authenticated users can delete demonstracoes" 
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'demonstracoes-contabeis');

-- Table to track closing attachments
CREATE TABLE public.closing_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,
  year TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_name, year)
);

ALTER TABLE public.closing_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view closing attachments"
ON public.closing_attachments FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert closing attachments"
ON public.closing_attachments FOR INSERT TO authenticated
WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Authenticated users can update closing attachments"
ON public.closing_attachments FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete closing attachments"
ON public.closing_attachments FOR DELETE TO authenticated
USING (true);

CREATE TRIGGER update_closing_attachments_updated_at
BEFORE UPDATE ON public.closing_attachments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

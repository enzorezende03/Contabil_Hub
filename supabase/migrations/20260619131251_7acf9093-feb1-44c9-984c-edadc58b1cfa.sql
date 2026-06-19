
CREATE TABLE public.pendency_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  template_type text NOT NULL CHECK (template_type IN ('conciliacao_bancaria','documentos','outro')),
  arquivo_path text,
  arquivo_nome text,
  total_linhas integer NOT NULL DEFAULT 0,
  total_criadas integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pendency_import_batches TO authenticated;
GRANT ALL ON public.pendency_import_batches TO service_role;

ALTER TABLE public.pendency_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read import batches"
  ON public.pendency_import_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create import batches"
  ON public.pendency_import_batches FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creator or admin can update import batches"
  ON public.pendency_import_batches FOR UPDATE TO authenticated USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admin can delete import batches"
  ON public.pendency_import_batches FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER update_pendency_import_batches_updated_at
  BEFORE UPDATE ON public.pendency_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pendencies
  ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.pendency_import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pendencies_import_batch ON public.pendencies(import_batch_id);

-- Permitir status 'nao_configurado' no GClick (já usado pela edge function)
ALTER TABLE public.pendencies DROP CONSTRAINT IF EXISTS pendencies_gclick_status_check;
ALTER TABLE public.pendencies ADD CONSTRAINT pendencies_gclick_status_check
  CHECK (gclick_status IS NULL OR gclick_status IN ('pendente_sync','sincronizada','falhou','concluida_no_gclick','nao_configurado','criada','erro'));

-- Storage policies for new bucket 'pendency-imports'
CREATE POLICY "Authenticated can upload pendency imports"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pendency-imports' AND auth.uid() = owner);

CREATE POLICY "Authenticated can read pendency imports"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pendency-imports');

CREATE POLICY "Owner or admin can delete pendency imports"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pendency-imports' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role)));


CREATE TABLE IF NOT EXISTS public.pendency_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pendency_id UUID NOT NULL REFERENCES public.pendencies(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pendency_attachments TO authenticated;
GRANT ALL ON public.pendency_attachments TO service_role;

ALTER TABLE public.pendency_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view pendency attachments"
  ON public.pendency_attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert pendency attachments"
  ON public.pendency_attachments FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Uploader or admin can delete pendency attachments"
  ON public.pendency_attachments FOR DELETE TO authenticated
  USING (auth.uid() = uploaded_by OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_pendency_attachments_pendency_id ON public.pendency_attachments(pendency_id);

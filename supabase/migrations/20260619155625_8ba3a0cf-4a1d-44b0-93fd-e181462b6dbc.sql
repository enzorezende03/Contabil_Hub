
CREATE POLICY "Authenticated can read pendency attachment files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pendency-attachments');

CREATE POLICY "Authenticated can upload pendency attachment files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pendency-attachments' AND auth.uid() = owner);

CREATE POLICY "Owner or admin can delete pendency attachment files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pendency-attachments' AND (auth.uid() = owner OR public.has_role(auth.uid(), 'admin')));

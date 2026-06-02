-- Tighten closing-deliverables INSERT policy: require ownership + valid path format (client_id/competencia/tipo/...)
DROP POLICY IF EXISTS "Authenticated can upload closing deliverable files" ON storage.objects;

CREATE POLICY "Authenticated can upload closing deliverable files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'closing-deliverables'
  AND auth.uid() = owner
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('coordenacao','analista','assistente')
    )
  )
  -- Path must start with an existing client uuid: {client_id}/...
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id::text = split_part(objects.name, '/', 1)
  )
);

-- Add missing UPDATE policy on pendency-attachments, mirroring scoped delete
CREATE POLICY "pendency-attachments: scoped update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'pendency-attachments'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.pendency_item_responses r
      WHERE r.arquivo_path = objects.name
        AND r.sender_user_id = auth.uid()
    )
  )
)
WITH CHECK (
  bucket_id = 'pendency-attachments'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.pendency_item_responses r
      WHERE r.arquivo_path = objects.name
        AND r.sender_user_id = auth.uid()
    )
  )
);

-- pendency_communications: restrict SELECT to users tied to the pendency
DROP POLICY IF EXISTS "Pendency comms: viewable by authenticated" ON public.pendency_communications;
CREATE POLICY "Pendency comms: viewable by related users"
  ON public.pendency_communications
  FOR SELECT
  TO authenticated
  USING (public.can_access_pendency(auth.uid(), pendency_id));

-- pendency_import_batches: restrict SELECT to creator, admin, or users with pendency permissions
DROP POLICY IF EXISTS "Authenticated can read import batches" ON public.pendency_import_batches;
CREATE POLICY "Import batches: viewable by creator or managers"
  ON public.pendency_import_batches
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_action_permission(auth.uid(), 'gerenciar_pendencias')
    OR public.has_action_permission(auth.uid(), 'supervisionar_pendencias')
  );

-- storage: pendency-imports bucket - scope reads to uploader, admin, or pendency managers
DROP POLICY IF EXISTS "Authenticated can read pendency imports" ON storage.objects;
CREATE POLICY "Pendency imports: read by uploader or managers"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'pendency-imports'
    AND (
      owner = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_action_permission(auth.uid(), 'gerenciar_pendencias')
      OR public.has_action_permission(auth.uid(), 'supervisionar_pendencias')
    )
  );

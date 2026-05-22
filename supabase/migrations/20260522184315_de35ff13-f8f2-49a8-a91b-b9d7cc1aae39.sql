
-- Helper: is coordenacao
CREATE OR REPLACE FUNCTION public.is_coordenacao(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND role = 'coordenacao')
$$;

-- 1. profiles: prevent self role escalation
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.can_review IS DISTINCT FROM OLD.can_review THEN
    RAISE EXCEPTION 'Only admins can change role or can_review';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- Also allow admins to update any profile
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. client_contacts: restrict update/delete
DROP POLICY IF EXISTS "Authenticated can update client contacts" ON public.client_contacts;
DROP POLICY IF EXISTS "Authenticated can delete client contacts" ON public.client_contacts;
CREATE POLICY "Client contacts: update by owner/admin/coord" ON public.client_contacts
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR is_coordenacao(auth.uid()));
CREATE POLICY "Client contacts: delete by owner/admin/coord" ON public.client_contacts
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR is_coordenacao(auth.uid()));

-- 3. clients: restrict delete
DROP POLICY IF EXISTS "Authenticated users can delete clients" ON public.clients;
CREATE POLICY "Clients: delete by admin/coord" ON public.clients
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR is_coordenacao(auth.uid()));

-- 4. closing_attachments: restrict update/delete
DROP POLICY IF EXISTS "Authenticated users can update closing attachments" ON public.closing_attachments;
DROP POLICY IF EXISTS "Authenticated users can delete closing attachments" ON public.closing_attachments;
CREATE POLICY "Closing attachments: update by uploader/admin/coord" ON public.closing_attachments
  FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR is_coordenacao(auth.uid()));
CREATE POLICY "Closing attachments: delete by uploader/admin/coord" ON public.closing_attachments
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR is_coordenacao(auth.uid()));

-- 5. closing_deliverables: restrict update
DROP POLICY IF EXISTS "Authenticated can update deliverables" ON public.closing_deliverables;
CREATE POLICY "Deliverables: update by generator/reviewer/admin/coord" ON public.closing_deliverables
  FOR UPDATE TO authenticated
  USING (
    gerado_por = auth.uid()
    OR has_role(auth.uid(),'admin'::app_role)
    OR is_coordenacao(auth.uid())
    OR (review_submission_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.review_submissions s
      WHERE s.id = closing_deliverables.review_submission_id
        AND (s.reviewer_id = auth.uid() OR s.submitted_by = auth.uid())
    ))
    OR has_action_permission(auth.uid(),'supervisionar_revisao')
  );

-- 6. demands: restrict delete
DROP POLICY IF EXISTS "Authenticated users can delete demands" ON public.demands;
CREATE POLICY "Demands: delete by creator/admin/coord" ON public.demands
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR is_coordenacao(auth.uid()));

-- 7. plannings: restrict delete
DROP POLICY IF EXISTS "Authenticated users can delete plannings" ON public.plannings;
CREATE POLICY "Plannings: delete by creator/admin/coord" ON public.plannings
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(),'admin'::app_role) OR is_coordenacao(auth.uid()));

-- 8. pendency_access_tokens: restrict select
DROP POLICY IF EXISTS "Tokens: team can view (no hash via app)" ON public.pendency_access_tokens;
CREATE POLICY "Tokens: view by creator/admin/manager" ON public.pendency_access_tokens
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_action_permission(auth.uid(),'gerenciar_pendencias')
    OR has_action_permission(auth.uid(),'supervisionar_pendencias')
  );

-- 9. Storage: closing-deliverables bucket - tie to deliverable access
DROP POLICY IF EXISTS "Authenticated can read closing-deliverables" ON storage.objects;
DROP POLICY IF EXISTS "closing-deliverables read" ON storage.objects;
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (qual LIKE '%closing-deliverables%' OR with_check LIKE '%closing-deliverables%')
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "closing-deliverables: scoped read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'closing-deliverables'
    AND EXISTS (
      SELECT 1 FROM public.closing_deliverables d
      WHERE d.arquivo_path = storage.objects.name
        AND (d.review_submission_id IS NULL OR public.can_view_submission(d.review_submission_id))
    )
  );

-- 10. Storage: pendency-attachments - require team membership (any authenticated team member that can view pendencies)
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (qual LIKE '%pendency-attachments%' OR with_check LIKE '%pendency-attachments%')
      AND cmd IN ('SELECT','DELETE')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "pendency-attachments: scoped read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pendency-attachments'
    AND EXISTS (
      SELECT 1 FROM public.pendency_item_responses r
      WHERE r.arquivo_path = storage.objects.name
    )
    AND (
      has_role(auth.uid(),'admin'::app_role)
      OR has_action_permission(auth.uid(),'gerenciar_pendencias')
      OR has_action_permission(auth.uid(),'supervisionar_pendencias')
      OR EXISTS (
        SELECT 1 FROM public.pendency_item_responses r
        JOIN public.pendencies p ON p.id = r.pendency_id
        WHERE r.arquivo_path = storage.objects.name
          AND (p.responsavel_id = auth.uid() OR p.created_by = auth.uid() OR r.sender_user_id = auth.uid())
      )
    )
  );

CREATE POLICY "pendency-attachments: scoped delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'pendency-attachments'
    AND (
      has_role(auth.uid(),'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.pendency_item_responses r
        WHERE r.arquivo_path = storage.objects.name
          AND r.sender_user_id = auth.uid()
      )
    )
  );

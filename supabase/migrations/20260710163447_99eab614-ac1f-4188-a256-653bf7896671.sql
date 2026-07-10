
-- Helper: is the user a team member (has a profile with a staff role)?
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = _user_id
       AND role IN ('coordenacao','analista','assistente','estagiario')
  );
$$;

-- Helper: can the user access a given pendency?
CREATE OR REPLACE FUNCTION public.can_access_pendency(_user_id uuid, _pendency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR public.has_action_permission(_user_id, 'gerenciar_pendencias')
    OR public.has_action_permission(_user_id, 'supervisionar_pendencias')
    OR EXISTS (
      SELECT 1 FROM public.pendencies p
       WHERE p.id = _pendency_id
         AND (p.responsavel_id = _user_id OR p.created_by = _user_id)
    );
$$;

-- client_contacts
DROP POLICY IF EXISTS "Authenticated can view client contacts" ON public.client_contacts;
CREATE POLICY "Team can view client contacts"
  ON public.client_contacts FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- demand_status_entries
DROP POLICY IF EXISTS "Authenticated users can view all entries" ON public.demand_status_entries;
CREATE POLICY "Team can view demand status entries"
  ON public.demand_status_entries FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- nibo_document_alerts
DROP POLICY IF EXISTS "Authenticated users can view nibo alerts" ON public.nibo_document_alerts;
CREATE POLICY "Team can view nibo alerts"
  ON public.nibo_document_alerts FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- pendencies (PII scoping)
DROP POLICY IF EXISTS "Pendencies: viewable by authenticated" ON public.pendencies;
CREATE POLICY "Pendencies: viewable by owners/managers"
  ON public.pendencies FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_action_permission(auth.uid(), 'gerenciar_pendencias')
    OR has_action_permission(auth.uid(), 'supervisionar_pendencias')
    OR responsavel_id = auth.uid()
    OR created_by = auth.uid()
  );

-- pendency_attachments
DROP POLICY IF EXISTS "Authenticated can view pendency attachments" ON public.pendency_attachments;
CREATE POLICY "Pendency attachments: viewable by pendency members"
  ON public.pendency_attachments FOR SELECT TO authenticated
  USING (public.can_access_pendency(auth.uid(), pendency_id));

-- pendency_items
DROP POLICY IF EXISTS "Items: viewable by authenticated" ON public.pendency_items;
CREATE POLICY "Items: viewable by pendency members"
  ON public.pendency_items FOR SELECT TO authenticated
  USING (public.can_access_pendency(auth.uid(), pendency_id));

-- pendency_item_responses  (linked via pendency_items.pendency_id)
DROP POLICY IF EXISTS "Responses: viewable by authenticated" ON public.pendency_item_responses;
CREATE POLICY "Responses: viewable by pendency members"
  ON public.pendency_item_responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pendency_items i
       WHERE i.id = pendency_item_responses.item_id
         AND public.can_access_pendency(auth.uid(), i.pendency_id)
    )
  );

-- pendency_item_comments
DROP POLICY IF EXISTS "Comments: viewable by authenticated" ON public.pendency_item_comments;
CREATE POLICY "Comments: viewable by pendency members"
  ON public.pendency_item_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pendency_items i
       WHERE i.id = pendency_item_comments.item_id
         AND public.can_access_pendency(auth.uid(), i.pendency_id)
    )
  );

-- profiles
DROP POLICY IF EXISTS "Profiles are viewable by all authenticated users" ON public.profiles;
CREATE POLICY "Profiles: viewable by team"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_team_member(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- user_roles
DROP POLICY IF EXISTS "Authenticated users can view roles" ON public.user_roles;
CREATE POLICY "User roles: self or admin/coordenacao"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_coordenacao(auth.uid())
  );

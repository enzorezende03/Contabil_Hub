CREATE OR REPLACE FUNCTION public.is_active_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND archived_at IS NULL);
$$;
REVOKE EXECUTE ON FUNCTION public.is_active_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_staff(uuid) TO authenticated;

ALTER POLICY "Authenticated users can view all clients" ON public.clients USING (public.is_active_staff(auth.uid()));
ALTER POLICY "Authenticated users can update clients" ON public.clients USING (public.is_active_staff(auth.uid())) WITH CHECK (public.is_active_staff(auth.uid()));
ALTER POLICY "Authenticated users can view all demands" ON public.demands USING (public.is_active_staff(auth.uid()));
ALTER POLICY "Authenticated users can update demands" ON public.demands USING (public.is_active_staff(auth.uid())) WITH CHECK (public.is_active_staff(auth.uid()));
ALTER POLICY "Authenticated users can view all plannings" ON public.plannings USING (public.is_active_staff(auth.uid()));
ALTER POLICY "Authenticated users can update plannings" ON public.plannings USING (public.is_active_staff(auth.uid())) WITH CHECK (public.is_active_staff(auth.uid()));
ALTER POLICY "Authenticated users can view closing attachments" ON public.closing_attachments USING (public.is_active_staff(auth.uid()));
ALTER POLICY "Anyone authenticated can view settings" ON public.settings USING (public.is_active_staff(auth.uid()));

ALTER POLICY "Authenticated users can upload demonstracoes" ON storage.objects
  WITH CHECK (bucket_id = 'demonstracoes-contabeis' AND public.is_active_staff(auth.uid()) AND owner_id = (select auth.uid()::text));
ALTER POLICY "Authenticated users can update demonstracoes" ON storage.objects
  USING (bucket_id = 'demonstracoes-contabeis' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(),'admin'::app_role) OR public.is_coordenacao(auth.uid())));
ALTER POLICY "Authenticated users can delete demonstracoes" ON storage.objects
  USING (bucket_id = 'demonstracoes-contabeis' AND (owner_id = (select auth.uid()::text) OR public.has_role(auth.uid(),'admin'::app_role) OR public.is_coordenacao(auth.uid())));
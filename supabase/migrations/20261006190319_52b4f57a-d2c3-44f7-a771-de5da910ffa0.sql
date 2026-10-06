ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS carteira_responsavel_id uuid;

CREATE TABLE public.client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  texto text NOT NULL,
  author_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_notes TO authenticated;
GRANT ALL ON public.client_notes TO service_role;
ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team reads client notes" ON public.client_notes FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Author inserts notes" ON public.client_notes FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND public.is_team_member(auth.uid()));
CREATE POLICY "Author or manager updates notes" ON public.client_notes FOR UPDATE TO authenticated USING (author_id = auth.uid() OR public.is_coordenacao(auth.uid()) OR public.has_role(auth.uid(),'admin')) WITH CHECK (author_id = auth.uid() OR public.is_coordenacao(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Author or manager deletes notes" ON public.client_notes FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.is_coordenacao(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_client_notes_updated_at BEFORE UPDATE ON public.client_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX ON public.client_notes(client_id);

-- Somente coordenação/admin podem alterar a carteira
CREATE OR REPLACE FUNCTION public.guard_carteira_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.carteira_responsavel_id IS DISTINCT FROM OLD.carteira_responsavel_id
     AND auth.uid() IS NOT NULL
     AND NOT (public.is_coordenacao(auth.uid()) OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Apenas coordenação pode alterar a carteira';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_carteira_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_carteira BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.guard_carteira_change();
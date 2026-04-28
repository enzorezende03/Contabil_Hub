-- =========================================================================
-- Módulo: Revisão de Demonstrativos Contábeis
-- Cria 3 tabelas (closing_deliverables, review_submissions, review_apontamentos),
-- bucket de storage privado e policies RLS.
-- =========================================================================

-- 1) review_submissions ---------------------------------------------------
CREATE TABLE public.review_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  competencia         date NOT NULL,
  cycle_number        integer NOT NULL DEFAULT 1,
  status              text NOT NULL DEFAULT 'aguardando'
                      CHECK (status IN ('aguardando','em_revisao','aprovado','devolvido','cancelado')),
  submitted_by        uuid NOT NULL,
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  reviewer_id         uuid,
  review_started_at   timestamptz,
  reviewed_at         timestamptz,
  review_summary      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_active_submission
  ON public.review_submissions(client_id, competencia)
  WHERE status IN ('aguardando','em_revisao');

CREATE INDEX idx_review_submissions_status ON public.review_submissions(status);
CREATE INDEX idx_review_submissions_reviewer ON public.review_submissions(reviewer_id);
CREATE INDEX idx_review_submissions_submitter ON public.review_submissions(submitted_by);
CREATE INDEX idx_review_submissions_competencia ON public.review_submissions(competencia);

CREATE TRIGGER trg_review_submissions_updated_at
  BEFORE UPDATE ON public.review_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.review_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view submissions"
  ON public.review_submissions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert submissions"
  ON public.review_submissions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "Authenticated can update submissions"
  ON public.review_submissions FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Submitter or admin can delete submissions"
  ON public.review_submissions FOR DELETE
  TO authenticated USING (auth.uid() = submitted_by OR public.has_role(auth.uid(), 'admin'));

-- 2) closing_deliverables -------------------------------------------------
CREATE TABLE public.closing_deliverables (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  competencia           date NOT NULL,
  tipo_demonstrativo    text NOT NULL
                        CHECK (tipo_demonstrativo IN ('dre','balancete','balanco','razao','dlpa','ecd','defis','outros')),
  titulo                text,
  arquivo_path          text NOT NULL,
  file_size_bytes       integer,
  versao                integer NOT NULL DEFAULT 1,
  gerado_por            uuid,
  gerado_em             timestamptz NOT NULL DEFAULT now(),
  origem                text NOT NULL DEFAULT 'unico_sci'
                        CHECK (origem IN ('unico_sci','upload_manual','outros')),
  review_submission_id  uuid REFERENCES public.review_submissions(id) ON DELETE SET NULL,
  approved              boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_deliverable_version
  ON public.closing_deliverables(client_id, competencia, tipo_demonstrativo, versao);

CREATE INDEX idx_deliverables_submission ON public.closing_deliverables(review_submission_id);
CREATE INDEX idx_deliverables_client_comp ON public.closing_deliverables(client_id, competencia);

CREATE TRIGGER trg_closing_deliverables_updated_at
  BEFORE UPDATE ON public.closing_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.closing_deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view deliverables"
  ON public.closing_deliverables FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert deliverables"
  ON public.closing_deliverables FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = gerado_por);

CREATE POLICY "Authenticated can update deliverables"
  ON public.closing_deliverables FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Generator or admin can delete deliverables"
  ON public.closing_deliverables FOR DELETE
  TO authenticated USING (auth.uid() = gerado_por OR public.has_role(auth.uid(), 'admin'));

-- 3) review_apontamentos --------------------------------------------------
CREATE TABLE public.review_apontamentos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id       uuid NOT NULL REFERENCES public.review_submissions(id) ON DELETE CASCADE,
  deliverable_id      uuid NOT NULL REFERENCES public.closing_deliverables(id) ON DELETE CASCADE,
  conta_referencia    text,
  descricao           text NOT NULL,
  resolved            boolean NOT NULL DEFAULT false,
  created_by          uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_apontamentos_submission ON public.review_apontamentos(submission_id);
CREATE INDEX idx_apontamentos_deliverable ON public.review_apontamentos(deliverable_id);

CREATE TRIGGER trg_review_apontamentos_updated_at
  BEFORE UPDATE ON public.review_apontamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.review_apontamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view apontamentos"
  ON public.review_apontamentos FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert apontamentos"
  ON public.review_apontamentos FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Author or admin can update apontamentos"
  ON public.review_apontamentos FOR UPDATE
  TO authenticated USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Author or admin can delete apontamentos"
  ON public.review_apontamentos FOR DELETE
  TO authenticated USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

-- 4) Realtime: habilita pgcron-friendly replica identity + publication ---
ALTER TABLE public.review_submissions REPLICA IDENTITY FULL;
ALTER TABLE public.review_apontamentos REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.review_submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.review_apontamentos;

-- 5) Storage bucket privado para PDFs dos demonstrativos ------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('closing-deliverables', 'closing-deliverables', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can read closing deliverable files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'closing-deliverables');

CREATE POLICY "Authenticated can upload closing deliverable files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'closing-deliverables');

CREATE POLICY "Authenticated can update own closing deliverable files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'closing-deliverables' AND auth.uid() = owner);

CREATE POLICY "Authenticated can delete own closing deliverable files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'closing-deliverables' AND (auth.uid() = owner OR public.has_role(auth.uid(), 'admin')));

-- 6) Settings: configurações default do módulo ---------------------------
INSERT INTO public.settings (key, value)
VALUES (
  'required_deliverables_by_tributacao',
  '{
    "simples_nacional": ["dre","balancete"],
    "lucro_presumido": ["dre","balancete","balanco"],
    "lucro_real":      ["dre","balancete","balanco","razao","ecd"]
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Acrescenta ações novas à chave action_permissions (preserva o que já existe)
INSERT INTO public.settings (key, value)
VALUES (
  'action_permissions',
  '{
    "edit_dates": ["coordenacao"],
    "liberar_para_revisao": ["coordenacao","analista","assistente"],
    "revisar_demonstrativos": ["coordenacao"],
    "cancelar_submissao": ["coordenacao"]
  }'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET value = public.settings.value
         || jsonb_build_object(
              'liberar_para_revisao',
              COALESCE(public.settings.value->'liberar_para_revisao',
                       '["coordenacao","analista","assistente"]'::jsonb),
              'revisar_demonstrativos',
              COALESCE(public.settings.value->'revisar_demonstrativos',
                       '["coordenacao"]'::jsonb),
              'cancelar_submissao',
              COALESCE(public.settings.value->'cancelar_submissao',
                       '["coordenacao"]'::jsonb)
            );

-- Acrescenta /revisao ao mapa de permissões de página (se existir a chave) -
INSERT INTO public.settings (key, value)
VALUES (
  'role_page_permissions',
  '{
    "coordenacao": ["/","/demandas","/planejamento","/equipe","/competencias","/revisao","/alertas","/clientes","/configuracoes","/usuarios"],
    "analista":    ["/","/demandas","/planejamento","/equipe","/competencias","/revisao","/alertas","/clientes"],
    "assistente":  ["/","/demandas","/planejamento","/competencias","/revisao","/clientes"],
    "estagiario":  ["/","/demandas","/planejamento","/competencias","/revisao","/clientes"]
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
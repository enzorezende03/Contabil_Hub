
-- =========================================================
-- PR 1 — Painel Gerencial: modelagem e permissões
-- =========================================================

-- 1) backlog_snapshots
CREATE TABLE public.backlog_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  iso_week      text NOT NULL,
  indicador     text NOT NULL,
  unidade       text,
  tributacao    text,
  valor         integer NOT NULL,
  detalhes      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_backlog_snapshots_unique
  ON public.backlog_snapshots (snapshot_date, indicador, COALESCE(unidade,''), COALESCE(tributacao,''));
CREATE INDEX idx_backlog_snapshots_indicador_date
  ON public.backlog_snapshots (indicador, snapshot_date DESC);
CREATE INDEX idx_backlog_snapshots_iso_week
  ON public.backlog_snapshots (iso_week);

GRANT SELECT ON public.backlog_snapshots TO authenticated;
GRANT ALL    ON public.backlog_snapshots TO service_role;

ALTER TABLE public.backlog_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver painel pode ler snapshots"
  ON public.backlog_snapshots FOR SELECT TO authenticated
  USING (public.has_action_permission(auth.uid(), 'ver_painel_gerencial'));

-- 2) gestao_metas
CREATE TABLE public.gestao_metas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicador       text NOT NULL,
  unidade         text,
  valor_meta      integer NOT NULL,
  tipo_meta       text NOT NULL CHECK (tipo_meta IN ('maximo','minimo')),
  vigencia_inicio date NOT NULL,
  vigencia_fim    date,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gestao_metas TO authenticated;
GRANT ALL ON public.gestao_metas TO service_role;

ALTER TABLE public.gestao_metas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver painel pode ler metas"
  ON public.gestao_metas FOR SELECT TO authenticated
  USING (public.has_action_permission(auth.uid(), 'ver_painel_gerencial'));

CREATE POLICY "configurar metas pode inserir"
  ON public.gestao_metas FOR INSERT TO authenticated
  WITH CHECK (public.has_action_permission(auth.uid(), 'configurar_metas'));

CREATE POLICY "configurar metas pode atualizar"
  ON public.gestao_metas FOR UPDATE TO authenticated
  USING (public.has_action_permission(auth.uid(), 'configurar_metas'))
  WITH CHECK (public.has_action_permission(auth.uid(), 'configurar_metas'));

CREATE POLICY "configurar metas pode remover"
  ON public.gestao_metas FOR DELETE TO authenticated
  USING (public.has_action_permission(auth.uid(), 'configurar_metas'));

CREATE TRIGGER trg_gestao_metas_updated_at
  BEFORE UPDATE ON public.gestao_metas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) briefing_drafts
CREATE TABLE public.briefing_drafts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iso_week            text NOT NULL UNIQUE,
  data_referencia     date NOT NULL,
  status              text NOT NULL DEFAULT 'em_revisao'
                      CHECK (status IN ('em_revisao','aprovado','enviado','arquivado')),
  generated_at        timestamptz NOT NULL DEFAULT now(),
  pptx_storage_path   text,
  custom_summary      text,
  custom_alerts       jsonb NOT NULL DEFAULT '[]'::jsonb,
  custom_focus        jsonb NOT NULL DEFAULT '[]'::jsonb,
  auto_summary        text,
  auto_alerts         jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes_internas      text,
  reviewed_by         uuid REFERENCES auth.users(id),
  reviewed_at         timestamptz,
  approved_by         uuid REFERENCES auth.users(id),
  approved_at         timestamptz,
  sent_by             uuid REFERENCES auth.users(id),
  sent_at             timestamptz,
  recipients_snapshot text[],
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_briefing_drafts_status_data
  ON public.briefing_drafts (status, data_referencia DESC);

GRANT SELECT, UPDATE ON public.briefing_drafts TO authenticated;
GRANT ALL ON public.briefing_drafts TO service_role;

ALTER TABLE public.briefing_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver painel pode ler briefings"
  ON public.briefing_drafts FOR SELECT TO authenticated
  USING (public.has_action_permission(auth.uid(), 'ver_painel_gerencial'));

CREATE POLICY "revisar briefing pode editar em revisao"
  ON public.briefing_drafts FOR UPDATE TO authenticated
  USING (
    public.has_action_permission(auth.uid(), 'revisar_briefing_semanal')
    AND status IN ('em_revisao','aprovado')
  )
  WITH CHECK (
    public.has_action_permission(auth.uid(), 'revisar_briefing_semanal')
  );

CREATE TRIGGER trg_briefing_drafts_updated_at
  BEFORE UPDATE ON public.briefing_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Índices novos em demand_status_entries
CREATE INDEX IF NOT EXISTS idx_dse_status_competencia
  ON public.demand_status_entries (status, year, month);

CREATE INDEX IF NOT EXISTS idx_dse_filled_by_completed
  ON public.demand_status_entries (filled_by, status)
  WHERE status = 'completed';

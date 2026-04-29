-- ===== Pendências: schema =====

-- Add GClick client mapping to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS gclick_cliente_id text;

-- Pendencies table
CREATE TABLE public.pendencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  demand_type text,

  tipo text NOT NULL CHECK (tipo IN ('interna','externa')),

  -- Internal fields
  setor_responsavel text CHECK (setor_responsavel IS NULL OR setor_responsavel IN ('fiscal','departamento_pessoal','societario','tributario','outros')),

  -- External fields
  documento_solicitado text,
  contato_cliente_nome text,
  contato_cliente_email text,
  contato_cliente_telefone text,

  descricao text NOT NULL,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','aguardando_resposta','em_andamento','resolvida','cancelada')),
  prioridade text NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta','urgente')),
  prazo_resposta date,

  responsavel_id uuid NOT NULL,

  ultimo_contato_em timestamptz,
  total_contatos integer NOT NULL DEFAULT 0,

  -- Follow-up scheduling
  followup_cadence_days integer NOT NULL DEFAULT 5 CHECK (followup_cadence_days > 0),
  next_followup_at timestamptz,
  followup_paused boolean NOT NULL DEFAULT false,
  followup_paused_reason text,
  followup_paused_until date,
  escalated_at timestamptz,

  -- GClick integration
  gclick_task_id text,
  gclick_task_url text,
  gclick_synced_at timestamptz,
  gclick_sync_error text,
  gclick_status text CHECK (gclick_status IS NULL OR gclick_status IN ('pendente_sync','sincronizada','falhou','concluida_no_gclick')),

  resolved_at timestamptz,
  resolution_notes text,

  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Type-specific required fields
  CONSTRAINT pendencies_tipo_fields_check CHECK (
    (tipo = 'interna' AND setor_responsavel IS NOT NULL)
    OR
    (tipo = 'externa' AND documento_solicitado IS NOT NULL)
  )
);

CREATE INDEX idx_pendencies_client_comp_status ON public.pendencies (client_id, competencia, status);
CREATE INDEX idx_pendencies_status_prazo ON public.pendencies (status, prazo_resposta);
CREATE INDEX idx_pendencies_responsavel_status ON public.pendencies (responsavel_id, status);
CREATE INDEX idx_pendencies_tipo_status ON public.pendencies (tipo, status);
CREATE INDEX idx_pendencies_next_followup ON public.pendencies (next_followup_at) WHERE status NOT IN ('resolvida','cancelada');

-- Communications log
CREATE TABLE public.pendency_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pendency_id uuid NOT NULL REFERENCES public.pendencies(id) ON DELETE CASCADE,
  canal text NOT NULL CHECK (canal IN ('email','whatsapp','telefone','teams','sistema','outros')),
  descricao text NOT NULL,
  realizado_por uuid NOT NULL,
  realizado_em timestamptz NOT NULL DEFAULT now(),
  resposta_recebida boolean NOT NULL DEFAULT false,
  resposta_descricao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pendency_comms_pendency ON public.pendency_communications (pendency_id, realizado_em DESC);

-- Enable RLS
ALTER TABLE public.pendencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pendency_communications ENABLE ROW LEVEL SECURITY;

-- RLS: pendencies
CREATE POLICY "Pendencies: viewable by authenticated"
  ON public.pendencies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Pendencies: insert with permission"
  ON public.pendencies FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_action_permission(auth.uid(), 'gerenciar_pendencias')
    )
  );

CREATE POLICY "Pendencies: update with permission"
  ON public.pendencies FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_action_permission(auth.uid(), 'gerenciar_pendencias')
    OR public.has_action_permission(auth.uid(), 'supervisionar_pendencias')
    OR responsavel_id = auth.uid()
    OR created_by = auth.uid()
  );

CREATE POLICY "Pendencies: delete by admin"
  ON public.pendencies FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- RLS: pendency_communications
CREATE POLICY "Pendency comms: viewable by authenticated"
  ON public.pendency_communications FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Pendency comms: insert by responsavel or supervisor"
  ON public.pendency_communications FOR INSERT
  TO authenticated
  WITH CHECK (
    realizado_por = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_action_permission(auth.uid(), 'supervisionar_pendencias')
      OR (
        public.has_action_permission(auth.uid(), 'gerenciar_pendencias')
        AND EXISTS (
          SELECT 1 FROM public.pendencies p
          WHERE p.id = pendency_communications.pendency_id
            AND (p.responsavel_id = auth.uid() OR p.created_by = auth.uid())
        )
      )
    )
  );

CREATE POLICY "Pendency comms: update by author or admin"
  ON public.pendency_communications FOR UPDATE
  TO authenticated
  USING (realizado_por = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Pendency comms: delete by author or admin"
  ON public.pendency_communications FOR DELETE
  TO authenticated
  USING (realizado_por = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger: updated_at
CREATE TRIGGER trg_pendencies_updated_at
  BEFORE UPDATE ON public.pendencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: on insert of communication, update parent pendency
CREATE OR REPLACE FUNCTION public.handle_pendency_communication_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cadence integer;
BEGIN
  SELECT followup_cadence_days INTO v_cadence
    FROM public.pendencies WHERE id = NEW.pendency_id;

  UPDATE public.pendencies
     SET ultimo_contato_em = NEW.realizado_em,
         total_contatos = total_contatos + 1,
         next_followup_at = NEW.realizado_em + (COALESCE(v_cadence, 5) || ' days')::interval,
         updated_at = now()
   WHERE id = NEW.pendency_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pendency_comm_after_insert
  AFTER INSERT ON public.pendency_communications
  FOR EACH ROW EXECUTE FUNCTION public.handle_pendency_communication_insert();

-- Trigger: on insert of pendency, set initial next_followup_at
CREATE OR REPLACE FUNCTION public.handle_pendency_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.next_followup_at IS NULL THEN
    NEW.next_followup_at := now() + (NEW.followup_cadence_days || ' days')::interval;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pendency_before_insert
  BEFORE INSERT ON public.pendencies
  FOR EACH ROW EXECUTE FUNCTION public.handle_pendency_insert();

-- Seed default action permissions for new actions
INSERT INTO public.settings (key, value)
VALUES (
  'action_permissions_pendencies_seed',
  jsonb_build_object('seeded_at', now()::text)
)
ON CONFLICT DO NOTHING;

-- Merge new actions into existing action_permissions setting
DO $$
DECLARE
  v_current jsonb;
BEGIN
  SELECT value INTO v_current FROM public.settings WHERE key = 'action_permissions';
  IF v_current IS NULL THEN
    INSERT INTO public.settings (key, value) VALUES ('action_permissions', '{}'::jsonb);
    v_current := '{}'::jsonb;
  END IF;

  IF NOT (v_current ? 'gerenciar_pendencias') THEN
    v_current := v_current || jsonb_build_object('gerenciar_pendencias', jsonb_build_array('coordenacao','analista','assistente'));
  END IF;
  IF NOT (v_current ? 'supervisionar_pendencias') THEN
    v_current := v_current || jsonb_build_object('supervisionar_pendencias', jsonb_build_array('coordenacao'));
  END IF;
  IF NOT (v_current ? 'configurar_integracoes') THEN
    v_current := v_current || jsonb_build_object('configurar_integracoes', jsonb_build_array('coordenacao'));
  END IF;

  UPDATE public.settings SET value = v_current, updated_at = now() WHERE key = 'action_permissions';
END $$;
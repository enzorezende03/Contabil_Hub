
-- 1) team_availability
CREATE TABLE public.team_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('ferias','atestado','folga','treinamento','licenca','outros')),
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  horas_dia integer NOT NULL DEFAULT 480,
  descricao text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_dates_chk CHECK (data_fim >= data_inicio)
);
CREATE INDEX idx_team_availability_user_period ON public.team_availability(user_id, data_inicio, data_fim);
ALTER TABLE public.team_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Availability: view self or supervisor"
ON public.team_availability FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_action_permission(auth.uid(), 'ver_produtividade_equipe')
  OR public.has_action_permission(auth.uid(), 'gerenciar_ausencias_equipe')
);

CREATE POLICY "Availability: insert self or supervisor"
ON public.team_availability FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_action_permission(auth.uid(), 'gerenciar_ausencias_equipe')
  )
);

CREATE POLICY "Availability: update self or supervisor"
ON public.team_availability FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_action_permission(auth.uid(), 'gerenciar_ausencias_equipe')
);

CREATE POLICY "Availability: delete self or supervisor"
ON public.team_availability FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_action_permission(auth.uid(), 'gerenciar_ausencias_equipe')
);

CREATE TRIGGER update_team_availability_updated_at
BEFORE UPDATE ON public.team_availability
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) productivity_snapshots
CREATE TABLE public.productivity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ano integer NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  effort_points numeric NOT NULL DEFAULT 0,
  capacity_minutes integer NOT NULL DEFAULT 0,
  effort_score_pct numeric NOT NULL DEFAULT 0,
  quality_score_pct numeric,
  timeliness_score_pct numeric NOT NULL DEFAULT 0,
  composite_score numeric NOT NULL DEFAULT 0,
  tasks_completed_count integer NOT NULL DEFAULT 0,
  tasks_on_time_count integer NOT NULL DEFAULT 0,
  submissions_approved_first integer NOT NULL DEFAULT 0,
  submissions_total integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ano, mes)
);
CREATE INDEX idx_prod_snap_period ON public.productivity_snapshots(ano, mes);
ALTER TABLE public.productivity_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Snapshots: view self or supervisor"
ON public.productivity_snapshots FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_action_permission(auth.uid(), 'ver_produtividade_equipe')
);

-- Inserts/updates feitos pela edge function via service role (bypassa RLS).
-- Sem políticas para INSERT/UPDATE/DELETE → bloqueado para usuários comuns.

CREATE TRIGGER update_productivity_snapshots_updated_at
BEFORE UPDATE ON public.productivity_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) holidays
CREATE TABLE public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  descricao text NOT NULL,
  escopo text NOT NULL DEFAULT 'nacional' CHECK (escopo IN ('nacional','estadual','municipal')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (data, descricao)
);
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Holidays: viewable by authenticated"
ON public.holidays FOR SELECT TO authenticated USING (true);

CREATE POLICY "Holidays: insert by admin or coordenacao"
ON public.holidays FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'coordenacao')
);

CREATE POLICY "Holidays: update by admin or coordenacao"
ON public.holidays FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'coordenacao')
);

CREATE POLICY "Holidays: delete by admin or coordenacao"
ON public.holidays FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'coordenacao')
);

CREATE TRIGGER update_holidays_updated_at
BEFORE UPDATE ON public.holidays
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed de feriados nacionais BR 2025 e 2026
INSERT INTO public.holidays (data, descricao, escopo) VALUES
('2025-01-01','Confraternização Universal','nacional'),
('2025-03-03','Carnaval','nacional'),
('2025-03-04','Carnaval','nacional'),
('2025-04-18','Sexta-feira Santa','nacional'),
('2025-04-21','Tiradentes','nacional'),
('2025-05-01','Dia do Trabalho','nacional'),
('2025-06-19','Corpus Christi','nacional'),
('2025-09-07','Independência','nacional'),
('2025-10-12','Nossa Senhora Aparecida','nacional'),
('2025-11-02','Finados','nacional'),
('2025-11-15','Proclamação da República','nacional'),
('2025-11-20','Consciência Negra','nacional'),
('2025-12-25','Natal','nacional'),
('2026-01-01','Confraternização Universal','nacional'),
('2026-02-16','Carnaval','nacional'),
('2026-02-17','Carnaval','nacional'),
('2026-04-03','Sexta-feira Santa','nacional'),
('2026-04-21','Tiradentes','nacional'),
('2026-05-01','Dia do Trabalho','nacional'),
('2026-06-04','Corpus Christi','nacional'),
('2026-09-07','Independência','nacional'),
('2026-10-12','Nossa Senhora Aparecida','nacional'),
('2026-11-02','Finados','nacional'),
('2026-11-15','Proclamação da República','nacional'),
('2026-11-20','Consciência Negra','nacional'),
('2026-12-25','Natal','nacional')
ON CONFLICT DO NOTHING;

-- 4) Coluna completed_at em demands + trigger
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE OR REPLACE FUNCTION public.handle_demand_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS demands_completed_at_trg ON public.demands;
CREATE TRIGGER demands_completed_at_trg
BEFORE UPDATE ON public.demands
FOR EACH ROW EXECUTE FUNCTION public.handle_demand_completed_at();

-- Backfill: marcar completed_at para demandas já concluídas
UPDATE public.demands SET completed_at = updated_at WHERE status = 'completed' AND completed_at IS NULL;

-- 5) Função: dias úteis no mês
CREATE OR REPLACE FUNCTION public.business_days_in_month(p_ano integer, p_mes integer)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(
      make_date(p_ano, p_mes, 1),
      (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date,
      interval '1 day'
    )::date AS d
  )
  SELECT COUNT(*)::int
    FROM days
   WHERE EXTRACT(ISODOW FROM d) < 6
     AND NOT EXISTS (SELECT 1 FROM public.holidays h WHERE h.data = days.d);
$$;

-- 6) Settings: defaults
INSERT INTO public.settings (key, value) VALUES
('productivity_client_multipliers', '{
  "simples_nacional": {"standard":1.0,"premium":1.3,"vip":1.6},
  "lucro_presumido":  {"standard":1.4,"premium":1.8,"vip":2.2},
  "lucro_real":       {"standard":2.0,"premium":2.6,"vip":3.2}
}'::jsonb),
('productivity_complexity_multipliers', '{"baixa":1.0,"media":1.5,"alta":2.0}'::jsonb),
('productivity_score_weights', '{"esforco":0.5,"qualidade":0.3,"prazo":0.2}'::jsonb),
('productivity_capacity_config', '{"jornada_minutos":480,"overhead_coef":0.80,"warmup_qualidade_until":"2026-07-31"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 7) Atualizar action_permissions com 4 chaves novas (preservando existentes)
UPDATE public.settings
   SET value = COALESCE(value, '{}'::jsonb)
             || jsonb_build_object(
                  'ver_propria_produtividade',
                    COALESCE(value->'ver_propria_produtividade',
                      '["coordenacao","analista","assistente","estagiario"]'::jsonb),
                  'ver_produtividade_equipe',
                    COALESCE(value->'ver_produtividade_equipe', '["coordenacao"]'::jsonb),
                  'configurar_produtividade',
                    COALESCE(value->'configurar_produtividade', '["coordenacao"]'::jsonb),
                  'gerenciar_ausencias_equipe',
                    COALESCE(value->'gerenciar_ausencias_equipe', '["coordenacao"]'::jsonb)
                )
 WHERE key = 'action_permissions';

-- Caso a row ainda não exista, cria com defaults
INSERT INTO public.settings (key, value)
SELECT 'action_permissions', '{
  "edit_dates": ["coordenacao"],
  "liberar_para_revisao": ["coordenacao","analista","assistente"],
  "revisar_demonstrativos": ["coordenacao"],
  "cancelar_submissao": ["coordenacao"],
  "supervisionar_revisao": ["coordenacao"],
  "gerenciar_pendencias": ["coordenacao","analista","assistente"],
  "supervisionar_pendencias": ["coordenacao"],
  "configurar_integracoes": ["coordenacao"],
  "ver_todas_demandas": ["coordenacao","analista"],
  "ver_toda_equipe": ["coordenacao","analista"],
  "ver_propria_produtividade": ["coordenacao","analista","assistente","estagiario"],
  "ver_produtividade_equipe": ["coordenacao"],
  "configurar_produtividade": ["coordenacao"],
  "gerenciar_ausencias_equipe": ["coordenacao"]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'action_permissions');

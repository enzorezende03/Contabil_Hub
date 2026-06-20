
-- 1) Colunas em clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS apelido text,
  ADD COLUMN IF NOT EXISTS cadencia_fechamento text NOT NULL DEFAULT 'mensal';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_cadencia_fechamento_check'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_cadencia_fechamento_check
      CHECK (cadencia_fechamento IN ('mensal','trimestral','semestral','anual','livre'));
  END IF;
END $$;

-- 2) Colunas em review_submissions
ALTER TABLE public.review_submissions
  ADD COLUMN IF NOT EXISTS periodo_inicio date,
  ADD COLUMN IF NOT EXISTS periodo_fim date;

-- 3) View v_closing_periods
CREATE OR REPLACE VIEW public.v_closing_periods AS
WITH base AS (
  SELECT
    c.id   AS client_id,
    c.razao_social AS client_name,
    COALESCE(NULLIF(c.cadencia_fechamento, ''), 'mensal') AS cadencia,
    -- Início da responsabilidade (MM/YYYY -> date)
    COALESCE(
      CASE WHEN c.competencia_inicio ~ '^[0-9]{1,2}/[0-9]{4}$'
           THEN to_date(c.competencia_inicio, 'MM/YYYY')
           WHEN c.competencia_inicio ~ '^[0-9]{4}-[0-9]{1,2}'
           THEN to_date(substring(c.competencia_inicio from 1 for 7), 'YYYY-MM')
           ELSE NULL END,
      '2022-01-01'::date
    ) AS start_date,
    -- Fim: data_fim_contrato ou mês corrente
    LEAST(
      date_trunc('month', current_date)::date,
      COALESCE(date_trunc('month', c.data_fim_contrato)::date, date_trunc('month', current_date)::date)
    ) AS end_date
  FROM public.clients c
),
months AS (
  SELECT b.client_id, b.client_name, b.cadencia,
         gs::date AS month_date
  FROM base b
  CROSS JOIN LATERAL generate_series(
    date_trunc('month', b.start_date)::date,
    date_trunc('month', b.end_date)::date,
    interval '1 month'
  ) AS gs
),
periods AS (
  -- Mensal
  SELECT
    m.client_id, m.client_name, 'mensal'::text AS cadencia,
    to_char(m.month_date, 'Mon/YY') AS periodo_label,
    m.month_date AS periodo_inicio,
    (date_trunc('month', m.month_date) + interval '1 month - 1 day')::date AS periodo_fim
  FROM months m
  WHERE m.cadencia = 'mensal'

  UNION ALL
  -- Trimestral
  SELECT
    m.client_id, m.client_name, 'trimestral',
    'Q' || EXTRACT(QUARTER FROM m.month_date)::text || '/' || to_char(m.month_date, 'YY'),
    date_trunc('quarter', m.month_date)::date,
    (date_trunc('quarter', m.month_date) + interval '3 months - 1 day')::date
  FROM months m
  WHERE m.cadencia = 'trimestral'

  UNION ALL
  -- Semestral
  SELECT
    m.client_id, m.client_name, 'semestral',
    'S' || CASE WHEN EXTRACT(MONTH FROM m.month_date) <= 6 THEN '1' ELSE '2' END
      || '/' || to_char(m.month_date, 'YY'),
    CASE WHEN EXTRACT(MONTH FROM m.month_date) <= 6
         THEN make_date(EXTRACT(YEAR FROM m.month_date)::int, 1, 1)
         ELSE make_date(EXTRACT(YEAR FROM m.month_date)::int, 7, 1) END,
    CASE WHEN EXTRACT(MONTH FROM m.month_date) <= 6
         THEN make_date(EXTRACT(YEAR FROM m.month_date)::int, 6, 30)
         ELSE make_date(EXTRACT(YEAR FROM m.month_date)::int, 12, 31) END
  FROM months m
  WHERE m.cadencia = 'semestral'

  UNION ALL
  -- Anual
  SELECT
    m.client_id, m.client_name, 'anual',
    to_char(m.month_date, 'YYYY'),
    make_date(EXTRACT(YEAR FROM m.month_date)::int, 1, 1),
    make_date(EXTRACT(YEAR FROM m.month_date)::int, 12, 31)
  FROM months m
  WHERE m.cadencia = 'anual'
),
periods_distinct AS (
  SELECT DISTINCT client_id, client_name, cadencia, periodo_label, periodo_inicio, periodo_fim
  FROM periods
),
-- Conta meses esperados x meses 100% concluídos (3 tarefas) por período
month_completion AS (
  SELECT
    pd.client_id, pd.client_name, pd.cadencia, pd.periodo_label, pd.periodo_inicio, pd.periodo_fim,
    gs::date AS month_date,
    (
      SELECT bool_and(d.status = 'completed')
      FROM (VALUES ('lancamentos'),('conciliacao_bancaria'),('conciliacao_contabil')) AS t(dt)
      LEFT JOIN public.demand_status_entries d
        ON d.client_name = pd.client_name
       AND d.demand_type = t.dt
       AND d.year ~ '^[0-9]{4}$' AND d.month ~ '^[0-9]{1,2}$'
       AND d.year::int  = EXTRACT(YEAR FROM gs)::int
       AND d.month::int = EXTRACT(MONTH FROM gs)::int
    ) AS month_done
  FROM periods_distinct pd
  CROSS JOIN LATERAL generate_series(
    pd.periodo_inicio, pd.periodo_fim, interval '1 month'
  ) AS gs
),
period_agg AS (
  SELECT
    client_id, client_name, cadencia, periodo_label, periodo_inicio, periodo_fim,
    count(*) FILTER (WHERE month_date <= date_trunc('month', current_date)::date) AS meses_esperados,
    count(*) FILTER (WHERE month_done IS TRUE AND month_date <= date_trunc('month', current_date)::date) AS meses_completos
  FROM month_completion
  GROUP BY 1,2,3,4,5,6
),
review_state AS (
  -- Última submissão por cliente cuja competência caia dentro do período
  SELECT
    pa.client_id, pa.periodo_label,
    (
      SELECT rs.status::text
      FROM public.review_submissions rs
      WHERE rs.client_id = pa.client_id
        AND rs.competencia >= pa.periodo_inicio
        AND rs.competencia <= pa.periodo_fim
      ORDER BY rs.submitted_at DESC NULLS LAST
      LIMIT 1
    ) AS review_status
  FROM period_agg pa
)
SELECT
  pa.client_id,
  pa.client_name,
  pa.cadencia,
  pa.periodo_label,
  pa.periodo_inicio,
  pa.periodo_fim,
  pa.meses_esperados,
  pa.meses_completos,
  CASE
    WHEN rs.review_status IN ('aprovado','approved','concluida','concluido') THEN 'aprovado'
    WHEN rs.review_status IN ('em_revisao','aguardando','submitted','in_review') THEN 'em_revisao'
    WHEN pa.meses_esperados > 0 AND pa.meses_completos = pa.meses_esperados THEN 'pronto'
    WHEN pa.meses_completos > 0 THEN 'em_andamento'
    ELSE 'nao_iniciado'
  END AS periodo_status
FROM period_agg pa
LEFT JOIN review_state rs
  ON rs.client_id = pa.client_id AND rs.periodo_label = pa.periodo_label;

GRANT SELECT ON public.v_closing_periods TO authenticated;
GRANT SELECT ON public.v_closing_periods TO service_role;

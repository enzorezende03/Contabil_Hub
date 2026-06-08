
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.generate_backlog_snapshot(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_date date := date_trunc('week', current_date)::date; -- ISO Monday
  v_iso_week text := to_char(v_snapshot_date, 'IYYY-"W"IW');
  v_current_comp date := date_trunc('month', current_date)::date;
  v_rows integer := 0;
BEGIN
  -- If snapshot already exists for this week and not forced, skip
  IF NOT p_force AND EXISTS (
    SELECT 1 FROM public.backlog_snapshots WHERE snapshot_date = v_snapshot_date
  ) THEN
    DELETE FROM public.backlog_snapshots WHERE snapshot_date = v_snapshot_date;
  END IF;

  -- ===== Backlog por demand_type (lancamentos, conciliacao_bancaria, conciliacao_contabil, fechamento) =====
  WITH base AS (
    SELECT
      d.demand_type,
      c.unidade,
      c.tributacao,
      d.client_name,
      d.year, d.month
    FROM public.demand_status_entries d
    JOIN public.clients c ON c.razao_social = d.client_name
    WHERE d.status <> 'completed'
      AND d.demand_type IN ('lancamentos','conciliacao_bancaria','conciliacao_contabil','fechamento')
      AND c.competencia_inicio IS NOT NULL
      AND to_date(d.year || '-' || d.month || '-01', 'YYYY-MM-DD')
            BETWEEN to_date(c.competencia_inicio, 'MM/YYYY') AND v_current_comp
  ),
  agg AS (
    SELECT
      CASE demand_type
        WHEN 'lancamentos' THEN 'lancamentos_pendentes'
        WHEN 'conciliacao_bancaria' THEN 'conciliacao_bancaria_pendente'
        WHEN 'conciliacao_contabil' THEN 'conciliacao_contabil_pendente'
        WHEN 'fechamento' THEN 'fechamento_mensal_pendente'
      END AS indicador,
      unidade, tributacao,
      count(DISTINCT (client_name, year, month))::int AS valor
    FROM base
    GROUP BY GROUPING SETS (
      (demand_type),
      (demand_type, unidade),
      (demand_type, tributacao),
      (demand_type, unidade, tributacao)
    )
  )
  INSERT INTO public.backlog_snapshots (snapshot_date, iso_week, indicador, unidade, tributacao, valor)
  SELECT v_snapshot_date, v_iso_week, indicador, unidade, tributacao, valor FROM agg
  ON CONFLICT (snapshot_date, indicador, (COALESCE(unidade,'')), (COALESCE(tributacao,'')))
  DO UPDATE SET valor = EXCLUDED.valor;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- ===== Fechamento anual pendente: empresas com algum mês do ano corrente não fechado =====
  WITH pend AS (
    SELECT DISTINCT c.razao_social AS cliente, c.unidade, c.tributacao
    FROM public.demand_status_entries d
    JOIN public.clients c ON c.razao_social = d.client_name
    WHERE d.status <> 'completed'
      AND d.demand_type IN ('lancamentos','conciliacao_bancaria','conciliacao_contabil','fechamento')
      AND d.year = to_char(current_date, 'YYYY')
  ),
  agg AS (
    SELECT 'fechamento_anual_pendente'::text AS indicador, unidade, tributacao, count(DISTINCT cliente)::int AS valor
    FROM pend
    GROUP BY GROUPING SETS ((), (unidade), (tributacao), (unidade, tributacao))
  )
  INSERT INTO public.backlog_snapshots (snapshot_date, iso_week, indicador, unidade, tributacao, valor)
  SELECT v_snapshot_date, v_iso_week, indicador, unidade, tributacao, valor FROM agg
  ON CONFLICT (snapshot_date, indicador, (COALESCE(unidade,'')), (COALESCE(tributacao,'')))
  DO UPDATE SET valor = EXCLUDED.valor;

  -- ===== Revisões pendentes =====
  INSERT INTO public.backlog_snapshots (snapshot_date, iso_week, indicador, valor)
  SELECT v_snapshot_date, v_iso_week, 'revisao_pendente',
         (SELECT count(*)::int FROM public.review_submissions WHERE status IN ('aguardando','em_revisao'))
  ON CONFLICT (snapshot_date, indicador, (COALESCE(unidade,'')), (COALESCE(tributacao,'')))
  DO UPDATE SET valor = EXCLUDED.valor;

  -- ===== Velocity: concluídos nos últimos 7 dias, por tipo =====
  WITH vel AS (
    SELECT
      d.demand_type, c.unidade, c.tributacao
    FROM public.demand_status_entries d
    LEFT JOIN public.clients c ON c.razao_social = d.client_name
    WHERE d.status = 'completed'
      AND d.updated_at >= now() - interval '7 days'
      AND d.demand_type IN ('lancamentos','conciliacao_bancaria','conciliacao_contabil','fechamento')
  ),
  agg AS (
    SELECT
      'velocity_' || demand_type AS indicador,
      unidade, tributacao, count(*)::int AS valor
    FROM vel
    GROUP BY GROUPING SETS (
      (demand_type),
      (demand_type, unidade),
      (demand_type, tributacao),
      (demand_type, unidade, tributacao)
    )
  )
  INSERT INTO public.backlog_snapshots (snapshot_date, iso_week, indicador, unidade, tributacao, valor)
  SELECT v_snapshot_date, v_iso_week, indicador, unidade, tributacao, valor FROM agg
  ON CONFLICT (snapshot_date, indicador, (COALESCE(unidade,'')), (COALESCE(tributacao,'')))
  DO UPDATE SET valor = EXCLUDED.valor;

  RETURN jsonb_build_object(
    'snapshot_date', v_snapshot_date,
    'iso_week', v_iso_week,
    'ok', true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_backlog_snapshot(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_backlog_snapshot(boolean) TO authenticated, service_role;

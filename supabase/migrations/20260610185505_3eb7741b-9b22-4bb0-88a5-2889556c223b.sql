
-- Função: células esperadas (cross join clientes × competências × tipos) que ainda não foram concluídas
CREATE OR REPLACE FUNCTION public.expected_pending_cells(
  p_unidade text DEFAULT NULL,
  p_tributacao text DEFAULT NULL,
  p_demand_types text[] DEFAULT ARRAY['lancamentos','conciliacao_bancaria','conciliacao_contabil','fechamento']
)
RETURNS TABLE (
  client_id uuid,
  client_name text,
  unidade text,
  tributacao text,
  year int,
  month int,
  demand_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH default_start AS (
    SELECT COALESCE(
      (SELECT (value #>> '{}')::date FROM public.settings WHERE key = 'backlog_default_start'),
      '2022-01-01'::date
    ) AS d
  ),
  expected AS (
    SELECT
      c.id AS client_id,
      c.razao_social AS client_name,
      c.unidade,
      c.tributacao,
      EXTRACT(YEAR FROM gs.competencia)::int AS year,
      EXTRACT(MONTH FROM gs.competencia)::int AS month,
      dt AS demand_type
    FROM public.clients c
    CROSS JOIN LATERAL (
      SELECT generate_series(
        COALESCE(
          CASE WHEN c.competencia_inicio ~ '^[0-9]{2}/[0-9]{4}$'
               THEN to_date(c.competencia_inicio, 'MM/YYYY')
               ELSE NULL END,
          (SELECT d FROM default_start)
        )::timestamp,
        date_trunc('month', current_date - interval '1 month')::timestamp,
        interval '1 month'
      ) AS competencia
    ) gs
    CROSS JOIN unnest(p_demand_types) AS dt
    WHERE (p_unidade IS NULL OR c.unidade = p_unidade)
      AND (p_tributacao IS NULL OR c.tributacao = p_tributacao)
  )
  SELECT e.client_id, e.client_name, e.unidade, e.tributacao, e.year, e.month, e.demand_type
  FROM expected e
  WHERE NOT EXISTS (
    SELECT 1 FROM public.demand_status_entries d
    WHERE d.client_name = e.client_name
      AND d.demand_type = e.demand_type
      AND d.status = 'completed'
      AND d.year ~ '^[0-9]{4}$' AND d.month ~ '^[0-9]{1,2}$'
      AND d.year::int = e.year
      AND d.month::int = e.month
  );
$$;

GRANT EXECUTE ON FUNCTION public.expected_pending_cells(text, text, text[]) TO authenticated, service_role;

-- Sumário compacto pro painel (KPIs + distribuições + top clientes)
CREATE OR REPLACE FUNCTION public.backlog_overview(
  p_unidade text DEFAULT NULL,
  p_tributacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_current_year int := EXTRACT(YEAR FROM current_date)::int;
BEGIN
  WITH pend AS (
    SELECT * FROM public.expected_pending_cells(p_unidade, p_tributacao)
  ),
  per_type AS (
    SELECT demand_type, count(*)::int AS c FROM pend GROUP BY demand_type
  ),
  by_comp AS (
    SELECT (year::text || '-' || lpad(month::text,2,'0')) AS comp,
           count(DISTINCT client_name)::int AS empresas,
           count(*)::int AS pendencias
    FROM pend
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 12
  ),
  by_trib AS (
    SELECT COALESCE(tributacao,'(sem)') AS k, count(*)::int AS c
    FROM pend GROUP BY 1
  ),
  by_client AS (
    SELECT client_name,
           max(tributacao) AS tributacao,
           max(unidade) AS unidade,
           count(*)::int AS backlog,
           min(make_date(year, month, 1)) AS oldest
    FROM pend
    GROUP BY client_name
    ORDER BY backlog DESC
    LIMIT 10
  ),
  anual AS (
    SELECT count(DISTINCT client_name)::int AS c FROM pend WHERE year = v_current_year
  ),
  revisao AS (
    SELECT count(*)::int AS c FROM public.review_submissions WHERE status IN ('aguardando','em_revisao')
  )
  SELECT jsonb_build_object(
    'per_type', COALESCE((SELECT jsonb_object_agg(demand_type, c) FROM per_type), '{}'::jsonb),
    'by_comp', COALESCE((SELECT jsonb_agg(jsonb_build_object('comp', comp, 'empresas', empresas, 'pendencias', pendencias)) FROM by_comp), '[]'::jsonb),
    'by_trib', COALESCE((SELECT jsonb_object_agg(k, c) FROM by_trib), '{}'::jsonb),
    'top_clients', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'client_name', client_name,
        'tributacao', tributacao,
        'unidade', unidade,
        'backlog', backlog,
        'oldest', oldest
      )) FROM by_client), '[]'::jsonb),
    'fechamento_anual', COALESCE((SELECT c FROM anual), 0),
    'revisao_pendente', COALESCE((SELECT c FROM revisao), 0),
    'computed_at', now()
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backlog_overview(text, text) TO authenticated, service_role;

-- Drill-down: lista de células pendentes
CREATE OR REPLACE FUNCTION public.backlog_drilldown(
  p_demand_type text,
  p_unidade text DEFAULT NULL,
  p_tributacao text DEFAULT NULL,
  p_only_current_year boolean DEFAULT false
)
RETURNS TABLE (
  client_name text,
  unidade text,
  tributacao text,
  year int,
  month int,
  demand_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_name, unidade, tributacao, year, month, demand_type
  FROM public.expected_pending_cells(
    p_unidade,
    p_tributacao,
    CASE WHEN p_demand_type = 'all'
         THEN ARRAY['lancamentos','conciliacao_bancaria','conciliacao_contabil','fechamento']
         ELSE ARRAY[p_demand_type]
    END
  )
  WHERE (NOT p_only_current_year OR year = EXTRACT(YEAR FROM current_date)::int)
  ORDER BY client_name, year DESC, month DESC;
$$;

GRANT EXECUTE ON FUNCTION public.backlog_drilldown(text, text, text, boolean) TO authenticated, service_role;

-- Atualiza generate_backlog_snapshot pra usar o novo cálculo (cross join)
CREATE OR REPLACE FUNCTION public.generate_backlog_snapshot(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_date date := date_trunc('week', current_date)::date;
  v_iso_week text := to_char(v_snapshot_date, 'IYYY-"W"IW');
  v_current_year int := EXTRACT(YEAR FROM current_date)::int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.backlog_snapshots WHERE snapshot_date = v_snapshot_date) THEN
    IF NOT p_force THEN
      DELETE FROM public.backlog_snapshots WHERE snapshot_date = v_snapshot_date;
    ELSE
      DELETE FROM public.backlog_snapshots WHERE snapshot_date = v_snapshot_date;
    END IF;
  END IF;

  -- Backlog mensal (cross join)
  WITH pend AS (
    SELECT * FROM public.expected_pending_cells(NULL, NULL)
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
      count(*)::int AS valor
    FROM pend
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

  -- Fechamento anual (clientes com algum mês do ano corrente pendente)
  WITH pend AS (
    SELECT DISTINCT client_name, unidade, tributacao
    FROM public.expected_pending_cells(NULL, NULL)
    WHERE year = v_current_year
  ),
  agg AS (
    SELECT 'fechamento_anual_pendente'::text AS indicador, unidade, tributacao, count(DISTINCT client_name)::int AS valor
    FROM pend
    GROUP BY GROUPING SETS ((), (unidade), (tributacao), (unidade, tributacao))
  )
  INSERT INTO public.backlog_snapshots (snapshot_date, iso_week, indicador, unidade, tributacao, valor)
  SELECT v_snapshot_date, v_iso_week, indicador, unidade, tributacao, valor FROM agg
  ON CONFLICT (snapshot_date, indicador, (COALESCE(unidade,'')), (COALESCE(tributacao,'')))
  DO UPDATE SET valor = EXCLUDED.valor;

  -- Revisões
  INSERT INTO public.backlog_snapshots (snapshot_date, iso_week, indicador, valor)
  SELECT v_snapshot_date, v_iso_week, 'revisao_pendente',
         (SELECT count(*)::int FROM public.review_submissions WHERE status IN ('aguardando','em_revisao'))
  ON CONFLICT (snapshot_date, indicador, (COALESCE(unidade,'')), (COALESCE(tributacao,'')))
  DO UPDATE SET valor = EXCLUDED.valor;

  -- Velocity (entregas dos últimos 7 dias)
  WITH vel AS (
    SELECT d.demand_type, c.unidade, c.tributacao
    FROM public.demand_status_entries d
    LEFT JOIN public.clients c ON c.razao_social = d.client_name
    WHERE d.status = 'completed'
      AND d.updated_at >= now() - interval '7 days'
      AND d.demand_type IN ('lancamentos','conciliacao_bancaria','conciliacao_contabil','fechamento')
  ),
  agg AS (
    SELECT 'velocity_' || demand_type AS indicador, unidade, tributacao, count(*)::int AS valor
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

  RETURN jsonb_build_object('snapshot_date', v_snapshot_date, 'iso_week', v_iso_week, 'ok', true);
END;
$$;

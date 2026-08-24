CREATE OR REPLACE FUNCTION public.weekly_delivery_overview(
  p_weeks integer DEFAULT 12,
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
  v_result jsonb;
  v_weeks integer := GREATEST(1, LEAST(COALESCE(p_weeks, 12), 52));
BEGIN
  IF NOT (
    coalesce(auth.role(), '') = 'service_role'
    OR public.is_team_member(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH weeks AS (
    SELECT gs::date AS week_start
    FROM generate_series(
      date_trunc('week', now())::date - ((v_weeks - 1) * 7),
      date_trunc('week', now())::date,
      interval '7 days'
    ) gs
  ),
  items AS (
    SELECT 'demands'::text AS origem, d.id, d.client, d.types, d.assignee, d.internal_deadline,
           d.status, d.created_at, d.completed_at
    FROM public.demands d
    LEFT JOIN public.clients c ON c.razao_social = d.client
    WHERE (p_unidade IS NULL OR c.unidade = p_unidade)
      AND (p_tributacao IS NULL OR c.tributacao = p_tributacao)
    UNION ALL
    SELECT 'plannings'::text, p.id, p.client, p.types, p.assignee, p.internal_deadline,
           p.status, p.created_at, p.completed_at
    FROM public.plannings p
    LEFT JOIN public.clients c ON c.razao_social = p.client
    WHERE (p_unidade IS NULL OR c.unidade = p_unidade)
      AND (p_tributacao IS NULL OR c.tributacao = p_tributacao)
  ),
  per_week AS (
    SELECT w.week_start,
           o.origem,
           COUNT(*) FILTER (
             WHERE i.created_at >= w.week_start
               AND i.created_at < w.week_start + 7
               AND i.origem = o.origem
           ) AS solicitadas,
           COUNT(*) FILTER (
             WHERE i.completed_at IS NOT NULL
               AND i.completed_at >= w.week_start
               AND i.completed_at < w.week_start + 7
               AND i.origem = o.origem
           ) AS entregues,
           COUNT(*) FILTER (
             WHERE i.completed_at IS NOT NULL
               AND i.completed_at >= w.week_start
               AND i.completed_at < w.week_start + 7
               AND i.completed_at::date <= i.internal_deadline
               AND i.origem = o.origem
           ) AS entregues_no_prazo
    FROM weeks w
    CROSS JOIN (SELECT 'demands' AS origem UNION ALL SELECT 'plannings') o
    LEFT JOIN items i ON TRUE
    GROUP BY w.week_start, o.origem
  ),
  weeks_json AS (
    SELECT jsonb_agg(x ORDER BY x.week_start) AS arr
    FROM (
      SELECT pw.week_start,
             to_char(pw.week_start, 'IYYY-"W"IW') AS iso_week,
             pw.origem,
             pw.solicitadas,
             pw.entregues,
             pw.entregues_no_prazo
      FROM per_week pw
    ) x
  ),
  late AS (
    SELECT jsonb_agg(y ORDER BY y.internal_deadline) AS arr
    FROM (
      SELECT i.origem,
             i.id,
             i.client AS client_name,
             i.types,
             COALESCE(pr.display_name, i.assignee) AS responsavel,
             i.internal_deadline,
             (CURRENT_DATE - i.internal_deadline) AS dias_atraso
      FROM items i
      LEFT JOIN public.profiles pr ON pr.user_id::text = i.assignee
      WHERE i.completed_at IS NULL
        AND i.status <> 'completed'
        AND i.internal_deadline < CURRENT_DATE
    ) y
  ),
  open_counts AS (
    SELECT jsonb_object_agg(origem, cnt) AS obj
    FROM (
      SELECT i.origem, COUNT(*) AS cnt
      FROM items i
      WHERE i.completed_at IS NULL AND i.status <> 'completed'
      GROUP BY i.origem
    ) z
  )
  SELECT jsonb_build_object(
    'weeks', COALESCE((SELECT arr FROM weeks_json), '[]'::jsonb),
    'late', COALESCE((SELECT arr FROM late), '[]'::jsonb),
    'open', COALESCE((SELECT obj FROM open_counts), '{}'::jsonb),
    'computed_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.weekly_delivery_overview(integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weekly_delivery_overview(integer, text, text) TO authenticated, service_role;
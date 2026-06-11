
-- 1. Novos campos em clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS data_fim_contrato date,
  ADD COLUMN IF NOT EXISTS motivo_distrato text;

-- 2. Atualizar expected_pending_cells para respeitar data_fim_contrato
CREATE OR REPLACE FUNCTION public.expected_pending_cells(
  p_unidade text DEFAULT NULL::text,
  p_tributacao text DEFAULT NULL::text,
  p_demand_types text[] DEFAULT ARRAY['lancamentos'::text, 'conciliacao_bancaria'::text, 'conciliacao_contabil'::text, 'fechamento'::text]
)
 RETURNS TABLE(client_id uuid, client_name text, unidade text, tributacao text, year integer, month integer, demand_type text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        LEAST(
          date_trunc('month', current_date - interval '1 month')::date,
          COALESCE(date_trunc('month', c.data_fim_contrato)::date,
                   date_trunc('month', current_date - interval '1 month')::date)
        )::timestamp,
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
$function$;

-- 3. Adicionar editar_fim_contrato em action_permissions (só coordenação por padrão)
UPDATE public.settings
   SET value = jsonb_set(value, '{editar_fim_contrato}', '["coordenacao"]'::jsonb, true)
 WHERE key = 'action_permissions'
   AND NOT (value ? 'editar_fim_contrato');

INSERT INTO public.settings (key, value)
SELECT 'action_permissions', jsonb_build_object('editar_fim_contrato', '["coordenacao"]'::jsonb)
WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'action_permissions');

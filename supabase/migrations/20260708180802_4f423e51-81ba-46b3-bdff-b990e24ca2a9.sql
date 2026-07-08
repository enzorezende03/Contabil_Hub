
-- Recompute the status of a single demand based on demand_status_entries cells
CREATE OR REPLACE FUNCTION public.recompute_demand_status(p_demand_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client text;
  v_comps text[];
  v_types text[];
  v_current text;
  v_monthly_types text[] := ARRAY['lancamentos','conciliacao_bancaria','conciliacao_contabil'];
  v_closing_types text[] := ARRAY['fechamento','revisao'];
  v_monthly text[];
  v_closing text[];
  v_all_statuses text[] := ARRAY[]::text[];
  v_comp text;
  v_t text;
  v_key_status text;
  v_mm text;
  v_yyyy text;
  v_years text[] := ARRAY[]::text[];
  v_y text;
  v_derived text;
BEGIN
  SELECT client, competencias, types, status
    INTO v_client, v_comps, v_types, v_current
    FROM public.demands WHERE id = p_demand_id;

  IF v_client IS NULL THEN RETURN; END IF;

  -- Split types
  SELECT COALESCE(array_agg(t), ARRAY[]::text[]) INTO v_monthly
    FROM unnest(v_types) AS t WHERE t = ANY(v_monthly_types);
  SELECT COALESCE(array_agg(t), ARRAY[]::text[]) INTO v_closing
    FROM unnest(v_types) AS t WHERE t = ANY(v_closing_types);

  IF (array_length(v_monthly,1) IS NULL AND array_length(v_closing,1) IS NULL)
     OR array_length(v_comps,1) IS NULL THEN
    RETURN;
  END IF;

  -- Monthly cells: for each competencia MM/YYYY and each monthly type
  IF array_length(v_monthly,1) IS NOT NULL THEN
    FOREACH v_comp IN ARRAY v_comps LOOP
      v_mm := split_part(v_comp, '/', 1);
      v_yyyy := split_part(v_comp, '/', 2);
      FOREACH v_t IN ARRAY v_monthly LOOP
        SELECT status INTO v_key_status
          FROM public.demand_status_entries
         WHERE client_name = v_client
           AND month = v_mm
           AND year = v_yyyy
           AND demand_type = v_t
         LIMIT 1;
        v_all_statuses := array_append(v_all_statuses, COALESCE(v_key_status, 'not_started'));
      END LOOP;
    END LOOP;
  END IF;

  -- Closing cells: one per distinct year, month = 'closing'
  IF array_length(v_closing,1) IS NOT NULL THEN
    FOREACH v_comp IN ARRAY v_comps LOOP
      v_yyyy := split_part(v_comp, '/', 2);
      IF v_yyyy = '' OR v_yyyy = ANY(v_years) THEN CONTINUE; END IF;
      v_years := array_append(v_years, v_yyyy);
      FOREACH v_t IN ARRAY v_closing LOOP
        SELECT status INTO v_key_status
          FROM public.demand_status_entries
         WHERE client_name = v_client
           AND month = 'closing'
           AND year = v_yyyy
           AND demand_type = v_t
         LIMIT 1;
        v_all_statuses := array_append(v_all_statuses, COALESCE(v_key_status, 'not_started'));
      END LOOP;
    END LOOP;
  END IF;

  IF array_length(v_all_statuses,1) IS NULL THEN RETURN; END IF;

  -- Derivation (match UI): completed > waiting_info > blocked > in_progress > not_started
  IF NOT EXISTS (SELECT 1 FROM unnest(v_all_statuses) s WHERE s <> 'completed') THEN
    v_derived := 'completed';
  ELSIF EXISTS (SELECT 1 FROM unnest(v_all_statuses) s WHERE s = 'waiting_info') THEN
    v_derived := 'waiting_info';
  ELSIF EXISTS (SELECT 1 FROM unnest(v_all_statuses) s WHERE s = 'blocked') THEN
    v_derived := 'blocked';
  ELSIF EXISTS (SELECT 1 FROM unnest(v_all_statuses) s WHERE s <> 'not_started') THEN
    v_derived := 'in_progress';
  ELSE
    v_derived := 'not_started';
  END IF;

  IF v_derived IS DISTINCT FROM v_current THEN
    UPDATE public.demands SET status = v_derived, updated_at = now() WHERE id = p_demand_id;
  END IF;
END;
$$;

-- Trigger function: on any change in demand_status_entries, recompute related demands
CREATE OR REPLACE FUNCTION public.sync_demands_from_status_entries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client text;
  v_month text;
  v_year text;
  v_type text;
  v_comp_key text;
  v_demand_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_client := OLD.client_name; v_month := OLD.month; v_year := OLD.year; v_type := OLD.demand_type;
  ELSE
    v_client := NEW.client_name; v_month := NEW.month; v_year := NEW.year; v_type := NEW.demand_type;
  END IF;

  IF v_month = 'closing' THEN
    -- Match any demand with this client & type, containing any competencia in that year
    FOR v_demand_id IN
      SELECT id FROM public.demands
       WHERE client = v_client
         AND v_type = ANY(types)
         AND EXISTS (
           SELECT 1 FROM unnest(competencias) c
            WHERE split_part(c, '/', 2) = v_year
         )
    LOOP
      PERFORM public.recompute_demand_status(v_demand_id);
    END LOOP;
  ELSE
    v_comp_key := v_month || '/' || v_year;
    FOR v_demand_id IN
      SELECT id FROM public.demands
       WHERE client = v_client
         AND v_type = ANY(types)
         AND v_comp_key = ANY(competencias)
    LOOP
      PERFORM public.recompute_demand_status(v_demand_id);
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_demands_from_status_entries ON public.demand_status_entries;
CREATE TRIGGER trg_sync_demands_from_status_entries
AFTER INSERT OR UPDATE OR DELETE ON public.demand_status_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_demands_from_status_entries();

-- Backfill: recompute status for every existing demand once
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.demands LOOP
    PERFORM public.recompute_demand_status(r.id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.auto_complete_lancamentos_from_conciliacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND NEW.demand_type IN ('conciliacao_bancaria', 'conciliacao_contabil')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN

    INSERT INTO public.demand_status_entries (client_name, month, year, demand_type, status, filled_by)
    VALUES (NEW.client_name, NEW.month, NEW.year, 'lancamentos', 'completed', NEW.filled_by)
    ON CONFLICT (client_name, month, year, demand_type)
    DO UPDATE SET status = 'completed', updated_at = now()
    WHERE public.demand_status_entries.status <> 'completed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_complete_lancamentos ON public.demand_status_entries;
CREATE TRIGGER trg_auto_complete_lancamentos
AFTER INSERT OR UPDATE OF status ON public.demand_status_entries
FOR EACH ROW
EXECUTE FUNCTION public.auto_complete_lancamentos_from_conciliacao();
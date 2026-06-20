CREATE OR REPLACE FUNCTION public.auto_complete_lancamentos_from_conciliacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Conc. Bancária concluída -> Lançamentos concluído (já existia)
  -- Conc. Contábil concluída  -> Lançamentos + Conc. Bancária concluídos (novo)
  IF NEW.status = 'completed'
     AND NEW.demand_type IN ('conciliacao_bancaria', 'conciliacao_contabil')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN

    -- Sempre auto-conclui Lançamentos
    INSERT INTO public.demand_status_entries (client_name, month, year, demand_type, status, filled_by)
    VALUES (NEW.client_name, NEW.month, NEW.year, 'lancamentos', 'completed', NEW.filled_by)
    ON CONFLICT (client_name, month, year, demand_type)
    DO UPDATE SET status = 'completed', updated_at = now()
    WHERE public.demand_status_entries.status <> 'completed';

    -- Se foi Conc. Contábil, também auto-conclui Conc. Bancária
    IF NEW.demand_type = 'conciliacao_contabil' THEN
      INSERT INTO public.demand_status_entries (client_name, month, year, demand_type, status, filled_by)
      VALUES (NEW.client_name, NEW.month, NEW.year, 'conciliacao_bancaria', 'completed', NEW.filled_by)
      ON CONFLICT (client_name, month, year, demand_type)
      DO UPDATE SET status = 'completed', updated_at = now()
      WHERE public.demand_status_entries.status <> 'completed';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
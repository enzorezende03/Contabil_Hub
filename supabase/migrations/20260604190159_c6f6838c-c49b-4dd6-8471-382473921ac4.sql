
ALTER TABLE public.plannings
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_parent_id uuid REFERENCES public.plannings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurrence_child_id uuid REFERENCES public.plannings(id) ON DELETE SET NULL;

ALTER TABLE public.plannings
  DROP CONSTRAINT IF EXISTS plannings_recurrence_check;
ALTER TABLE public.plannings
  ADD CONSTRAINT plannings_recurrence_check
  CHECK (recurrence IN ('none','monthly','bimonthly','quarterly','semiannual'));

CREATE OR REPLACE FUNCTION public.handle_planning_recurrence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_months int;
  v_new_id uuid;
  v_new_comps text[];
  v_comp text;
  v_mm int;
  v_yyyy int;
  v_date date;
  v_shifted date;
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF OLD.status = 'completed' THEN RETURN NEW; END IF;
  IF NEW.recurrence IS NULL OR NEW.recurrence = 'none' THEN RETURN NEW; END IF;
  IF NEW.recurrence_child_id IS NOT NULL THEN RETURN NEW; END IF;

  v_months := CASE NEW.recurrence
    WHEN 'monthly' THEN 1
    WHEN 'bimonthly' THEN 2
    WHEN 'quarterly' THEN 3
    WHEN 'semiannual' THEN 6
    ELSE 0
  END;
  IF v_months = 0 THEN RETURN NEW; END IF;

  -- shift each competência "MM/YYYY"
  v_new_comps := ARRAY[]::text[];
  FOREACH v_comp IN ARRAY NEW.competencias LOOP
    v_mm := split_part(v_comp, '/', 1)::int;
    v_yyyy := split_part(v_comp, '/', 2)::int;
    v_date := make_date(v_yyyy, v_mm, 1) + (v_months || ' months')::interval;
    v_new_comps := array_append(v_new_comps, to_char(v_date, 'MM/YYYY'));
  END LOOP;

  v_shifted := (NEW.internal_deadline + (v_months || ' months')::interval)::date;

  INSERT INTO public.plannings (
    client, competencias, types, description, assignee, priority,
    internal_deadline, status, notes, created_by, recurrence, recurrence_parent_id
  ) VALUES (
    NEW.client, v_new_comps, NEW.types, NEW.description, NEW.assignee, NEW.priority,
    v_shifted, 'not_started', NEW.notes, NEW.created_by, NEW.recurrence, NEW.id
  ) RETURNING id INTO v_new_id;

  NEW.recurrence_child_id := v_new_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS planning_recurrence_generate ON public.plannings;
CREATE TRIGGER planning_recurrence_generate
BEFORE UPDATE ON public.plannings
FOR EACH ROW
EXECUTE FUNCTION public.handle_planning_recurrence();

CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow service role / internal privileged calls (no auth context)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.can_review IS DISTINCT FROM OLD.can_review THEN
    RAISE EXCEPTION 'Only admins can change role or can_review';
  END IF;
  RETURN NEW;
END;
$function$;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS f, p.proname, p.prorettype::regtype::text AS rt
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.f);
    IF r.rt = 'trigger' OR r.proname = 'recompute_demand_status' THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.f);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.f);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.f);
  END LOOP;
END $$;
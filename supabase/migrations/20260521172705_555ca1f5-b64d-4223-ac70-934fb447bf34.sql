ALTER TABLE public.demand_status_entries REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.demand_status_entries;
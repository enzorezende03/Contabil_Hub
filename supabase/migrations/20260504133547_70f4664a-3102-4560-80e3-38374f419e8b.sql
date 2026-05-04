ALTER TABLE public.pendencies
  ADD COLUMN IF NOT EXISTS last_client_submit_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_submit_count integer NOT NULL DEFAULT 0;
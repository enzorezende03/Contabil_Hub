
-- Remove overly broad storage policies on pendency-attachments
DROP POLICY IF EXISTS "Authenticated can read pendency attachment files" ON storage.objects;
DROP POLICY IF EXISTS "Pendency attachments: authenticated insert" ON storage.objects;

-- Explicit restrictive policies on integration_tokens to make intent clear (service_role bypasses RLS)
CREATE POLICY "integration_tokens: no select for app users"
  ON public.integration_tokens FOR SELECT
  TO anon, authenticated
  USING (false);

CREATE POLICY "integration_tokens: no insert for app users"
  ON public.integration_tokens FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "integration_tokens: no update for app users"
  ON public.integration_tokens FOR UPDATE
  TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "integration_tokens: no delete for app users"
  ON public.integration_tokens FOR DELETE
  TO anon, authenticated
  USING (false);

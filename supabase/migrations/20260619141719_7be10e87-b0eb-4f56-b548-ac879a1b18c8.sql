
-- gclick_credentials
CREATE TABLE public.gclick_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  usuario text NOT NULL DEFAULT '',
  sistema_id text NOT NULL DEFAULT '',
  tag_por_setor jsonb NOT NULL DEFAULT '{}'::jsonb,
  assunto_template text NOT NULL DEFAULT 'Pendência contábil — {{cliente}} — {{competencia}}',
  client_id_secret_name text NOT NULL,
  client_secret_secret_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gclick_credentials TO authenticated;
GRANT ALL ON public.gclick_credentials TO service_role;

ALTER TABLE public.gclick_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage gclick_credentials"
  ON public.gclick_credentials
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_coordenacao(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_coordenacao(auth.uid()));

CREATE TRIGGER update_gclick_credentials_updated_at
  BEFORE UPDATE ON public.gclick_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- integration_tokens (cache OAuth)
CREATE TABLE public.integration_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,
  unidade text NOT NULL,
  access_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service, unidade)
);

GRANT ALL ON public.integration_tokens TO service_role;

ALTER TABLE public.integration_tokens ENABLE ROW LEVEL SECURITY;

-- (sem policies para roles autenticadas: apenas service_role acessa)

CREATE TRIGGER update_integration_tokens_updated_at
  BEFORE UPDATE ON public.integration_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: duas unidades padrão
INSERT INTO public.gclick_credentials (unidade, enabled, client_id_secret_name, client_secret_secret_name)
VALUES
  ('2m_contabilidade', false, 'GCLICK_CONTABILIDADE_CLIENT_ID', 'GCLICK_CONTABILIDADE_CLIENT_SECRET'),
  ('2m_saude', false, 'GCLICK_SAUDE_CLIENT_ID', 'GCLICK_SAUDE_CLIENT_SECRET')
ON CONFLICT (unidade) DO NOTHING;


INSERT INTO public.settings (key, value) VALUES (
  'role_permissions',
  '{
    "coordenacao": ["/", "/demandas", "/planejamento", "/equipe", "/competencias", "/alertas", "/clientes", "/configuracoes", "/usuarios"],
    "analista": ["/", "/demandas", "/planejamento", "/equipe", "/competencias", "/alertas", "/clientes"],
    "assistente": ["/", "/demandas", "/planejamento", "/competencias", "/clientes"],
    "estagiario": ["/", "/demandas", "/planejamento", "/competencias", "/clientes"]
  }'::jsonb
);

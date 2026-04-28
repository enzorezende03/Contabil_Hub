UPDATE public.settings
SET value = jsonb_build_object(
  'coordenacao', to_jsonb(ARRAY['/', '/demandas', '/planejamento', '/equipe', '/competencias', '/revisao', '/alertas', '/clientes', '/configuracoes', '/usuarios']),
  'analista',    to_jsonb(ARRAY['/', '/demandas', '/planejamento', '/equipe', '/competencias', '/revisao', '/alertas', '/clientes']),
  'assistente',  to_jsonb(ARRAY['/', '/demandas', '/planejamento', '/competencias', '/revisao', '/clientes']),
  'estagiario',  to_jsonb(ARRAY['/', '/demandas', '/planejamento', '/competencias', '/revisao', '/clientes'])
)
WHERE key = 'role_permissions';
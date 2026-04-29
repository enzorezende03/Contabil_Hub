UPDATE public.settings
SET value = jsonb_build_object(
  'coordenacao', to_jsonb(ARRAY['/','/demandas','/planejamento','/equipe','/competencias','/revisao','/pendencias','/alertas','/clientes','/configuracoes','/usuarios']),
  'analista',    to_jsonb(ARRAY['/','/demandas','/planejamento','/equipe','/competencias','/revisao','/pendencias','/alertas','/clientes']),
  'assistente',  to_jsonb(ARRAY['/','/demandas','/planejamento','/competencias','/revisao','/pendencias','/clientes']),
  'estagiario',  to_jsonb(ARRAY['/','/demandas','/planejamento','/competencias','/revisao','/pendencias','/clientes'])
),
updated_at = now()
WHERE key = 'role_permissions';
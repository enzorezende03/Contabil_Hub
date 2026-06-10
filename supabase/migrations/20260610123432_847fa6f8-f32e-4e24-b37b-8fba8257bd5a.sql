UPDATE public.settings
SET value = jsonb_set(
  jsonb_set(
    value::jsonb,
    '{coordenacao}',
    (COALESCE(value->'coordenacao','[]'::jsonb)) || '["/controle-gerencial"]'::jsonb
  ),
  '{analista}',
  (COALESCE(value->'analista','[]'::jsonb)) || '["/controle-gerencial"]'::jsonb
)
WHERE key = 'role_permissions'
  AND NOT (value::jsonb -> 'coordenacao' ? '/controle-gerencial');
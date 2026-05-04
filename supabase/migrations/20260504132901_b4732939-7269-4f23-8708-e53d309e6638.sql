ALTER TABLE public.pendencies DROP CONSTRAINT IF EXISTS pendencies_tipo_fields_check;
ALTER TABLE public.pendencies ADD CONSTRAINT pendencies_tipo_fields_check
  CHECK (
    (tipo = 'interna' AND setor_responsavel IS NOT NULL)
    OR (tipo = 'externa')
  );
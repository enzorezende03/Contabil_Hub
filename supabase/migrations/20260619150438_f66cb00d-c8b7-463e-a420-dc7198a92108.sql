ALTER TABLE public.pendencies DROP CONSTRAINT IF EXISTS pendencies_gclick_status_check;
ALTER TABLE public.pendencies ADD CONSTRAINT pendencies_gclick_status_check
  CHECK (gclick_status IS NULL OR gclick_status IN ('pendente_sync','sincronizada','falhou','concluida_no_gclick','nao_configurado','criada','erro','erro_auth','cliente_nao_encontrado','nao_aplicavel'));

UPDATE public.pendencies p
SET gclick_status = 'nao_aplicavel',
    gclick_sync_error = NULL,
    gclick_synced_at = now()
FROM public.clients c
WHERE c.id = p.client_id
  AND c.unidade = '2m_saude'
  AND p.tipo = 'interna';
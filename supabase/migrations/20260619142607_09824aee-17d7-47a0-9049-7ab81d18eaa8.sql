UPDATE public.gclick_credentials
SET client_id_secret_name = 'GCLICK_CONTAB_CLIENT_ID',
    client_secret_secret_name = 'GCLICK_CONTAB_CLIENT_SECRET'
WHERE unidade = '2m_contabilidade';

UPDATE public.gclick_credentials
SET client_id_secret_name = 'GCLICK_SAUDE_CLIENT_ID',
    client_secret_secret_name = 'GCLICK_SAUDE_CLIENT_SECRET'
WHERE unidade = '2m_saude';
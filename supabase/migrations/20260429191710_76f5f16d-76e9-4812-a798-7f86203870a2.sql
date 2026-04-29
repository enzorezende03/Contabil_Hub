UPDATE public.settings
   SET value = '{"simples_nacional": ["balancete"], "lucro_presumido": ["balancete"], "lucro_real": ["balancete"]}'::jsonb,
       updated_at = now()
 WHERE key = 'required_deliverables_by_tributacao';

INSERT INTO public.settings (key, value)
SELECT 'required_deliverables_by_tributacao',
       '{"simples_nacional": ["balancete"], "lucro_presumido": ["balancete"], "lucro_real": ["balancete"]}'::jsonb
 WHERE NOT EXISTS (
   SELECT 1 FROM public.settings WHERE key = 'required_deliverables_by_tributacao'
 );
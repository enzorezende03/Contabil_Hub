
CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view settings"
  ON public.settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can update settings"
  ON public.settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert settings"
  ON public.settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.settings (key, value) VALUES (
  'demand_weights',
  '[
    {"type":"lancamentos","label":"Lançamentos","weight":1},
    {"type":"conciliacao_bancaria","label":"Conciliação Bancária","weight":2},
    {"type":"conciliacao_contabil","label":"Conciliação Contábil","weight":2},
    {"type":"fechamento","label":"Fechamento","weight":3},
    {"type":"revisao","label":"Revisão","weight":3},
    {"type":"ajustes","label":"Ajustes","weight":2},
    {"type":"regularizacoes","label":"Regularizações","weight":5},
    {"type":"escritas_antigas","label":"Escritas Antigas","weight":5},
    {"type":"ecd","label":"ECD","weight":4},
    {"type":"demonstrativos","label":"Demonstrativos","weight":2},
    {"type":"atendimento","label":"Atendimento","weight":1},
    {"type":"outras","label":"Outras","weight":1}
  ]'::jsonb
);

INSERT INTO public.settings (key, value) VALUES (
  'team_members',
  '[
    {"id":"1","name":"Ana Silva","role":"coordenacao"},
    {"id":"2","name":"Carlos Oliveira","role":"analista"},
    {"id":"3","name":"Mariana Costa","role":"analista"},
    {"id":"4","name":"Rafael Santos","role":"assistente"},
    {"id":"5","name":"Juliana Lima","role":"assistente"},
    {"id":"6","name":"Pedro Almeida","role":"estagiario"},
    {"id":"7","name":"Beatriz Rocha","role":"estagiario"}
  ]'::jsonb
);

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

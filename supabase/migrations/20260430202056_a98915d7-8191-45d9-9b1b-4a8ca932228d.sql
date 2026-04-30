
-- Itens da checklist da pendência
CREATE TABLE public.pendency_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pendency_id UUID NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | entregue | recusado
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pendency_items_pendency ON public.pendency_items(pendency_id);
ALTER TABLE public.pendency_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Items: viewable by authenticated"
  ON public.pendency_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Items: insert by pendency manager"
  ON public.pendency_items FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_action_permission(auth.uid(), 'gerenciar_pendencias')
      OR has_action_permission(auth.uid(), 'supervisionar_pendencias')
    )
  );

CREATE POLICY "Items: update by manager or assignee"
  ON public.pendency_items FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_action_permission(auth.uid(), 'gerenciar_pendencias')
    OR has_action_permission(auth.uid(), 'supervisionar_pendencias')
    OR EXISTS (
      SELECT 1 FROM public.pendencies p
      WHERE p.id = pendency_items.pendency_id
        AND (p.responsavel_id = auth.uid() OR p.created_by = auth.uid())
    )
  );

CREATE POLICY "Items: delete by admin or creator"
  ON public.pendency_items FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pendency_items_updated_at
  BEFORE UPDATE ON public.pendency_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Respostas do cliente por item (texto / anexo)
CREATE TABLE public.pendency_item_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL,
  pendency_id UUID NOT NULL,
  tipo TEXT NOT NULL, -- 'texto' | 'arquivo'
  texto TEXT,
  arquivo_path TEXT,
  arquivo_nome TEXT,
  arquivo_tamanho INTEGER,
  -- Quando enviado pelo cliente via portal, sender_user_id é NULL
  sender_user_id UUID,
  sender_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pendency_item_responses_item ON public.pendency_item_responses(item_id);
CREATE INDEX idx_pendency_item_responses_pendency ON public.pendency_item_responses(pendency_id);
ALTER TABLE public.pendency_item_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Responses: viewable by authenticated"
  ON public.pendency_item_responses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Responses: team can insert"
  ON public.pendency_item_responses FOR INSERT TO authenticated
  WITH CHECK (sender_user_id = auth.uid());

CREATE POLICY "Responses: delete by sender or admin"
  ON public.pendency_item_responses FOR DELETE TO authenticated
  USING (sender_user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Comentários por item (chat)
CREATE TABLE public.pendency_item_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL,
  pendency_id UUID NOT NULL,
  texto TEXT NOT NULL,
  sender_user_id UUID, -- NULL = cliente via portal
  sender_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pendency_item_comments_item ON public.pendency_item_comments(item_id);
ALTER TABLE public.pendency_item_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments: viewable by authenticated"
  ON public.pendency_item_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Comments: team can insert"
  ON public.pendency_item_comments FOR INSERT TO authenticated
  WITH CHECK (sender_user_id = auth.uid());

CREATE POLICY "Comments: delete by sender or admin"
  ON public.pendency_item_comments FOR DELETE TO authenticated
  USING (sender_user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Token de acesso público + senha (hash) para o portal do cliente
CREATE TABLE public.pendency_access_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pendency_id UUID NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  access_code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pendency_tokens_token ON public.pendency_access_tokens(token);
ALTER TABLE public.pendency_access_tokens ENABLE ROW LEVEL SECURITY;

-- Senha em hash não pode ser lida por ninguém via cliente; só pelo serviço
CREATE POLICY "Tokens: team can view (no hash via app)"
  ON public.pendency_access_tokens FOR SELECT TO authenticated USING (true);

CREATE POLICY "Tokens: team can insert"
  ON public.pendency_access_tokens FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_action_permission(auth.uid(), 'gerenciar_pendencias')
      OR has_action_permission(auth.uid(), 'supervisionar_pendencias')
    )
  );

CREATE POLICY "Tokens: team can update (revoke)"
  ON public.pendency_access_tokens FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_action_permission(auth.uid(), 'gerenciar_pendencias')
    OR has_action_permission(auth.uid(), 'supervisionar_pendencias')
  );

CREATE TRIGGER update_pendency_tokens_updated_at
  BEFORE UPDATE ON public.pendency_access_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket privado para anexos enviados pelo cliente
INSERT INTO storage.buckets (id, name, public)
VALUES ('pendency-attachments', 'pendency-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Equipe autenticada pode ver/baixar anexos
CREATE POLICY "Pendency attachments: authenticated read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pendency-attachments');

CREATE POLICY "Pendency attachments: authenticated insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pendency-attachments');

CREATE POLICY "Pendency attachments: authenticated delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pendency-attachments');

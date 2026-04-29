-- =========================================================================
-- 1) APAGAR submissões órfãs (sem reviewer_id) e dependências
-- =========================================================================
DELETE FROM public.review_apontamentos
 WHERE submission_id IN (
   SELECT id FROM public.review_submissions WHERE reviewer_id IS NULL
 );

-- Os deliverables vinculados às submissões órfãs ficam soltos (review_submission_id volta a NULL),
-- mas mantemos o histórico contábil. Apenas desvinculamos.
UPDATE public.closing_deliverables
   SET review_submission_id = NULL
 WHERE review_submission_id IN (
   SELECT id FROM public.review_submissions WHERE reviewer_id IS NULL
 );

DELETE FROM public.review_submissions WHERE reviewer_id IS NULL;

-- =========================================================================
-- 2) PROFILES.can_review
-- =========================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_review boolean NOT NULL DEFAULT false;

-- Backfill para as analistas escolhidas no piloto
UPDATE public.profiles
   SET can_review = true
 WHERE display_name IN ('Ana Cláudia', 'Gabriela Campos');

-- =========================================================================
-- 3) REVIEW_SUBMISSIONS: reviewer_id NOT NULL + novos campos
-- =========================================================================
ALTER TABLE public.review_submissions
  ALTER COLUMN reviewer_id SET NOT NULL,
  ADD COLUMN IF NOT EXISTS reviewer_assigned_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reviewer_reassigned_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_review_submissions_reviewer_status
  ON public.review_submissions (reviewer_id, status);
CREATE INDEX IF NOT EXISTS idx_review_submissions_submitter_status
  ON public.review_submissions (submitted_by, status);

-- =========================================================================
-- 4) settings.action_permissions ← supervisionar_revisao (default coordenacao)
-- =========================================================================
INSERT INTO public.settings (key, value)
VALUES ('action_permissions', jsonb_build_object('supervisionar_revisao', to_jsonb(ARRAY['coordenacao'])))
ON CONFLICT (key) DO UPDATE
   SET value = public.settings.value || jsonb_build_object(
     'supervisionar_revisao',
     COALESCE(public.settings.value->'supervisionar_revisao', to_jsonb(ARRAY['coordenacao']))
   );

-- =========================================================================
-- 5) Funções auxiliares (SECURITY DEFINER para evitar recursão RLS)
-- =========================================================================

-- Lê settings.action_permissions e checa se o cargo do usuário está na lista da action.
CREATE OR REPLACE FUNCTION public.has_action_permission(_user_id uuid, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.settings s
      JOIN public.profiles p ON p.user_id = _user_id
     WHERE s.key = 'action_permissions'
       AND s.value ? _action
       AND (s.value -> _action) ? p.role
  );
$$;

-- Determina se o usuário corrente pode visualizar uma submissão específica.
CREATE OR REPLACE FUNCTION public.can_view_submission(p_submission_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.review_submissions s
     WHERE s.id = p_submission_id
       AND (
            s.submitted_by = auth.uid()
         OR s.reviewer_id  = auth.uid()
         OR public.has_role(auth.uid(), 'admin'::app_role)
         OR public.has_action_permission(auth.uid(), 'supervisionar_revisao')
       )
  );
$$;

-- =========================================================================
-- 6) RLS — review_submissions
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated can view submissions"   ON public.review_submissions;
DROP POLICY IF EXISTS "Authenticated can insert submissions" ON public.review_submissions;
DROP POLICY IF EXISTS "Authenticated can update submissions" ON public.review_submissions;
DROP POLICY IF EXISTS "Submitter or admin can delete submissions" ON public.review_submissions;

CREATE POLICY "Submissions: own or assigned or supervisor"
  ON public.review_submissions
  FOR SELECT TO authenticated
  USING (
       submitted_by = auth.uid()
    OR reviewer_id  = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_action_permission(auth.uid(), 'supervisionar_revisao')
  );

CREATE POLICY "Submissions: insert as self"
  ON public.review_submissions
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "Submissions: update reviewer/submitter/supervisor"
  ON public.review_submissions
  FOR UPDATE TO authenticated
  USING (
       reviewer_id  = auth.uid()
    OR submitted_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_action_permission(auth.uid(), 'supervisionar_revisao')
  );

CREATE POLICY "Submissions: delete by submitter/admin"
  ON public.review_submissions
  FOR DELETE TO authenticated
  USING (
       submitted_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- =========================================================================
-- 7) RLS — closing_deliverables
-- Vê se: (a) não tem submissão associada (histórico antigo) — todos autenticados podem ver,
--        OU (b) pode ver a submissão associada via can_view_submission.
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated can view deliverables" ON public.closing_deliverables;

CREATE POLICY "Deliverables: scoped by submission"
  ON public.closing_deliverables
  FOR SELECT TO authenticated
  USING (
       review_submission_id IS NULL
    OR public.can_view_submission(review_submission_id)
  );

-- =========================================================================
-- 8) RLS — review_apontamentos
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated can view apontamentos"  ON public.review_apontamentos;
DROP POLICY IF EXISTS "Authenticated can insert apontamentos" ON public.review_apontamentos;

CREATE POLICY "Apontamentos: scoped by submission"
  ON public.review_apontamentos
  FOR SELECT TO authenticated
  USING (public.can_view_submission(submission_id));

-- Apenas a revisora designada da submissão pode inserir apontamentos.
CREATE POLICY "Apontamentos: only reviewer can insert"
  ON public.review_apontamentos
  FOR INSERT TO authenticated
  WITH CHECK (
        created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.review_submissions s
       WHERE s.id = submission_id
         AND s.reviewer_id = auth.uid()
    )
  );
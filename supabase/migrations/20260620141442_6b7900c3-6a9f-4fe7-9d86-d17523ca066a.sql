
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS apelido text,
  ADD COLUMN IF NOT EXISTS cadencia_fechamento text NOT NULL DEFAULT 'mensal';

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_cadencia_fechamento_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_cadencia_fechamento_check
  CHECK (cadencia_fechamento IN ('mensal','trimestral','semestral','anual','livre'));

-- Backfill apelido: primeira palavra significativa da razão social, em sentence case.
-- Ignora preposições/artigos comuns curtos e tipos societários se aparecerem como primeira palavra.
UPDATE public.clients c
SET apelido = sub.apelido
FROM (
  SELECT
    id,
    -- pega a primeira "palavra" alfanumérica significativa (>2 chars) antes de separadores
    initcap(
      lower(
        COALESCE(
          (regexp_match(
            regexp_replace(razao_social, '[^[:alnum:][:space:]\-]', ' ', 'g'),
            '([[:alnum:]]{3,})'
          ))[1],
          split_part(razao_social, ' ', 1)
        )
      )
    ) AS apelido
  FROM public.clients
  WHERE razao_social IS NOT NULL
) sub
WHERE c.id = sub.id
  AND (c.apelido IS NULL OR c.apelido = '');

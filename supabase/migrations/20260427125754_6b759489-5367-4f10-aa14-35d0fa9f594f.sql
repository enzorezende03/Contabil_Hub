-- Normaliza competencia_inicio para o formato MM/YYYY
-- Aceita entradas atualmente em YYYY-MM-DD, YYYY/MM/DD, YYYY-MM, YYYY/MM
UPDATE public.clients
SET competencia_inicio =
  LPAD(SPLIT_PART(REPLACE(competencia_inicio, '/', '-'), '-', 2), 2, '0')
  || '/' ||
  SPLIT_PART(REPLACE(competencia_inicio, '/', '-'), '-', 1)
WHERE competencia_inicio ~ '^\d{4}[-/]\d{1,2}([-/]\d{1,2})?$';

-- Garante zero-padding em entradas já em M/YYYY (ex: "1/2024" -> "01/2024")
UPDATE public.clients
SET competencia_inicio =
  LPAD(SPLIT_PART(competencia_inicio, '/', 1), 2, '0')
  || '/' ||
  SPLIT_PART(competencia_inicio, '/', 2)
WHERE competencia_inicio ~ '^\d{1}/\d{4}$';
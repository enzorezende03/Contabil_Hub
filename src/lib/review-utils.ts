// Utilities for the Revisão de Demonstrativos module.

export type TipoDemonstrativo =
  | "dre"
  | "balancete"
  | "balanco"
  | "razao"
  | "dlpa"
  | "ecd"
  | "defis"
  | "outros";

export const TIPO_DEMONSTRATIVO_LABEL: Record<TipoDemonstrativo, string> = {
  dre: "DRE",
  balancete: "Balancete",
  balanco: "Balanço",
  razao: "Razão",
  dlpa: "DLPA",
  ecd: "ECD",
  defis: "DEFIS",
  outros: "Outros",
};

export const TIPO_DEMONSTRATIVO_OPTIONS: { value: TipoDemonstrativo; label: string }[] = [
  { value: "dre", label: "DRE" },
  { value: "balancete", label: "Balancete" },
  { value: "balanco", label: "Balanço Patrimonial" },
  { value: "razao", label: "Razão" },
  { value: "dlpa", label: "DLPA" },
  { value: "ecd", label: "ECD" },
  { value: "defis", label: "DEFIS" },
  { value: "outros", label: "Outros" },
];

/** Default required deliverables by tributação (mirrors DB default).
 *  Regra atual: apenas o Balancete é obrigatório. Outros demonstrativos
 *  podem ser anexados opcionalmente pela equipe. */
export const DEFAULT_REQUIRED_BY_TRIBUTACAO: Record<string, TipoDemonstrativo[]> = {
  simples_nacional: ["balancete"],
  lucro_presumido: ["balancete"],
  lucro_real: ["balancete"],
  isenta_imune: ["balancete"],
};

export type ReviewStatus =
  | "aguardando"
  | "em_revisao"
  | "aprovado"
  | "devolvido"
  | "cancelado";

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  aguardando: "Aguardando revisão",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
};

export const REVIEW_STATUS_BADGE: Record<ReviewStatus, string> = {
  aguardando: "bg-warning/15 text-warning",
  em_revisao: "bg-info/15 text-info",
  aprovado: "bg-success/15 text-success",
  devolvido: "bg-destructive/15 text-destructive",
  cancelado: "bg-muted text-muted-foreground",
};

/** Convert a "YYYY-MM-DD" date (from PostgreSQL DATE) into "MM/YYYY" label. */
export function competenciaLabel(date: string): string {
  // date is "YYYY-MM-DD"
  const [y, m] = date.split("-");
  return `${m}/${y}`;
}

/** Build a competencia date string ("YYYY-MM-01") from a year + month (MM). */
export function buildCompetenciaDate(year: string, monthMM: string): string {
  return `${year}-${monthMM}-01`;
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} sem`;
  const mo = Math.floor(d / 30);
  return `${mo} mês${mo > 1 ? "es" : ""}`;
}

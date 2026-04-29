export type PendencyTipo = "interna" | "externa";
export type PendencyStatus = "aberta" | "aguardando_resposta" | "em_andamento" | "resolvida" | "cancelada";
export type PendencyPrioridade = "baixa" | "media" | "alta" | "urgente";
export type PendencySetor = "fiscal" | "departamento_pessoal" | "societario" | "tributario" | "outros";
export type PendencyCanal = "email" | "whatsapp" | "telefone" | "teams" | "sistema" | "outros";

export const SETOR_LABELS: Record<PendencySetor, string> = {
  fiscal: "Fiscal",
  departamento_pessoal: "Departamento Pessoal",
  societario: "Societário",
  tributario: "Tributário",
  outros: "Outros",
};

export const STATUS_LABELS: Record<PendencyStatus, string> = {
  aberta: "Aberta",
  aguardando_resposta: "Aguardando resposta",
  em_andamento: "Em andamento",
  resolvida: "Resolvida",
  cancelada: "Cancelada",
};

export const PRIORIDADE_LABELS: Record<PendencyPrioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const PRIORIDADE_COLORS: Record<PendencyPrioridade, string> = {
  baixa: "bg-slate-500/15 text-slate-600 border-slate-500/30",
  media: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  alta: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  urgente: "bg-red-500/15 text-red-600 border-red-500/30",
};

export const CANAL_LABELS: Record<PendencyCanal, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  telefone: "Telefone",
  teams: "Teams",
  sistema: "Sistema",
  outros: "Outros",
};

export interface Pendency {
  id: string;
  client_id: string;
  competencia: string; // YYYY-MM-DD
  demand_type: string | null;
  tipo: PendencyTipo;
  setor_responsavel: PendencySetor | null;
  documento_solicitado: string | null;
  contato_cliente_nome: string | null;
  contato_cliente_email: string | null;
  contato_cliente_telefone: string | null;
  descricao: string;
  status: PendencyStatus;
  prioridade: PendencyPrioridade;
  prazo_resposta: string | null;
  responsavel_id: string;
  ultimo_contato_em: string | null;
  total_contatos: number;
  followup_cadence_days: number;
  next_followup_at: string | null;
  followup_paused: boolean;
  followup_paused_reason: string | null;
  followup_paused_until: string | null;
  escalated_at: string | null;
  gclick_task_id: string | null;
  gclick_task_url: string | null;
  gclick_synced_at: string | null;
  gclick_sync_error: string | null;
  gclick_status: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PendencyCommunication {
  id: string;
  pendency_id: string;
  canal: PendencyCanal;
  descricao: string;
  realizado_por: string;
  realizado_em: string;
  resposta_recebida: boolean;
  resposta_descricao: string | null;
  created_at: string;
}

/** Returns true if the pendency is "active" (still needs attention). */
export function isPendencyActive(p: Pick<Pendency, "status">): boolean {
  return p.status !== "resolvida" && p.status !== "cancelada";
}

/** Returns true if past prazo_resposta. */
export function isPendencyVencida(p: Pick<Pendency, "status" | "prazo_resposta">): boolean {
  if (!isPendencyActive(p) || !p.prazo_resposta) return false;
  return new Date(p.prazo_resposta) < new Date(new Date().toDateString());
}

/** Days since opened. */
export function diasAberta(created_at: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(created_at).getTime()) / 86_400_000));
}

/** Days since last contact (or null if never). */
export function diasUltimoContato(ultimo: string | null): number | null {
  if (!ultimo) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(ultimo).getTime()) / 86_400_000));
}

/** Build the YYYY-MM-DD string for the first day of a competencia given month MM and year YYYY. */
export function competenciaFromMonthYear(month: string, year: string): string {
  return `${year}-${month.padStart(2, "0")}-01`;
}

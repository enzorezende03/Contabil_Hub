export type DemandStatus =
  | "not_started"
  | "in_progress"
  | "in_review"
  | "waiting_info"
  | "blocked"
  | "completed"
  | "late"
  | "reopened"
  | "attention";

export type DemandType =
  | "lancamentos"
  | "conciliacao_bancaria"
  | "conciliacao_contabil"
  | "fechamento"
  | "revisao"
  | "ajustes"
  | "regularizacoes"
  | "escritas_antigas"
  | "ecd"
  | "demonstrativos"
  | "atendimento"
  | "outras";

export type Complexity = "baixa" | "media" | "alta";
export type Priority = "baixa" | "media" | "alta" | "urgente";
export type TeamRole = "estagiario" | "assistente" | "analista" | "coordenacao";
export type Tributacao = "simples_nacional" | "lucro_presumido" | "lucro_real" | "mei";

export const TRIBUTACAO_LABELS: Record<Tributacao, string> = {
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
  mei: "MEI",
};

export interface TeamMember {
  id: string;
  name: string;
  role: TeamRole;
  avatar?: string;
}

export interface Demand {
  id: string;
  client: string;
  competencia: string; // MM/YYYY
  type: DemandType;
  description: string;
  assignee: string; // TeamMember id
  complexity: Complexity;
  weight: number;
  priority: Priority;
  internalDeadline: string;
  clientDeadline: string;
  status: DemandStatus;
  startDate?: string;
  completionDate?: string;
  timeSpentMinutes: number;
  notes: string;
  isLegacy: boolean; // escrita antiga
  createdAt: string;
}

export interface TaskWeight {
  type: DemandType;
  label: string;
  weight: number;
}

export const DEMAND_TYPE_LABELS: Record<DemandType, string> = {
  lancamentos: "Lançamentos Contábeis",
  conciliacao_bancaria: "Conciliação Bancária",
  conciliacao_contabil: "Conciliação Contábil",
  fechamento: "Fechamento Contábil",
  revisao: "Revisão",
  ajustes: "Ajustes",
  regularizacoes: "Regularizações",
  escritas_antigas: "Escritas Antigas",
  ecd: "Preparação de ECD",
  demonstrativos: "Envio de Demonstrativos",
  atendimento: "Atendimento",
  outras: "Outras Atividades",
};

export const STATUS_LABELS: Record<DemandStatus, string> = {
  not_started: "Não Iniciada",
  in_progress: "Em Andamento",
  in_review: "Em Revisão",
  waiting_info: "Aguardando Documentação",
  blocked: "Bloqueada",
  completed: "Concluída",
  late: "Em Atraso",
  reopened: "Reaberta",
  attention: "Requer Atenção",
};

export const STATUS_COLORS: Record<DemandStatus, string> = {
  not_started: "bg-status-not-started",
  in_progress: "bg-status-in-progress",
  in_review: "bg-status-in-review",
  waiting_info: "bg-status-waiting",
  blocked: "bg-status-blocked",
  completed: "bg-status-completed",
  late: "bg-status-late",
  reopened: "bg-status-reopened",
  attention: "bg-status-attention",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const ROLE_LABELS: Record<TeamRole, string> = {
  estagiario: "Estagiário",
  assistente: "Assistente",
  analista: "Analista",
  coordenacao: "Coordenação",
};

export const DEFAULT_WEIGHTS: TaskWeight[] = [
  { type: "lancamentos", label: "Lançamentos", weight: 1 },
  { type: "conciliacao_bancaria", label: "Conciliação Bancária", weight: 2 },
  { type: "conciliacao_contabil", label: "Conciliação Contábil", weight: 2 },
  { type: "fechamento", label: "Fechamento", weight: 3 },
  { type: "revisao", label: "Revisão", weight: 3 },
  { type: "ajustes", label: "Ajustes", weight: 2 },
  { type: "regularizacoes", label: "Regularizações", weight: 5 },
  { type: "escritas_antigas", label: "Escritas Antigas", weight: 5 },
  { type: "ecd", label: "ECD", weight: 4 },
  { type: "demonstrativos", label: "Demonstrativos", weight: 2 },
  { type: "atendimento", label: "Atendimento", weight: 1 },
  { type: "outras", label: "Outras", weight: 1 },
];

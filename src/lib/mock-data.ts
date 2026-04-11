import { Demand, TeamMember, Tributacao } from "./types";

export const CLIENT_TRIBUTACAO: Record<string, Tributacao> = {
  "Empresa Alpha LTDA": "lucro_presumido",
  "Tech Solutions SA": "lucro_real",
  "Comércio Central ME": "simples_nacional",
  "Grupo Delta": "lucro_real",
  "Indústria Norte LTDA": "lucro_presumido",
  "Farmácia Saúde ME": "simples_nacional",
  "Construtora Mega SA": "lucro_real",
  "Auto Peças Express": "simples_nacional",
  "Restaurante Sabor LTDA": "lucro_presumido",
  "Logística Rápida SA": "lucro_presumido",
  "Clínica Vida Saudável": "simples_nacional",
  "Escritório Design ME": "simples_nacional",
  "Padaria Artesanal": "simples_nacional",
};
export const TEAM_MEMBERS: TeamMember[] = [
  { id: "1", name: "Ana Silva", role: "coordenacao" },
  { id: "2", name: "Carlos Oliveira", role: "analista" },
  { id: "3", name: "Mariana Costa", role: "analista" },
  { id: "4", name: "Rafael Santos", role: "assistente" },
  { id: "5", name: "Juliana Lima", role: "assistente" },
  { id: "6", name: "Pedro Almeida", role: "estagiario" },
  { id: "7", name: "Beatriz Rocha", role: "estagiario" },
];

const today = new Date();
const fmt = (d: Date) => d.toISOString().split("T")[0];
const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return fmt(d);
};
const daysFromNow = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return fmt(d);
};

export const MOCK_DEMANDS: Demand[] = [
  {
    id: "d1", client: "Empresa Alpha LTDA", competencias: ["03/2026"], types: ["lancamentos"],
    description: "Lançamentos contábeis do mês", assignee: "6", complexity: "baixa", weight: 1,
    priority: "media", internalDeadline: daysFromNow(3), clientDeadline: daysFromNow(5),
    status: "in_progress", startDate: daysAgo(1), timeSpentMinutes: 120, notes: "", isLegacy: false, createdAt: daysAgo(2),
  },
  {
    id: "d2", client: "Tech Solutions SA", competencias: ["03/2026"], types: ["conciliacao_bancaria", "fechamento"],
    description: "Conciliação bancária e fechamento", assignee: "4", complexity: "media", weight: 2,
    priority: "alta", internalDeadline: daysFromNow(1), clientDeadline: daysFromNow(3),
    status: "in_progress", startDate: daysAgo(2), timeSpentMinutes: 240, notes: "Falta extrato Itaú", isLegacy: false, createdAt: daysAgo(3),
  },
  {
    id: "d3", client: "Comércio Central ME", competencias: ["03/2026"], types: ["fechamento"],
    description: "Fechamento contábil mensal", assignee: "2", complexity: "alta", weight: 3,
    priority: "urgente", internalDeadline: fmt(today), clientDeadline: daysFromNow(2),
    status: "attention", startDate: daysAgo(3), timeSpentMinutes: 360, notes: "Pendência de conciliação", isLegacy: false, createdAt: daysAgo(5),
  },
  {
    id: "d4", client: "Grupo Delta", competencias: ["02/2026"], types: ["revisao"],
    description: "Revisão do fechamento fevereiro", assignee: "3", complexity: "alta", weight: 3,
    priority: "alta", internalDeadline: daysAgo(2), clientDeadline: daysAgo(1),
    status: "late", startDate: daysAgo(5), timeSpentMinutes: 180, notes: "", isLegacy: false, createdAt: daysAgo(7),
  },
  {
    id: "d5", client: "Indústria Norte LTDA", competencias: ["01/2024", "02/2024", "03/2024"], types: ["escritas_antigas", "regularizacoes"],
    description: "Regularização escrita contábil 2024", assignee: "2", complexity: "alta", weight: 5,
    priority: "alta", internalDeadline: daysFromNow(15), clientDeadline: daysFromNow(30),
    status: "in_progress", startDate: daysAgo(10), timeSpentMinutes: 600, notes: "Documentação incompleta", isLegacy: true, createdAt: daysAgo(20),
  },
  {
    id: "d6", client: "Farmácia Saúde ME", competencias: ["03/2026"], types: ["lancamentos"],
    description: "Lançamentos de NFs", assignee: "7", complexity: "baixa", weight: 1,
    priority: "baixa", internalDeadline: daysFromNow(7), clientDeadline: daysFromNow(10),
    status: "not_started", timeSpentMinutes: 0, notes: "", isLegacy: false, createdAt: daysAgo(1),
  },
  {
    id: "d7", client: "Construtora Mega SA", competencias: ["03/2026"], types: ["conciliacao_contabil"],
    description: "Conciliação contábil completa", assignee: "3", complexity: "media", weight: 2,
    priority: "media", internalDeadline: daysFromNow(5), clientDeadline: daysFromNow(7),
    status: "waiting_info", startDate: daysAgo(3), timeSpentMinutes: 90, notes: "Aguardando balancete do cliente", isLegacy: false, createdAt: daysAgo(4),
  },
  {
    id: "d8", client: "Auto Peças Express", competencias: ["04/2023", "05/2023", "06/2023"], types: ["regularizacoes"],
    description: "Regularização escrituração 2023", assignee: "4", complexity: "alta", weight: 5,
    priority: "urgente", internalDeadline: daysFromNow(5), clientDeadline: daysFromNow(10),
    status: "blocked", startDate: daysAgo(7), timeSpentMinutes: 300, notes: "Documentos extraviados", isLegacy: true, createdAt: daysAgo(15),
  },
  {
    id: "d9", client: "Restaurante Sabor LTDA", competencias: ["03/2026"], types: ["ecd"],
    description: "Preparação ECD exercício 2025", assignee: "2", complexity: "alta", weight: 4,
    priority: "alta", internalDeadline: daysFromNow(20), clientDeadline: daysFromNow(30),
    status: "not_started", timeSpentMinutes: 0, notes: "", isLegacy: false, createdAt: daysAgo(1),
  },
  {
    id: "d10", client: "Logística Rápida SA", competencias: ["03/2026"], types: ["demonstrativos"],
    description: "Envio de demonstrativos mensais", assignee: "5", complexity: "baixa", weight: 2,
    priority: "media", internalDeadline: daysFromNow(4), clientDeadline: daysFromNow(5),
    status: "in_review", startDate: daysAgo(2), timeSpentMinutes: 60, notes: "", isLegacy: false, createdAt: daysAgo(3),
  },
  {
    id: "d11", client: "Empresa Alpha LTDA", competencias: ["02/2026"], types: ["ajustes"],
    description: "Ajustes lançamentos fevereiro", assignee: "5", complexity: "media", weight: 2,
    priority: "media", internalDeadline: daysFromNow(2), clientDeadline: daysFromNow(4),
    status: "completed", startDate: daysAgo(4), completionDate: daysAgo(1), timeSpentMinutes: 150, notes: "", isLegacy: false, createdAt: daysAgo(6),
  },
  {
    id: "d12", client: "Clínica Vida Saudável", competencias: ["03/2026"], types: ["lancamentos"],
    description: "Lançamentos contábeis março", assignee: "6", complexity: "baixa", weight: 1,
    priority: "baixa", internalDeadline: daysFromNow(6), clientDeadline: daysFromNow(8),
    status: "completed", startDate: daysAgo(3), completionDate: fmt(today), timeSpentMinutes: 90, notes: "", isLegacy: false, createdAt: daysAgo(4),
  },
  {
    id: "d13", client: "Escritório Design ME", competencias: ["10/2022", "11/2022", "12/2022"], types: ["escritas_antigas"],
    description: "Escrita contábil 2022 - regularização", assignee: "3", complexity: "alta", weight: 5,
    priority: "alta", internalDeadline: daysFromNow(25), clientDeadline: daysFromNow(45),
    status: "in_progress", startDate: daysAgo(15), timeSpentMinutes: 480, notes: "50% concluído", isLegacy: true, createdAt: daysAgo(30),
  },
  {
    id: "d14", client: "Padaria Artesanal", competencias: ["03/2026"], types: ["atendimento"],
    description: "Atendimento dúvidas tributárias", assignee: "1", complexity: "baixa", weight: 1,
    priority: "baixa", internalDeadline: daysFromNow(1), clientDeadline: daysFromNow(1),
    status: "completed", startDate: fmt(today), completionDate: fmt(today), timeSpentMinutes: 30, notes: "", isLegacy: false, createdAt: fmt(today),
  },
];

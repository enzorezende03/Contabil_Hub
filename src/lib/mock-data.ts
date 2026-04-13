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

export const MOCK_DEMANDS: Demand[] = [];

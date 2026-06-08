// Role-based page permissions
// Built-in profile roles + custom roles created by admins

export type ProfileRole = string;

export const BUILTIN_ROLES: { value: string; label: string }[] = [
  { value: "coordenacao", label: "Coordenação" },
  { value: "analista", label: "Analista" },
  { value: "assistente", label: "Assistente" },
  { value: "estagiario", label: "Estagiário" },
];

let CUSTOM_ROLES: { value: string; label: string }[] = [];

export function setCustomRoles(roles: { value: string; label: string }[]) {
  CUSTOM_ROLES = roles || [];
}

export function getCustomRoles() {
  return [...CUSTOM_ROLES];
}

export function getAllRoles() {
  return [...BUILTIN_ROLES, ...CUSTOM_ROLES];
}

export type AppPage =
  | "/"
  | "/demandas"
  | "/planejamento"
  | "/equipe"
  | "/ausencias"
  | "/competencias"
  | "/revisao"
  | "/pendencias"
  | "/alertas"
  | "/clientes"
  | "/controle-gerencial"
  | "/configuracoes"
  | "/usuarios";

// Default permissions (fallback when DB not loaded yet)
const DEFAULT_ROLE_PAGES: Record<ProfileRole, AppPage[]> = {
  coordenacao: ["/", "/demandas", "/planejamento", "/equipe", "/ausencias", "/competencias", "/revisao", "/pendencias", "/alertas", "/clientes", "/controle-gerencial", "/configuracoes", "/usuarios"],
  analista: ["/", "/demandas", "/planejamento", "/equipe", "/ausencias", "/competencias", "/revisao", "/pendencias", "/alertas", "/clientes", "/controle-gerencial"],
  assistente: ["/", "/demandas", "/planejamento", "/equipe", "/ausencias", "/competencias", "/revisao", "/pendencias", "/clientes"],
  estagiario: ["/", "/demandas", "/planejamento", "/equipe", "/ausencias", "/competencias", "/revisao", "/pendencias", "/clientes"],
};

// Runtime permissions – can be replaced by DB values
let ROLE_PAGES: Record<ProfileRole, AppPage[]> = { ...DEFAULT_ROLE_PAGES };

export function setRolePermissions(perms: Record<string, string[]>) {
  for (const role of Object.keys(perms || {})) {
    ROLE_PAGES[role] = (perms[role] || []) as AppPage[];
  }
}

export function getRolePermissions(): Record<ProfileRole, AppPage[]> {
  return { ...ROLE_PAGES };
}

export function getDefaultRolePermissions(): Record<ProfileRole, AppPage[]> {
  return { ...DEFAULT_ROLE_PAGES };
}

export function canAccessPage(role: string | undefined, path: AppPage): boolean {
  if (!role) return false;
  const pages = ROLE_PAGES[role as ProfileRole];
  if (!pages) return false;
  return pages.includes(path);
}

export function getAllowedPages(role: string | undefined): AppPage[] {
  if (!role) return [];
  return ROLE_PAGES[role as ProfileRole] || [];
}

export const ALL_PAGES: { path: AppPage; label: string }[] = [
  { path: "/", label: "Dashboard" },
  { path: "/demandas", label: "Solicitação de Clientes" },
  { path: "/planejamento", label: "Planejamento" },
  { path: "/equipe", label: "Produtividade Equipe" },
  { path: "/ausencias", label: "Ausências" },
  { path: "/competencias", label: "Fechamento Contábil" },
  { path: "/revisao", label: "Revisão de Demonstrativos" },
  { path: "/pendencias", label: "Pendências" },
  { path: "/alertas", label: "Alertas" },
  { path: "/clientes", label: "Clientes" },
  { path: "/controle-gerencial", label: "Controle Gerencial" },
  { path: "/configuracoes", label: "Configurações" },
  { path: "/usuarios", label: "Usuários" },
];

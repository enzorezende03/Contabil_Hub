// Role-based page permissions
// Profile roles: coordenacao, analista, assistente, estagiario

export type ProfileRole = "coordenacao" | "analista" | "assistente" | "estagiario";

export type AppPage =
  | "/"
  | "/demandas"
  | "/planejamento"
  | "/equipe"
  | "/competencias"
  | "/revisao"
  | "/alertas"
  | "/clientes"
  | "/configuracoes"
  | "/usuarios";

// Default permissions (fallback when DB not loaded yet)
const DEFAULT_ROLE_PAGES: Record<ProfileRole, AppPage[]> = {
  coordenacao: ["/", "/demandas", "/planejamento", "/equipe", "/competencias", "/revisao", "/alertas", "/clientes", "/configuracoes", "/usuarios"],
  analista: ["/", "/demandas", "/planejamento", "/equipe", "/competencias", "/revisao", "/alertas", "/clientes"],
  assistente: ["/", "/demandas", "/planejamento", "/competencias", "/revisao", "/clientes"],
  estagiario: ["/", "/demandas", "/planejamento", "/competencias", "/revisao", "/clientes"],
};

// Runtime permissions – can be replaced by DB values
let ROLE_PAGES: Record<ProfileRole, AppPage[]> = { ...DEFAULT_ROLE_PAGES };

export function setRolePermissions(perms: Record<string, string[]>) {
  const roles: ProfileRole[] = ["coordenacao", "analista", "assistente", "estagiario"];
  for (const role of roles) {
    if (perms[role]) {
      ROLE_PAGES[role] = perms[role] as AppPage[];
    }
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
  { path: "/competencias", label: "Fechamento Contábil" },
  { path: "/revisao", label: "Revisão de Demonstrativos" },
  { path: "/alertas", label: "Alertas" },
  { path: "/clientes", label: "Clientes" },
  { path: "/configuracoes", label: "Configurações" },
  { path: "/usuarios", label: "Usuários" },
];

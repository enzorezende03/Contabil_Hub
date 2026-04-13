// Role-based page permissions
// Profile roles: coordenacao, analista, assistente, estagiario

export type ProfileRole = "coordenacao" | "analista" | "assistente" | "estagiario";

export type AppPage =
  | "/"
  | "/demandas"
  | "/planejamento"
  | "/equipe"
  | "/competencias"
  | "/alertas"
  | "/clientes"
  | "/configuracoes"
  | "/usuarios";

const ROLE_PAGES: Record<ProfileRole, AppPage[]> = {
  coordenacao: ["/", "/demandas", "/planejamento", "/equipe", "/competencias", "/alertas", "/clientes", "/configuracoes", "/usuarios"],
  analista: ["/", "/demandas", "/planejamento", "/equipe", "/competencias", "/alertas", "/clientes"],
  assistente: ["/", "/demandas", "/planejamento", "/competencias", "/clientes"],
  estagiario: ["/", "/demandas", "/planejamento", "/competencias", "/clientes"],
};

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

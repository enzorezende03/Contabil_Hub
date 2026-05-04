import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { ROLE_LABELS, type TaskWeight, type TeamMember, type TeamRole } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Pencil, Save, Plus, Trash2, X, Shield, Lock } from "lucide-react";
import { ALL_PAGES, type ProfileRole, type AppPage, setRolePermissions, BUILTIN_ROLES, setCustomRoles } from "@/lib/permissions";
import { type ActionPermissions, setActionPermissions } from "@/hooks/use-action-permissions";

const ROLE_OPTIONS: { value: TeamRole; label: string }[] = [
  { value: "estagiario", label: "Estagiário" },
  { value: "assistente", label: "Assistente" },
  { value: "analista", label: "Analista" },
  { value: "coordenacao", label: "Coordenação" },
];

type RolePerms = Record<ProfileRole, AppPage[]>;

export default function SettingsPage() {
  const { isAdmin, user } = useAuth();
  const [weights, setWeights] = useState<TaskWeight[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [permissions, setPermissions] = useState<RolePerms>({} as RolePerms);
  const [actionPerms, setActionPermsState] = useState<ActionPermissions>({
    edit_dates: ["coordenacao"],
    liberar_para_revisao: ["coordenacao", "analista", "assistente"],
    revisar_demonstrativos: ["coordenacao"],
    cancelar_submissao: ["coordenacao"],
    supervisionar_revisao: ["coordenacao"],
    gerenciar_pendencias: ["coordenacao", "analista", "assistente"],
    supervisionar_pendencias: ["coordenacao"],
    configurar_integracoes: ["coordenacao"],
    ver_todas_demandas: ["coordenacao", "analista"],
    ver_toda_equipe: ["coordenacao", "analista"],
    ver_propria_produtividade: ["coordenacao", "analista", "assistente", "estagiario"],
    ver_produtividade_equipe: ["coordenacao"],
    configurar_produtividade: ["coordenacao"],
    gerenciar_ausencias_equipe: ["coordenacao"],
  });
  const [editingWeights, setEditingWeights] = useState(false);
  const [editingTeam, setEditingTeam] = useState(false);
  const [editingPerms, setEditingPerms] = useState(false);
  const [editingActions, setEditingActions] = useState(false);
  const [draftWeights, setDraftWeights] = useState<TaskWeight[]>([]);
  const [draftTeam, setDraftTeam] = useState<TeamMember[]>([]);
  const [draftPerms, setDraftPerms] = useState<RolePerms>({} as RolePerms);
  const [draftActions, setDraftActions] = useState<ActionPermissions>({
    edit_dates: ["coordenacao"],
    liberar_para_revisao: ["coordenacao", "analista", "assistente"],
    revisar_demonstrativos: ["coordenacao"],
    cancelar_submissao: ["coordenacao"],
    supervisionar_revisao: ["coordenacao"],
    gerenciar_pendencias: ["coordenacao", "analista", "assistente"],
    supervisionar_pendencias: ["coordenacao"],
    configurar_integracoes: ["coordenacao"],
    ver_todas_demandas: ["coordenacao", "analista"],
    ver_toda_equipe: ["coordenacao", "analista"],
    ver_propria_produtividade: ["coordenacao", "analista", "assistente", "estagiario"],
    ver_produtividade_equipe: ["coordenacao"],
    configurar_produtividade: ["coordenacao"],
    gerenciar_ausencias_equipe: ["coordenacao"],
  });
  const [saving, setSaving] = useState(false);

  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<TeamRole>("assistente");

  // Custom roles
  const [customRoles, setCustomRolesState] = useState<{ value: string; label: string }[]>([]);
  const [newRoleLabel, setNewRoleLabel] = useState("");

  const PROFILE_ROLES = [...BUILTIN_ROLES, ...customRoles];

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase.from("settings").select("key, value");
    if (data) {
      const wRow = data.find((r) => r.key === "demand_weights");
      const tRow = data.find((r) => r.key === "team_members");
      const pRow = data.find((r) => r.key === "role_permissions");
      const aRow = data.find((r) => r.key === "action_permissions");
      const cRow = data.find((r) => r.key === "custom_roles");
      if (wRow) setWeights(wRow.value as unknown as TaskWeight[]);
      if (tRow) setTeam(tRow.value as unknown as TeamMember[]);
      if (pRow) setPermissions(pRow.value as unknown as RolePerms);
      if (aRow) setActionPermsState(aRow.value as unknown as ActionPermissions);
      if (cRow) {
        const cr = (cRow.value as unknown as { value: string; label: string }[]) || [];
        setCustomRolesState(cr);
        setCustomRoles(cr);
      }
    }
  };

  const addCustomRole = async () => {
    const label = newRoleLabel.trim();
    if (!label) return toast.error("Informe o nome do cargo");
    const value = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!value) return toast.error("Nome inválido");
    if ([...BUILTIN_ROLES, ...customRoles].some((r) => r.value === value)) {
      return toast.error("Já existe um cargo com esse nome");
    }
    const updated = [...customRoles, { value, label }];
    const { error } = await supabase.from("settings").upsert({ key: "custom_roles", value: updated as any, updated_by: user?.id }, { onConflict: "key" });
    if (error) return toast.error("Erro ao salvar cargo");
    setCustomRolesState(updated);
    setCustomRoles(updated);
    setNewRoleLabel("");
    toast.success("Cargo criado!");
  };

  const removeCustomRole = async (value: string) => {
    if (!confirm(`Remover este cargo? Usuários com este cargo continuarão existindo, mas perderão suas permissões.`)) return;
    const updated = customRoles.filter((r) => r.value !== value);
    const { error } = await supabase.from("settings").upsert({ key: "custom_roles", value: updated as any, updated_by: user?.id }, { onConflict: "key" });
    if (error) return toast.error("Erro ao remover cargo");
    setCustomRolesState(updated);
    setCustomRoles(updated);
    toast.success("Cargo removido");
  };

  // --- Weights ---
  const startEditWeights = () => {
    setDraftWeights(JSON.parse(JSON.stringify(weights)));
    setEditingWeights(true);
  };
  const saveWeights = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("settings")
      .update({ value: JSON.parse(JSON.stringify(draftWeights)), updated_by: user?.id })
      .eq("key", "demand_weights");
    if (error) toast.error("Erro ao salvar pesos");
    else { setWeights(draftWeights); setEditingWeights(false); toast.success("Pesos atualizados!"); }
    setSaving(false);
  };
  const updateDraftWeight = (index: number, value: number) => {
    const updated = [...draftWeights];
    updated[index] = { ...updated[index], weight: value };
    setDraftWeights(updated);
  };

  // --- Team ---
  const startEditTeam = () => {
    setDraftTeam(JSON.parse(JSON.stringify(team)));
    setEditingTeam(true);
  };
  const saveTeam = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("settings")
      .update({ value: JSON.parse(JSON.stringify(draftTeam)), updated_by: user?.id })
      .eq("key", "team_members");
    if (error) toast.error("Erro ao salvar equipe");
    else { setTeam(draftTeam); setEditingTeam(false); toast.success("Equipe atualizada!"); }
    setSaving(false);
  };
  const addMember = () => {
    if (!newName.trim()) return;
    const nextId = String(Math.max(0, ...draftTeam.map((m) => Number(m.id))) + 1);
    setDraftTeam([...draftTeam, { id: nextId, name: newName.trim(), role: newRole }]);
    setNewName("");
    setNewRole("assistente");
  };
  const removeMember = (id: string) => setDraftTeam(draftTeam.filter((m) => m.id !== id));
  const updateMemberName = (id: string, name: string) => setDraftTeam(draftTeam.map((m) => (m.id === id ? { ...m, name } : m)));
  const updateMemberRole = (id: string, role: TeamRole) => setDraftTeam(draftTeam.map((m) => (m.id === id ? { ...m, role } : m)));

  // --- Unified Permissions (pages + actions) ---
  const startEditAll = () => {
    setDraftPerms(JSON.parse(JSON.stringify(permissions)));
    setDraftActions(JSON.parse(JSON.stringify(actionPerms)));
    setEditingPerms(true);
    setEditingActions(true);
  };
  const cancelEditAll = () => {
    setEditingPerms(false);
    setEditingActions(false);
  };
  const saveAll = async () => {
    setSaving(true);
    const [r1, r2] = await Promise.all([
      supabase.from("settings").update({ value: JSON.parse(JSON.stringify(draftPerms)), updated_by: user?.id }).eq("key", "role_permissions"),
      supabase.from("settings").update({ value: JSON.parse(JSON.stringify(draftActions)), updated_by: user?.id }).eq("key", "action_permissions"),
    ]);
    if (r1.error || r2.error) {
      toast.error("Erro ao salvar permissões");
    } else {
      setPermissions(draftPerms);
      setRolePermissions(draftPerms);
      setActionPermsState(draftActions);
      setActionPermissions(draftActions);
      setEditingPerms(false);
      setEditingActions(false);
      toast.success("Permissões atualizadas!");
    }
    setSaving(false);
  };
  const togglePerm = (role: ProfileRole, page: AppPage) => {
    const current = draftPerms[role] || [];
    const has = current.includes(page);
    setDraftPerms({
      ...draftPerms,
      [role]: has ? current.filter((p) => p !== page) : [...current, page],
    });
  };

  // --- Action Permissions ---
  const ACTION_ITEMS: { key: keyof ActionPermissions; label: string; description: string }[] = [
    { key: "edit_dates", label: "Alterar Datas", description: "Permite definir/alterar prazos em planejamentos e solicitações de clientes" },
    { key: "liberar_para_revisao", label: "Liberar para Revisão", description: "Permite liberar uma competência fechada para revisão da contadora (em /competencias)" },
    { key: "revisar_demonstrativos", label: "Revisar Demonstrativos", description: "Permite aprovar, apontar e devolver demonstrativos contábeis na caixa de revisão" },
    { key: "cancelar_submissao", label: "Cancelar Submissão", description: "Permite cancelar uma submissão de revisão ainda não revisada" },
    { key: "supervisionar_revisao", label: "Supervisionar Revisão", description: "Visão completa de todas as submissões do sistema; permite reatribuir revisora e remover bloqueios" },
    { key: "ver_todas_demandas", label: "Ver Todas as Demandas", description: "Visualiza demandas e planejamentos de toda a equipe (operacional vê apenas os seus quando desmarcado)" },
    { key: "ver_toda_equipe", label: "Ver Produtividade de Toda Equipe (legado)", description: "Mantido por compatibilidade. Use 'Ver Produtividade da Equipe' abaixo." },
    { key: "ver_propria_produtividade", label: "Ver Própria Produtividade", description: "Acessa a página /equipe e vê seu próprio score composto" },
    { key: "ver_produtividade_equipe", label: "Ver Produtividade da Equipe", description: "Vê ranking completo de produtividade e detalhamento de qualquer colaborador" },
    { key: "configurar_produtividade", label: "Configurar Produtividade", description: "Edita pesos, multiplicadores e parâmetros do score composto" },
    { key: "gerenciar_ausencias_equipe", label: "Gerenciar Ausências da Equipe", description: "Cadastra/edita ausências de qualquer colaborador" },
  ];
  const toggleActionPerm = (action: keyof ActionPermissions, role: ProfileRole) => {
    const current = draftActions[action] || [];
    const has = current.includes(role);
    setDraftActions({
      ...draftActions,
      [action]: has ? current.filter((r) => r !== role) : [...current, role],
    });
  };

  const EditButton = ({ editing, onStart, onCancel, onSave }: { editing: boolean; onStart: () => void; onCancel: () => void; onSave: () => void }) => (
    <>
      {isAdmin && !editing && (
        <button onClick={onStart} className="flex items-center gap-1 text-xs text-primary hover:underline">
          <Pencil className="w-3.5 h-3.5" /> Editar
        </button>
      )}
      {editing && (
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            <X className="w-3.5 h-3.5" /> Cancelar
          </button>
          <button onClick={onSave} disabled={saving} className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> Salvar
          </button>
        </div>
      )}
    </>
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">Pesos, equipe, permissões e parâmetros do sistema</p>
        </div>

        {/* Weights */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Pesos das Demandas</h3>
            <EditButton editing={editingWeights} onStart={startEditWeights} onCancel={() => setEditingWeights(false)} onSave={saveWeights} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(editingWeights ? draftWeights : weights).map((w, i) => (
              <div key={w.type} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                <span className="text-sm">{w.label}</span>
                {editingWeights ? (
                  <input
                    type="number" min={1} max={10}
                    value={draftWeights[i]?.weight ?? w.weight}
                    onChange={(e) => updateDraftWeight(i, Math.max(1, Math.min(10, Number(e.target.value))))}
                    className="w-14 h-7 text-center text-sm font-bold border rounded bg-background text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                ) : (
                  <span className="text-sm font-bold text-primary">{w.weight}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Custom Roles */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Cargos Personalizados</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Crie novos cargos além dos padrões. Eles aparecerão nas tabelas de permissões abaixo e no cadastro de usuários.
          </p>
          <div className="divide-y divide-border mb-3">
            {customRoles.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">Nenhum cargo personalizado criado.</p>
            )}
            {customRoles.map((r) => (
              <div key={r.value} className="flex items-center justify-between py-2">
                <div>
                  <span className="text-sm font-medium">{r.label}</span>
                  <span className="text-xs text-muted-foreground ml-2">({r.value})</span>
                </div>
                {isAdmin && (
                  <button onClick={() => removeCustomRole(r.value)} className="text-destructive hover:text-destructive/80 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 pt-3 border-t">
              <input
                placeholder="Nome do cargo (ex: Gerente Tributário)"
                value={newRoleLabel}
                onChange={(e) => setNewRoleLabel(e.target.value)}
                className="h-8 px-3 text-sm border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary flex-1"
              />
              <button
                onClick={addCustomRole}
                disabled={!newRoleLabel.trim()}
                className="h-8 px-3 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>
          )}
        </div>

        {/* Unified Permissions Matrix */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">Permissões</h3>
            </div>
            <EditButton editing={editingPerms} onStart={startEditAll} onCancel={cancelEditAll} onSave={saveAll} />
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Marque o que cada cargo pode acessar (páginas) e fazer (ações) no sistema.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Permissão</th>
                  {PROFILE_ROLES.map((r) => (
                    <th key={r.value} className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="bg-muted/30">
                  <td colSpan={PROFILE_ROLES.length + 1} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Shield className="w-3 h-3" /> Acesso a Páginas
                  </td>
                </tr>
                {ALL_PAGES.map((page) => {
                  const permsData = editingPerms ? draftPerms : permissions;
                  return (
                    <tr key={page.path} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-sm font-medium">{page.label}</td>
                      {PROFILE_ROLES.map((r) => {
                        const hasAccess = permsData[r.value]?.includes(page.path) ?? false;
                        const isDashboard = page.path === "/";
                        return (
                          <td key={r.value} className="text-center px-3 py-2">
                            {editingPerms ? (
                              <input
                                type="checkbox"
                                checked={hasAccess}
                                disabled={isDashboard}
                                onChange={() => togglePerm(r.value, page.path)}
                                className="w-4 h-4 rounded border-border text-primary focus:ring-primary disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                              />
                            ) : (
                              <span className={`inline-block w-5 h-5 rounded-full text-xs leading-5 ${hasAccess ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                                {hasAccess ? "✓" : "—"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr className="bg-muted/30">
                  <td colSpan={PROFILE_ROLES.length + 1} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Lock className="w-3 h-3" /> Ações no Sistema
                  </td>
                </tr>
                {ACTION_ITEMS.map((action) => {
                  const data = editingActions ? draftActions : actionPerms;
                  return (
                    <tr key={action.key} className="hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="text-sm font-medium">{action.label}</div>
                        <div className="text-[10px] text-muted-foreground">{action.description}</div>
                      </td>
                      {PROFILE_ROLES.map((r) => {
                        const allowed = data[action.key]?.includes(r.value) ?? false;
                        return (
                          <td key={r.value} className="text-center px-3 py-2">
                            {editingActions ? (
                              <input
                                type="checkbox"
                                checked={allowed}
                                onChange={() => toggleActionPerm(action.key, r.value)}
                                className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                              />
                            ) : (
                              <span className={`inline-block w-5 h-5 rounded-full text-xs leading-5 ${allowed ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                                {allowed ? "✓" : "—"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {editingPerms && (
            <p className="text-[11px] text-muted-foreground mt-2">* O Dashboard é obrigatório para todos os cargos.</p>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

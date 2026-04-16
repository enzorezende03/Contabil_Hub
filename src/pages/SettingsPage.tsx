import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { ROLE_LABELS, type TaskWeight, type TeamMember, type TeamRole } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Pencil, Save, Plus, Trash2, X, Shield } from "lucide-react";
import { ALL_PAGES, type ProfileRole, type AppPage, setRolePermissions } from "@/lib/permissions";

const ROLE_OPTIONS: { value: TeamRole; label: string }[] = [
  { value: "estagiario", label: "Estagiário" },
  { value: "assistente", label: "Assistente" },
  { value: "analista", label: "Analista" },
  { value: "coordenacao", label: "Coordenação" },
];

const PROFILE_ROLES: { value: ProfileRole; label: string }[] = [
  { value: "coordenacao", label: "Coordenação" },
  { value: "analista", label: "Analista" },
  { value: "assistente", label: "Assistente" },
  { value: "estagiario", label: "Estagiário" },
];

type RolePerms = Record<ProfileRole, AppPage[]>;

export default function SettingsPage() {
  const { isAdmin, user } = useAuth();
  const [weights, setWeights] = useState<TaskWeight[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [permissions, setPermissions] = useState<RolePerms>({} as RolePerms);
  const [editingWeights, setEditingWeights] = useState(false);
  const [editingTeam, setEditingTeam] = useState(false);
  const [editingPerms, setEditingPerms] = useState(false);
  const [draftWeights, setDraftWeights] = useState<TaskWeight[]>([]);
  const [draftTeam, setDraftTeam] = useState<TeamMember[]>([]);
  const [draftPerms, setDraftPerms] = useState<RolePerms>({} as RolePerms);
  const [saving, setSaving] = useState(false);

  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<TeamRole>("assistente");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase.from("settings").select("key, value");
    if (data) {
      const wRow = data.find((r) => r.key === "demand_weights");
      const tRow = data.find((r) => r.key === "team_members");
      const pRow = data.find((r) => r.key === "role_permissions");
      if (wRow) setWeights(wRow.value as unknown as TaskWeight[]);
      if (tRow) setTeam(tRow.value as unknown as TeamMember[]);
      if (pRow) setPermissions(pRow.value as unknown as RolePerms);
    }
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

  // --- Permissions ---
  const startEditPerms = () => {
    setDraftPerms(JSON.parse(JSON.stringify(permissions)));
    setEditingPerms(true);
  };
  const savePerms = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("settings")
      .update({ value: JSON.parse(JSON.stringify(draftPerms)), updated_by: user?.id })
      .eq("key", "role_permissions");
    if (error) {
      toast.error("Erro ao salvar permissões");
    } else {
      setPermissions(draftPerms);
      setRolePermissions(draftPerms);
      setEditingPerms(false);
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

        {/* Team */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Equipe</h3>
            <EditButton editing={editingTeam} onStart={startEditTeam} onCancel={() => setEditingTeam(false)} onSave={saveTeam} />
          </div>
          <div className="divide-y divide-border">
            {(editingTeam ? draftTeam : team).map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2 gap-2">
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary flex-shrink-0">
                    {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  {editingTeam ? (
                    <input value={m.name} onChange={(e) => updateMemberName(m.id, e.target.value)}
                      className="h-7 px-2 text-sm border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary flex-1" />
                  ) : (
                    <span className="text-sm font-medium">{m.name}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {editingTeam ? (
                    <>
                      <select value={m.role} onChange={(e) => updateMemberRole(m.id, e.target.value as TeamRole)}
                        className="h-7 px-2 text-xs border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary">
                        {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <button onClick={() => removeMember(m.id)} className="text-destructive hover:text-destructive/80 p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{ROLE_LABELS[m.role]}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {editingTeam && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
              <input placeholder="Nome do membro" value={newName} onChange={(e) => setNewName(e.target.value)}
                className="h-8 px-3 text-sm border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary flex-1" />
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as TeamRole)}
                className="h-8 px-2 text-xs border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary">
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button onClick={addMember} disabled={!newName.trim()}
                className="h-8 px-3 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>
          )}
        </div>

        {/* Permissions */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">Permissões por Cargo</h3>
            </div>
            <EditButton editing={editingPerms} onStart={startEditPerms} onCancel={() => setEditingPerms(false)} onSave={savePerms} />
          </div>
          <p className="text-xs text-muted-foreground mb-3">Define quais páginas cada cargo pode acessar no sistema.</p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Página</th>
                  {PROFILE_ROLES.map((r) => (
                    <th key={r.value} className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
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
              </tbody>
            </table>
          </div>
          {editingPerms && (
            <p className="text-[11px] text-muted-foreground mt-2">* O Dashboard (/) é obrigatório para todos os cargos.</p>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

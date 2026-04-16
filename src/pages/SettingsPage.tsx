import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { DEMAND_TYPE_LABELS, ROLE_LABELS, type TaskWeight, type TeamMember, type TeamRole, type DemandType } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Pencil, Save, Plus, Trash2, X } from "lucide-react";

const ROLE_OPTIONS: { value: TeamRole; label: string }[] = [
  { value: "estagiario", label: "Estagiário" },
  { value: "assistente", label: "Assistente" },
  { value: "analista", label: "Analista" },
  { value: "coordenacao", label: "Coordenação" },
];

export default function SettingsPage() {
  const { isAdmin, user } = useAuth();
  const [weights, setWeights] = useState<TaskWeight[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [editingWeights, setEditingWeights] = useState(false);
  const [editingTeam, setEditingTeam] = useState(false);
  const [draftWeights, setDraftWeights] = useState<TaskWeight[]>([]);
  const [draftTeam, setDraftTeam] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);

  // New member form
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
      if (wRow) setWeights(wRow.value as unknown as TaskWeight[]);
      if (tRow) setTeam(tRow.value as unknown as TeamMember[]);
    }
  };

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
    if (error) {
      toast.error("Erro ao salvar pesos");
    } else {
      setWeights(draftWeights);
      setEditingWeights(false);
      toast.success("Pesos atualizados!");
    }
    setSaving(false);
  };

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
    if (error) {
      toast.error("Erro ao salvar equipe");
    } else {
      setTeam(draftTeam);
      setEditingTeam(false);
      toast.success("Equipe atualizada!");
    }
    setSaving(false);
  };

  const addMember = () => {
    if (!newName.trim()) return;
    const nextId = String(Math.max(0, ...draftTeam.map((m) => Number(m.id))) + 1);
    setDraftTeam([...draftTeam, { id: nextId, name: newName.trim(), role: newRole }]);
    setNewName("");
    setNewRole("assistente");
  };

  const removeMember = (id: string) => {
    setDraftTeam(draftTeam.filter((m) => m.id !== id));
  };

  const updateDraftWeight = (index: number, value: number) => {
    const updated = [...draftWeights];
    updated[index] = { ...updated[index], weight: value };
    setDraftWeights(updated);
  };

  const updateMemberName = (id: string, name: string) => {
    setDraftTeam(draftTeam.map((m) => (m.id === id ? { ...m, name } : m)));
  };

  const updateMemberRole = (id: string, role: TeamRole) => {
    setDraftTeam(draftTeam.map((m) => (m.id === id ? { ...m, role } : m)));
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">Pesos, equipe e parâmetros do sistema</p>
        </div>

        {/* Weights */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Pesos das Demandas</h3>
            {isAdmin && !editingWeights && (
              <button onClick={startEditWeights} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Pencil className="w-3.5 h-3.5" /> Editar
              </button>
            )}
            {editingWeights && (
              <div className="flex gap-2">
                <button onClick={() => setEditingWeights(false)} className="flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
                <button onClick={saveWeights} disabled={saving} className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" /> Salvar
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(editingWeights ? draftWeights : weights).map((w, i) => (
              <div key={w.type} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                <span className="text-sm">{w.label}</span>
                {editingWeights ? (
                  <input
                    type="number"
                    min={1}
                    max={10}
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
            {isAdmin && !editingTeam && (
              <button onClick={startEditTeam} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Pencil className="w-3.5 h-3.5" /> Editar
              </button>
            )}
            {editingTeam && (
              <div className="flex gap-2">
                <button onClick={() => setEditingTeam(false)} className="flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
                <button onClick={saveTeam} disabled={saving} className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" /> Salvar
                </button>
              </div>
            )}
          </div>

          <div className="divide-y divide-border">
            {(editingTeam ? draftTeam : team).map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2 gap-2">
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary flex-shrink-0">
                    {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  {editingTeam ? (
                    <input
                      value={m.name}
                      onChange={(e) => updateMemberName(m.id, e.target.value)}
                      className="h-7 px-2 text-sm border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary flex-1"
                    />
                  ) : (
                    <span className="text-sm font-medium">{m.name}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {editingTeam ? (
                    <>
                      <select
                        value={m.role}
                        onChange={(e) => updateMemberRole(m.id, e.target.value as TeamRole)}
                        className="h-7 px-2 text-xs border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      <button onClick={() => removeMember(m.id)} className="text-destructive hover:text-destructive/80 p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {ROLE_LABELS[m.role]}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {editingTeam && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
              <input
                placeholder="Nome do membro"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-8 px-3 text-sm border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary flex-1"
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as TeamRole)}
                className="h-8 px-2 text-xs border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <button
                onClick={addMember}
                disabled={!newName.trim()}
                className="h-8 px-3 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useActionPermissions, canPerformAction } from "@/hooks/use-action-permissions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Trash2, Calendar as CalendarIcon } from "lucide-react";

const TIPOS = [
  { value: "ferias", label: "Férias" },
  { value: "atestado", label: "Atestado" },
  { value: "folga", label: "Folga" },
  { value: "treinamento", label: "Treinamento" },
  { value: "licenca", label: "Licença" },
  { value: "outros", label: "Outros" },
];

export default function AusenciasPage() {
  const { user, profile, isAdmin } = useAuth();
  useActionPermissions();
  const canManageOthers = isAdmin || canPerformAction("gerenciar_ausencias_equipe", profile?.role);
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    user_id: user?.id || "",
    tipo: "ferias",
    data_inicio: "",
    data_fim: "",
    horas_dia: 480,
    descricao: "",
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => (await supabase.from("profiles").select("*")).data || [],
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["team_availability"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_availability")
        .select("*")
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const profileById = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of profiles) m.set(p.user_id, p);
    return m;
  }, [profiles]);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return items.filter((i: any) => i.data_fim >= today);
  }, [items]);
  const past = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return items.filter((i: any) => i.data_fim < today);
  }, [items]);

  const submit = async () => {
    if (!form.data_inicio || !form.data_fim) return toast.error("Preencha as datas");
    if (form.data_fim < form.data_inicio) return toast.error("Data fim deve ser >= início");
    const target = canManageOthers ? form.user_id : user?.id;
    if (!target) return toast.error("Usuário inválido");
    const { error } = await supabase.from("team_availability").insert({
      user_id: target,
      tipo: form.tipo,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      horas_dia: form.horas_dia,
      descricao: form.descricao || null,
      created_by: user!.id,
    });
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Ausência cadastrada");
    setShowForm(false);
    setForm({ user_id: user!.id, tipo: "ferias", data_inicio: "", data_fim: "", horas_dia: 480, descricao: "" });
    queryClient.invalidateQueries({ queryKey: ["team_availability"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Remover esta ausência?")) return;
    const { error } = await supabase.from("team_availability").delete().eq("id", id);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Removida");
    queryClient.invalidateQueries({ queryKey: ["team_availability"] });
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ausências</h1>
            <p className="text-sm text-muted-foreground mt-1">Cadastre férias, atestados, folgas e treinamentos. Reduz sua capacidade no cálculo de produtividade.</p>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nova ausência
          </Button>
        </div>

        {showForm && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Nova ausência</h3>
            <div className="grid md:grid-cols-2 gap-3">
              {canManageOthers && (
                <div>
                  <label className="text-xs text-muted-foreground">Colaborador</label>
                  <select
                    value={form.user_id}
                    onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                    className="w-full mt-1 h-9 border rounded px-2 text-sm bg-background"
                  >
                    {profiles.map((p: any) => (
                      <option key={p.user_id} value={p.user_id}>{p.display_name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground">Tipo</label>
                <select
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                  className="w-full mt-1 h-9 border rounded px-2 text-sm bg-background"
                >
                  {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Data início</label>
                <input
                  type="date" value={form.data_inicio}
                  onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                  className="w-full mt-1 h-9 border rounded px-2 text-sm bg-background"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Data fim</label>
                <input
                  type="date" value={form.data_fim}
                  onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
                  className="w-full mt-1 h-9 border rounded px-2 text-sm bg-background"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Minutos por dia (480 = jornada cheia)</label>
                <input
                  type="number" min={0} max={720} value={form.horas_dia}
                  onChange={(e) => setForm({ ...form, horas_dia: Number(e.target.value) })}
                  className="w-full mt-1 h-9 border rounded px-2 text-sm bg-background"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground">Descrição (opcional)</label>
                <input
                  type="text" value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  className="w-full mt-1 h-9 border rounded px-2 text-sm bg-background"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={submit}>Cadastrar</Button>
            </div>
          </div>
        )}

        <Section title="Próximas e em andamento" items={upcoming} profileById={profileById} canManageOthers={canManageOthers} userId={user?.id} onRemove={remove} loading={isLoading} />
        <Section title="Histórico (últimas 90 dias)" items={past.slice(0, 50)} profileById={profileById} canManageOthers={canManageOthers} userId={user?.id} onRemove={remove} loading={isLoading} />
      </div>
    </AppLayout>
  );
}

function Section({ title, items, profileById, canManageOthers, userId, onRemove, loading }: any) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2">
        <CalendarIcon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">({items.length})</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/20 text-xs text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2">Colaborador</th>
            <th className="text-left px-4 py-2">Tipo</th>
            <th className="text-left px-4 py-2">Período</th>
            <th className="text-left px-4 py-2">Min/dia</th>
            <th className="text-left px-4 py-2">Descrição</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {loading && (
            <tr><td colSpan={6} className="px-4 py-3 text-center text-muted-foreground">Carregando...</td></tr>
          )}
          {!loading && items.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-3 text-center text-muted-foreground">Nenhum registro.</td></tr>
          )}
          {items.map((i: any) => {
            const canDel = canManageOthers || i.user_id === userId;
            return (
              <tr key={i.id} className="hover:bg-muted/20">
                <td className="px-4 py-2">{profileById.get(i.user_id)?.display_name || "—"}</td>
                <td className="px-4 py-2 capitalize">{i.tipo}</td>
                <td className="px-4 py-2">
                  {new Date(i.data_inicio).toLocaleDateString("pt-BR")} – {new Date(i.data_fim).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-2">{i.horas_dia}</td>
                <td className="px-4 py-2 text-muted-foreground">{i.descricao || "—"}</td>
                <td className="px-4 py-2 text-right">
                  {canDel && (
                    <button onClick={() => onRemove(i.id)} className="text-destructive hover:text-destructive/80">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

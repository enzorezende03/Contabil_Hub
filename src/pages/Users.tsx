import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { canAccessPage, BUILTIN_ROLES } from "@/lib/permissions";

interface UserRow {
  user_id: string;
  display_name: string;
  role: string;
  isAdmin: boolean;
  archived_at: string | null;
}

export default function UsersPage() {
  const { user, profile } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("assistente");
  const [appRole, setAppRole] = useState<"admin" | "user">("user");
  const [loading, setLoading] = useState(false);
  const [customRoles, setCustomRoles] = useState<{ value: string; label: string }[]>([]);
  const ROLE_OPTIONS = [...BUILTIN_ROLES, ...customRoles];

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("assistente");
  const [editAppRole, setEditAppRole] = useState<"admin" | "user">("user");
  const [editPassword, setEditPassword] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = (u: UserRow) => {
    setEditing(u);
    setEditName(u.display_name);
    setEditRole(u.role);
    setEditAppRole(u.isAdmin ? "admin" : "user");
    setEditPassword("");
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    const body: Record<string, unknown> = {
      user_id: editing.user_id,
      display_name: editName,
      role: editRole,
      app_role: editAppRole,
    };
    if (editPassword) body.new_password = editPassword;
    const { data, error } = await supabase.functions.invoke("update-user", { body });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Erro ao atualizar");
    } else {
      toast.success("Usuário atualizado!");
      setEditing(null);
      loadUsers();
    }
    setSavingEdit(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, role");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const { data: settingsRow } = await supabase.from("settings").select("value").eq("key", "custom_roles").maybeSingle();
    if (settingsRow?.value) setCustomRoles(settingsRow.value as unknown as { value: string; label: string }[]);
    if (profiles) {
      setUsers(
        profiles.map((p) => ({
          user_id: p.user_id,
          display_name: p.display_name,
          role: p.role,
          isAdmin: roles?.some((r) => r.user_id === p.user_id && r.role === "admin") || false,
        }))
      );
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.functions.invoke("create-user", {
      body: { email, password, display_name: displayName, role, app_role: appRole },
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Erro ao criar usuário");
    } else {
      toast.success("Usuário criado com sucesso!");
      setEmail("");
      setPassword("");
      setDisplayName("");
      setRole("assistente");
      setAppRole("user");
      loadUsers();
    }
    setLoading(false);
  };

  // Access is now controlled by RoleRoute in App.tsx

  const inputClass = "h-9 px-3 text-sm border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary w-full";
  const selectClass = "h-9 px-3 text-sm border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary w-full";

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gerenciar Usuários</h1>
          <p className="text-sm text-muted-foreground mt-1">Criar e visualizar contas de colaboradores</p>
        </div>

        {/* Formulário de criação */}
        <form onSubmit={handleCreate} className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold">Criar novo usuário</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nome completo</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Senha</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} required minLength={6} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Cargo</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className={selectClass}>
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nível de acesso</label>
              <select value={appRole} onChange={(e) => setAppRole(e.target.value as "admin" | "user")} className={selectClass}>
                <option value="user">Usuário</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={loading} className="h-9 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
            {loading ? "Criando..." : "Criar Usuário"}
          </button>
        </form>

        {/* Lista de usuários */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Nome</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cargo</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Acesso</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.user_id} className="hover:bg-muted/20">
                  <td className="px-4 py-2 font-medium">{u.display_name}</td>
                  <td className="px-4 py-2 text-muted-foreground capitalize">{u.role}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.isAdmin ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {u.isAdmin ? "Admin" : "Usuário"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => openEdit(u)} className="text-xs px-3 py-1 rounded-md border hover:bg-muted transition-colors">Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
            <div className="bg-card rounded-lg border shadow-lg w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-base font-semibold">Editar usuário</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Nome</label>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Cargo</label>
                  <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className={selectClass}>
                    {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Nível de acesso</label>
                  <select value={editAppRole} onChange={(e) => setEditAppRole(e.target.value as "admin" | "user")} className={selectClass}>
                    <option value="user">Usuário</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Nova senha (opcional)</label>
                  <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className={inputClass} placeholder="Deixe em branco para não alterar" minLength={6} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditing(null)} className="h-9 px-4 rounded-md border text-sm hover:bg-muted">Cancelar</button>
                <button onClick={saveEdit} disabled={savingEdit} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  {savingEdit ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

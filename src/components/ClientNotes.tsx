import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamMembers } from "@/hooks/use-team-members";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Pencil, Trash2, StickyNote } from "lucide-react";

type Note = { id: string; client_id: string; texto: string; author_id: string; created_at: string; updated_at: string };

export function ClientNotes({ clientId, compact }: { clientId: string; compact?: boolean }) {
  const { user, profile, isAdmin } = useAuth();
  const canManage = isAdmin || profile?.role === "coordenacao";
  const { members } = useTeamMembers();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);

  const key = ["client-notes", clientId];
  const { data: notes = [] } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await supabase
        .from("client_notes" as any)
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any) || [];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const name = (id: string) => members.find((m) => m.id === id)?.name || "—";

  const add = async () => {
    if (!text.trim() || !user) return;
    setBusy(true);
    const { error } = await supabase.from("client_notes" as any).insert({ client_id: clientId, texto: text.trim().slice(0, 4000), author_id: user.id });
    setBusy(false);
    if (error) return toast.error("Erro ao salvar nota: " + error.message);
    setText(""); refresh();
  };
  const saveEdit = async () => {
    if (!editId || !editText.trim()) return;
    const { error } = await supabase.from("client_notes" as any).update({ texto: editText.trim().slice(0, 4000) }).eq("id", editId);
    if (error) return toast.error("Erro ao editar: " + error.message);
    setEditId(null); refresh();
  };
  const remove = async (id: string) => {
    if (!confirm("Excluir esta nota?")) return;
    const { error } = await supabase.from("client_notes" as any).delete().eq("id", id);
    if (error) return toast.error("Erro ao excluir: " + error.message);
    refresh();
  };

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={3}
            placeholder="Observações e particularidades do fechamento desta empresa..." />
          <div className="flex justify-end">
            <Button size="sm" onClick={add} disabled={busy || !text.trim()}>Adicionar nota</Button>
          </div>
        </div>
      )}
      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Nenhuma nota registrada.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => {
            const mine = n.author_id === user?.id;
            return (
              <li key={n.id} className="rounded-md border bg-muted/30 p-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground mb-1">
                  <span className="flex items-center gap-1"><StickyNote className="w-3 h-3" />{name(n.author_id)} · {new Date(n.created_at).toLocaleString("pt-BR")}</span>
                  {!compact && (mine || canManage) && editId !== n.id && (
                    <span className="flex gap-1">
                      <button onClick={() => { setEditId(n.id); setEditText(n.texto); }} className="hover:text-foreground" aria-label="Editar nota"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => remove(n.id)} className="hover:text-destructive" aria-label="Excluir nota"><Trash2 className="w-3 h-3" /></button>
                    </span>
                  )}
                </div>
                {editId === n.id ? (
                  <div className="space-y-2">
                    <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} maxLength={4000} />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancelar</Button>
                      <Button size="sm" onClick={saveEdit}>Salvar</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{n.texto}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

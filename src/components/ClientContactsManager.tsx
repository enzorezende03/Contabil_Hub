import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Star, StarOff } from "lucide-react";
import { toast } from "sonner";

export interface ClientContact {
  id: string;
  client_id: string;
  nome: string;
  email: string;
  is_default: boolean;
}

interface Props {
  clientId: string;
  onChange?: (contacts: ClientContact[]) => void;
}

/**
 * Gestor inline de contatos (nome + e-mail) de um cliente.
 * Usado no cadastro do cliente.
 */
export function ClientContactsManager({ clientId, onChange }: Props) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");

  async function load() {
    if (!clientId) return;
    setLoading(true);
    const { data } = await supabase
      .from("client_contacts")
      .select("*")
      .eq("client_id", clientId)
      .order("is_default", { ascending: false })
      .order("nome");
    const list = (data || []) as ClientContact[];
    setContacts(list);
    onChange?.(list);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function handleAdd() {
    if (!novoNome.trim() || !novoEmail.trim()) {
      toast.error("Informe nome e e-mail");
      return;
    }
    if (!user) return;
    const { error } = await supabase.from("client_contacts").insert({
      client_id: clientId,
      nome: novoNome.trim(),
      email: novoEmail.trim(),
      is_default: contacts.length === 0,
      created_by: user.id,
    });
    if (error) {
      toast.error(`Erro: ${error.message}`);
      return;
    }
    setNovoNome("");
    setNovoEmail("");
    load();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("client_contacts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  }

  async function handleSetDefault(id: string) {
    // limpa default dos demais e seta este
    await supabase.from("client_contacts").update({ is_default: false }).eq("client_id", clientId);
    await supabase.from("client_contacts").update({ is_default: true }).eq("id", id);
    load();
  }

  return (
    <div className="space-y-2">
      <Label>Contatos para envio de pendências</Label>
      <div className="space-y-1.5">
        {loading && <div className="text-xs text-muted-foreground">Carregando...</div>}
        {!loading && contacts.length === 0 && (
          <div className="text-xs text-muted-foreground">Nenhum contato cadastrado.</div>
        )}
        {contacts.map((c) => (
          <div key={c.id} className="flex items-center gap-2 p-2 rounded border bg-muted/30">
            <button
              type="button"
              onClick={() => handleSetDefault(c.id)}
              title={c.is_default ? "Contato padrão" : "Definir como padrão"}
              className="text-yellow-500 hover:scale-110 transition-transform"
            >
              {c.is_default ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4 text-muted-foreground" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{c.nome}</div>
              <div className="text-xs text-muted-foreground truncate">{c.email}</div>
            </div>
            <Button type="button" size="icon" variant="ghost" onClick={() => handleDelete(c.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 pt-1">
        <Input placeholder="Nome" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
        <Input placeholder="email@cliente.com" type="email" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} />
        <Button type="button" size="icon" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

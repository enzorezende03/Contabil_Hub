import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Paperclip, Check, MessageSquare, Loader2, Send, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pendency-portal`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

interface Item {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  ordem: number;
}
interface Response { id: string; item_id: string; tipo: string; texto: string | null; arquivo_nome: string | null; arquivo_path: string | null; sender_nome: string | null; created_at: string; }
interface Comment { id: string; item_id: string; texto: string; sender_nome: string | null; created_at: string; }

async function callPortal(action: string, payload: Record<string, unknown>) {
  const res = await fetch(`${FN_URL}?action=${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Erro");
  return data;
}

export default function PendencyPortal() {
  const { token = "" } = useParams();
  const [code, setCode] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendency, setPendency] = useState<any>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [senderName, setSenderName] = useState("");
  const [textInputs, setTextInputs] = useState<Record<string, string>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  async function reload() {
    const data = await callPortal("load", { token, code });
    setPendency(data.pendency);
    setClientName(data.clientName);
    setItems(data.items || []);
    setResponses(data.responses || []);
    setComments(data.comments || []);
  }

  async function handleAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    try {
      await reload();
      setAuthed(true);
      const saved = localStorage.getItem("pendency_sender_name");
      if (saved) setSenderName(saved);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (senderName) localStorage.setItem("pendency_sender_name", senderName);
  }, [senderName]);

  async function uploadFile(itemId: string, file: File) {
    if (file.size > 20 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 20MB)"); return; }
    try {
      const { signedUrl, path } = await callPortal("upload-url", {
        token, code, itemId, fileName: file.name, contentType: file.type,
      });
      const upRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!upRes.ok) throw new Error("Falha no upload");
      await callPortal("respond", {
        token, code, itemId,
        arquivo_path: path, arquivo_nome: file.name, arquivo_tamanho: file.size,
        sender_nome: senderName || "Cliente",
      });
      toast.success("Arquivo enviado");
      await reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function sendText(itemId: string) {
    const texto = (textInputs[itemId] || "").trim();
    if (!texto) return;
    try {
      await callPortal("respond", { token, code, itemId, texto, sender_nome: senderName || "Cliente" });
      setTextInputs({ ...textInputs, [itemId]: "" });
      toast.success("Resposta enviada");
      await reload();
    } catch (e: any) { toast.error(e.message); }
  }

  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);

  async function handleSubmitToContabilidade() {
    setSubmitting(true);
    try {
      const res = await callPortal("submit", { token, code });
      setSubmittedAt(new Date());
      if (res.allDone) {
        toast.success("Tudo enviado! Pendência concluída ✅");
      } else {
        toast.success(`Enviado parcialmente (${res.entregues}/${res.total}). Você pode continuar respondendo.`);
      }
      await reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleDone(itemId: string, current: string) {
    const next = current === "entregue" ? "pendente" : "entregue";
    try {
      await callPortal("mark", { token, code, itemId, status: next });
      await reload();
    } catch (e: any) { toast.error(e.message); }
  }

  async function sendComment(itemId: string) {
    const texto = (commentInputs[itemId] || "").trim();
    if (!texto) return;
    try {
      await callPortal("comment", { token, code, itemId, texto, sender_nome: senderName || "Cliente" });
      setCommentInputs({ ...commentInputs, [itemId]: "" });
      await reload();
    } catch (e: any) { toast.error(e.message); }
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 space-y-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Portal de Pendências</h1>
            <p className="text-sm text-muted-foreground">Informe o código de acesso recebido.</p>
          </div>
          <form onSubmit={handleAccess} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Código de acesso</Label>
              <Input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                className="font-mono text-lg tracking-widest text-center"
                maxLength={12}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Acessar"}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  const total = items.length;
  const done = items.filter((i) => i.status === "entregue").length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b">
        <div className="max-w-3xl mx-auto p-4 space-y-2">
          <h1 className="text-lg font-semibold">{clientName || "Pendências"}</h1>
          <p className="text-sm text-muted-foreground">{pendency?.descricao}</p>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-muted-foreground">{done}/{total} entregues</span>
          </div>
          <Input
            placeholder="Seu nome (para identificarmos as respostas)"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            className="h-8 text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            💡 Ao anexar um arquivo ou escrever uma resposta, o item é marcado como concluído automaticamente.
          </p>
        </div>
      </header>

      {/* Barra de envio fixa */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto p-3 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[180px] text-xs">
            {done === total && total > 0 ? (
              <span className="text-primary font-medium">Tudo respondido — pode enviar à contabilidade.</span>
            ) : (
              <span className="text-muted-foreground">
                Você pode enviar agora o que já está pronto ({done}/{total}) ou continuar e enviar tudo no fim.
              </span>
            )}
            {submittedAt && (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <CheckCircle2 className="w-3 h-3" /> Último envio: {submittedAt.toLocaleTimeString("pt-BR")}
              </span>
            )}
          </div>
          <Button
            size="sm"
            onClick={handleSubmitToContabilidade}
            disabled={submitting || done === 0}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
            {done === total && total > 0 ? "Enviar tudo" : "Enviar parcial à contabilidade"}
          </Button>
        </div>
      </div>

      <main className="max-w-3xl mx-auto p-4 space-y-3">
        {items.map((item) => {
          const itemResp = responses.filter((r) => r.item_id === item.id);
          const itemCmts = comments.filter((c) => c.item_id === item.id);
          const isDone = item.status === "entregue";
          return (
            <Card key={item.id} className={`p-4 space-y-3 ${isDone ? "bg-muted/40" : ""}`}>
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={isDone}
                  onCheckedChange={() => toggleDone(item.id, item.status)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <p className={`font-medium text-sm ${isDone ? "line-through text-muted-foreground" : ""}`}>
                    {item.titulo}
                  </p>
                  {item.descricao && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.descricao}</p>
                  )}
                </div>
                {isDone && <Check className="w-4 h-4 text-primary" />}
              </div>

              {itemResp.length > 0 && (
                <div className="space-y-1 pl-7">
                  {itemResp.map((r) => (
                    <div key={r.id} className="text-xs bg-muted/50 rounded p-2">
                      <span className="text-[10px] text-muted-foreground">
                        {r.sender_nome || "—"} · {new Date(r.created_at).toLocaleString("pt-BR")}
                      </span>
                      {r.tipo === "arquivo" ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Paperclip className="w-3 h-3" />
                          <span>{r.arquivo_nome}</span>
                        </div>
                      ) : (
                        <p className="mt-0.5 whitespace-pre-wrap">{r.texto}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="pl-7 space-y-2">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Escrever resposta..."
                    rows={1}
                    value={textInputs[item.id] || ""}
                    onChange={(e) => setTextInputs({ ...textInputs, [item.id]: e.target.value })}
                    className="text-xs min-h-[36px]"
                  />
                  <Button size="sm" onClick={() => sendText(item.id)} className="h-9">
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                  <label className="inline-flex items-center justify-center h-9 px-3 rounded-md border bg-card hover:bg-muted cursor-pointer">
                    <Paperclip className="w-3.5 h-3.5" />
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadFile(item.id, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>

                {itemCmts.length > 0 && (
                  <div className="space-y-1 border-l-2 border-muted pl-2">
                    {itemCmts.map((c) => (
                      <div key={c.id} className="text-[11px]">
                        <span className="font-medium">{c.sender_nome || "—"}:</span>{" "}
                        <span>{c.texto}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="Comentar / tirar dúvida..."
                    value={commentInputs[item.id] || ""}
                    onChange={(e) => setCommentInputs({ ...commentInputs, [item.id]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendComment(item.id); } }}
                    className="h-7 text-xs"
                  />
                  <Button size="sm" variant="ghost" onClick={() => sendComment(item.id)} className="h-7">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
        {items.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nenhum item nesta pendência.
          </Card>
        )}
      </main>
    </div>
  );
}

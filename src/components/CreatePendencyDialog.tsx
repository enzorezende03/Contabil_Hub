import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { SETOR_LABELS, PRIORIDADE_LABELS, type PendencyTipo, type PendencyPrioridade, type PendencySetor, competenciaFromMonthYear } from "@/lib/pendency-types";
import { Paperclip, X } from "lucide-react";

const SETORES_INTERNOS: PendencySetor[] = ["fiscal", "departamento_pessoal", "societario"];

interface Profile { user_id: string; display_name: string | null; }
interface ClientContact { id: string; nome: string; email: string; is_default: boolean; }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Preselected context */
  clientId: string;
  clientName?: string;
  /** Either pass competencia (YYYY-MM-DD) directly or month+year */
  competencia?: string;
  month?: string;
  year?: string;
  demandType?: string | null;
  /** "todo" significa toda a competência (demand_type null) */
  scopeChoice?: "tipo" | "todo";
}

export function CreatePendencyDialog({ open, onOpenChange, clientId, clientName, competencia, month, year, demandType, scopeChoice }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<PendencyTipo>("externa");
  const [setor, setSetor] = useState<PendencySetor>("fiscal");
  const [documento, setDocumento] = useState("");
  const [contatoId, setContatoId] = useState<string>("");
  const [novoContatoNome, setNovoContatoNome] = useState("");
  const [novoContatoEmail, setNovoContatoEmail] = useState("");
  const [mostrandoNovoContato, setMostrandoNovoContato] = useState(false);
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState<PendencyPrioridade>("media");
  const [prazo, setPrazo] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [scope, setScope] = useState<"tipo" | "todo">(scopeChoice ?? (demandType ? "tipo" : "todo"));
  const [cadencia, setCadencia] = useState(5);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);
  // Checklist de itens da pendência (apenas para externa)
  const [items, setItems] = useState<{ titulo: string; descricao: string }[]>([
    { titulo: "", descricao: "" },
  ]);
  // Anexos (apenas para interna)
  const [attachments, setAttachments] = useState<File[]>([]);
  // Resultado da geração de link (mostrado após criar)
  const [generatedLink, setGeneratedLink] = useState<{ url: string; code: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setResponsavelId(user?.id ?? "");
    supabase.from("profiles").select("user_id, display_name").order("display_name").then(({ data }) => {
      setProfiles((data || []) as Profile[]);
    });
  }, [open, user?.id]);

  // Carrega contatos do cliente quando o dialog abre
  useEffect(() => {
    if (!open || !clientId) return;
    supabase
      .from("client_contacts")
      .select("id, nome, email, is_default")
      .eq("client_id", clientId)
      .order("is_default", { ascending: false })
      .order("nome")
      .then(({ data }) => {
        const list = (data || []) as ClientContact[];
        setContacts(list);
        const def = list.find((c) => c.is_default) || list[0];
        setContatoId(def?.id ?? "");
        setMostrandoNovoContato(list.length === 0);
      });
  }, [open, clientId]);

  const finalCompetencia = competencia || (month && year ? competenciaFromMonthYear(month, year) : "");

  async function handleSave() {
    if (!user || !finalCompetencia) { toast.error("Faltam dados de contexto"); return; }
    if (!descricao.trim()) { toast.error("Descreva a pendência"); return; }
    

    setSaving(true);
    const payload: any = {
      client_id: clientId,
      competencia: finalCompetencia,
      demand_type: scope === "tipo" ? (demandType ?? null) : null,
      tipo,
      descricao: descricao.trim(),
      prioridade,
      prazo_resposta: null,
      responsavel_id: responsavelId || user.id,
      followup_cadence_days: cadencia,
      created_by: user.id,
      status: "aberta",
    };
    if (tipo === "interna") {
      payload.setor_responsavel = setor;
    } else {
      payload.documento_solicitado = null;
      // Resolve contato escolhido (existente ou novo a cadastrar) — opcional
      let contNome: string | null = null;
      let contEmail: string | null = null;
      if (mostrandoNovoContato) {
        contNome = novoContatoNome.trim() || null;
        contEmail = novoContatoEmail.trim() || null;
        // Só persiste no cadastro do cliente se informou e-mail
        if (contEmail) {
          const { data: novo } = await supabase.from("client_contacts").insert({
            client_id: clientId,
            nome: contNome || contEmail,
            email: contEmail,
            is_default: contacts.length === 0,
            created_by: user.id,
          }).select("id").maybeSingle();
          if (novo?.id) setContatoId(novo.id);
        }
      } else if (contatoId) {
        const c = contacts.find((x) => x.id === contatoId);
        if (c) {
          contNome = c.nome;
          contEmail = c.email;
        }
      }
      payload.contato_cliente_nome = contNome;
      payload.contato_cliente_email = contEmail;
      payload.contato_cliente_telefone = null;
    }

    const { data: created, error } = await supabase.from("pendencies").insert(payload).select("id").maybeSingle();
    setSaving(false);
    if (error) { toast.error(`Erro ao criar pendência: ${error.message}`); return; }

    toast.success("Pendência criada");
    qc.invalidateQueries({ queryKey: ["pendencies"] });
    qc.invalidateQueries({ queryKey: ["pendencies-by-cell"] });

    const newPendencyId = created?.id;

    // Insere itens da checklist apenas para pendências externas
    const cleanItems = tipo === "externa"
      ? items.map((it, idx) => ({ ...it, ordem: idx })).filter((it) => it.titulo.trim().length > 0)
      : [];
    if (newPendencyId && cleanItems.length > 0) {
      await supabase.from("pendency_items").insert(
        cleanItems.map((it) => ({
          pendency_id: newPendencyId,
          titulo: it.titulo.trim(),
          descricao: it.descricao.trim() || null,
          ordem: it.ordem,
          created_by: user.id,
        })),
      );
    }

    // Faz upload dos anexos para pendências internas
    if (tipo === "interna" && newPendencyId && attachments.length > 0) {
      for (const file of attachments) {
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${newPendencyId}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("pendency-attachments")
          .upload(path, file, { contentType: file.type || undefined });
        if (upErr) { toast.error(`Falha ao anexar ${file.name}: ${upErr.message}`); continue; }
        await supabase.from("pendency_attachments").insert({
          pendency_id: newPendencyId,
          storage_path: path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || null,
          uploaded_by: user.id,
        });
      }
    }

    // Auto-disparo: pendência interna vira pré-tarefa no GClick automaticamente.
    // O operador NÃO precisa criar nada no GClick — só acompanhar o status depois.
    if (tipo === "interna" && newPendencyId) {
      toast.loading("Sincronizando com GClick...", { id: `gclick-${newPendencyId}` });
      supabase.functions.invoke("gclick-create-task", { body: { pendency_id: newPendencyId } })
        .then(({ data, error: fnErr }) => {
          if (data?.code === "not_configured") {
            toast.warning("Pendência salva. Integração GClick não configurada — configure os secrets em Configurações → Integrações para sincronizar automaticamente.", { id: `gclick-${newPendencyId}`, duration: 8000 });
          } else if (fnErr || !data?.ok) {
            const detail = data?.error || fnErr?.message || "falha ao sincronizar";
            toast.error(`Pendência salva, mas a sincronização com o GClick falhou: ${detail}. Você pode reenviar pela lista de pendências.`, { id: `gclick-${newPendencyId}`, duration: 8000 });
          } else {
            toast.success(`Sincronizada no GClick (${data.instancia})`, { id: `gclick-${newPendencyId}` });
          }
          qc.invalidateQueries({ queryKey: ["pendencies"] });
        });
    }

    // Pendência externa com itens: gera link + código de acesso para o portal do cliente
    if (tipo === "externa" && newPendencyId && cleanItems.length > 0) {
      const { data: tk, error: tkErr } = await supabase.functions.invoke(
        "pendency-token-create",
        { body: { pendencyId: newPendencyId, expiresInDays: 30 } },
      );
      if (!tkErr && tk?.token && tk?.code) {
        const url = `${window.location.origin}/p/${tk.token}`;
        setGeneratedLink({ url, code: tk.code });
        // Não fecha o dialog — usuário precisa copiar
        return;
      } else {
        toast.error("Pendência criada, mas falhou ao gerar link de acesso");
      }
    }

    // reset
    setDocumento(""); setNovoContatoNome(""); setNovoContatoEmail("");
    setMostrandoNovoContato(false);
    setDescricao(""); setPrazo(""); setPrioridade("media"); setCadencia(5);
    setItems([{ titulo: "", descricao: "" }]);
    setAttachments([]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) {
        setGeneratedLink(null);
        setItems([{ titulo: "", descricao: "" }]);
      }
      onOpenChange(o);
    }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        {generatedLink ? (
          <>
            <DialogHeader>
              <DialogTitle>Pendência criada — link do cliente</DialogTitle>
              <DialogDescription>
                Envie o link e o código de acesso ao cliente. O código não pode ser recuperado depois — copie agora.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Link de acesso</Label>
                <div className="flex gap-2">
                  <Input readOnly value={generatedLink.url} className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={() => { navigator.clipboard.writeText(generatedLink.url); toast.success("Link copiado"); }}>Copiar</Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Código de acesso</Label>
                <div className="flex gap-2">
                  <Input readOnly value={generatedLink.code} className="font-mono text-lg tracking-widest text-center" />
                  <Button type="button" variant="outline" onClick={() => { navigator.clipboard.writeText(generatedLink.code); toast.success("Código copiado"); }}>Copiar</Button>
                </div>
              </div>
              <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
                <p className="font-medium">Mensagem sugerida</p>
                <p className="text-muted-foreground">
                  Olá! Para nos enviar os documentos/informações pendentes, acesse:<br />
                  {generatedLink.url}<br />
                  Código de acesso: <span className="font-mono font-semibold">{generatedLink.code}</span>
                </p>
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
                  onClick={() => {
                    const msg = `Olá! Para nos enviar os documentos/informações pendentes, acesse:\n${generatedLink.url}\nCódigo de acesso: ${generatedLink.code}`;
                    navigator.clipboard.writeText(msg);
                    toast.success("Mensagem copiada");
                  }}>Copiar mensagem completa</Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => {
                setGeneratedLink(null);
                setDocumento(""); setNovoContatoNome(""); setNovoContatoEmail("");
                setMostrandoNovoContato(false);
                setDescricao(""); setPrazo(""); setPrioridade("media"); setCadencia(5);
                setItems([{ titulo: "", descricao: "" }]);
                onOpenChange(false);
              }}>Concluir</Button>
            </DialogFooter>
          </>
        ) : (
        <>
        <DialogHeader>
          <DialogTitle>Criar pendência</DialogTitle>
          <DialogDescription>
            {clientName ? `${clientName} — ` : ""}{finalCompetencia ? new Date(finalCompetencia).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Toggle tipo */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setTipo("externa")} className={`p-3 rounded-md border text-sm font-medium transition-colors ${tipo === "externa" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>
              Externa (cliente)
            </button>
            <button type="button" onClick={() => setTipo("interna")} className={`p-3 rounded-md border text-sm font-medium transition-colors ${tipo === "interna" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>
              Interna (outro setor)
            </button>
          </div>

          {tipo === "interna" ? (
            <div className="space-y-1.5">
              <Label>Setor responsável</Label>
              <Select value={setor} onValueChange={(v) => setSetor(v as PendencySetor)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SETOR_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Contato para envio (opcional)</Label>
                  {contacts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setMostrandoNovoContato((v) => !v)}
                      className="text-xs text-primary hover:underline"
                    >
                      {mostrandoNovoContato ? "Escolher existente" : "+ Novo contato"}
                    </button>
                  )}
                </div>

                {!mostrandoNovoContato && contacts.length > 0 ? (
                  <Select value={contatoId} onValueChange={setContatoId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o contato" /></SelectTrigger>
                    <SelectContent>
                      {contacts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome} — {c.email}{c.is_default ? " ★" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="space-y-2 p-3 rounded-md border bg-muted/30">
                    {contacts.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Nenhum contato cadastrado para este cliente. Cadastre um abaixo (ficará salvo na ficha).
                      </p>
                    )}
                    <Input
                      placeholder="Nome (opcional)"
                      value={novoContatoNome}
                      onChange={(e) => setNovoContatoNome(e.target.value)}
                    />
                    <Input
                      type="email"
                      placeholder="email@cliente.com (opcional)"
                      value={novoContatoEmail}
                      onChange={(e) => setNovoContatoEmail(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} placeholder="Resumo geral do que está sendo solicitado" />
          </div>

          {/* Checklist de itens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Itens solicitados</Label>
              <span className="text-[10px] text-muted-foreground">
                {tipo === "externa" ? "Cliente vê e responde cada item" : "Lista de pontos a tratar"}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="rounded-md border p-2 space-y-1.5 bg-muted/20">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-medium text-muted-foreground mt-2 w-5 text-right">{idx + 1}.</span>
                    <div className="flex-1 space-y-1.5">
                      <Input
                        placeholder="Ex.: Extrato bancário Itaú janeiro/2026"
                        value={it.titulo}
                        onChange={(e) => {
                          const next = [...items]; next[idx].titulo = e.target.value; setItems(next);
                        }}
                        className="h-8 text-sm"
                      />
                      <Textarea
                        placeholder="Detalhes (opcional): formato, conta, valor esperado..."
                        value={it.descricao}
                        onChange={(e) => {
                          const next = [...items]; next[idx].descricao = e.target.value; setItems(next);
                        }}
                        rows={1}
                        className="text-xs min-h-[32px]"
                      />
                    </div>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        className="text-xs text-destructive hover:underline mt-2"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setItems([...items, { titulo: "", descricao: "" }])}
                className="text-xs text-primary hover:underline"
              >
                + Adicionar item
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select value={prioridade} onValueChange={(v) => setPrioridade(v as PendencyPrioridade)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORIDADE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={responsavelId} onValueChange={setResponsavelId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || p.user_id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cadência de cobrança (dias)</Label>
              <div className="flex items-center gap-1">
                {[3, 5, 7, 14].map((d) => (
                  <button key={d} type="button" onClick={() => setCadencia(d)} className={`px-2 py-1 text-xs rounded border ${cadencia === d ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>{d}d</button>
                ))}
                <Input type="number" min={1} value={cadencia} onChange={(e) => setCadencia(Math.max(1, parseInt(e.target.value) || 1))} className="w-16 h-8 text-xs" />
              </div>
            </div>
          </div>

          {demandType && (
            <div className="space-y-1.5">
              <Label className="text-xs">Aplicar a</Label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setScope("tipo")} className={`flex-1 p-2 text-xs rounded border ${scope === "tipo" ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
                  Apenas {demandType}
                </button>
                <button type="button" onClick={() => setScope("todo")} className={`flex-1 p-2 text-xs rounded border ${scope === "todo" ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
                  Toda a competência
                </button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Criar pendência"}</Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}

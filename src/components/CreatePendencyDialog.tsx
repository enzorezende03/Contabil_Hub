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

interface Profile { user_id: string; display_name: string | null; }

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
  const [contatoNome, setContatoNome] = useState("");
  const [contatoEmail, setContatoEmail] = useState("");
  const [contatoTelefone, setContatoTelefone] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState<PendencyPrioridade>("media");
  const [prazo, setPrazo] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [scope, setScope] = useState<"tipo" | "todo">(scopeChoice ?? (demandType ? "tipo" : "todo"));
  const [cadencia, setCadencia] = useState(5);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResponsavelId(user?.id ?? "");
    supabase.from("profiles").select("user_id, display_name").order("display_name").then(({ data }) => {
      setProfiles((data || []) as Profile[]);
    });
  }, [open, user?.id]);

  const finalCompetencia = competencia || (month && year ? competenciaFromMonthYear(month, year) : "");

  async function handleSave() {
    if (!user || !finalCompetencia) { toast.error("Faltam dados de contexto"); return; }
    if (!descricao.trim()) { toast.error("Descreva a pendência"); return; }
    if (tipo === "externa" && !documento.trim()) { toast.error("Informe o documento solicitado"); return; }

    setSaving(true);
    const payload: any = {
      client_id: clientId,
      competencia: finalCompetencia,
      demand_type: scope === "tipo" ? (demandType ?? null) : null,
      tipo,
      descricao: descricao.trim(),
      prioridade,
      prazo_resposta: prazo || null,
      responsavel_id: responsavelId || user.id,
      followup_cadence_days: cadencia,
      created_by: user.id,
      status: "aberta",
    };
    if (tipo === "interna") {
      payload.setor_responsavel = setor;
    } else {
      payload.documento_solicitado = documento.trim();
      payload.contato_cliente_nome = contatoNome.trim() || null;
      payload.contato_cliente_email = contatoEmail.trim() || null;
      payload.contato_cliente_telefone = contatoTelefone.trim() || null;
    }

    const { data: created, error } = await supabase.from("pendencies").insert(payload).select("id").maybeSingle();
    setSaving(false);
    if (error) { toast.error(`Erro ao criar pendência: ${error.message}`); return; }

    toast.success("Pendência criada");
    qc.invalidateQueries({ queryKey: ["pendencies"] });
    qc.invalidateQueries({ queryKey: ["pendencies-by-cell"] });

    // Auto-disparo: pendência interna vira tarefa no GClick
    if (tipo === "interna" && created?.id) {
      toast.loading("Enviando ao GClick...", { id: `gclick-${created.id}` });
      supabase.functions.invoke("gclick-create-task", { body: { pendency_id: created.id } })
        .then(({ data, error: fnErr }) => {
          if (fnErr || !data?.ok) {
            toast.error(`GClick: ${data?.error || fnErr?.message || "falha ao criar tarefa"}`, { id: `gclick-${created.id}` });
          } else {
            toast.success(`Tarefa criada no GClick (${data.instancia})`, { id: `gclick-${created.id}` });
          }
          qc.invalidateQueries({ queryKey: ["pendencies"] });
        });
    }

    // reset
    setDocumento(""); setContatoNome(""); setContatoEmail(""); setContatoTelefone("");
    setDescricao(""); setPrazo(""); setPrioridade("media"); setCadencia(5);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
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
                <Label>Documento solicitado *</Label>
                <Input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder='Ex.: Extrato bancário Itaú janeiro/2026' />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Contato (nome)</Label>
                  <Input value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} placeholder='João da Silva (financeiro)' />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <Input value={contatoTelefone} onChange={(e) => setContatoTelefone(e.target.value)} placeholder='(11) 91234-5678' />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>E-mail do contato</Label>
                <Input type="email" value={contatoEmail} onChange={(e) => setContatoEmail(e.target.value)} placeholder='financeiro@cliente.com' />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} placeholder="Detalhe a pendência" />
          </div>

          <div className="grid grid-cols-2 gap-2">
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
            <div className="space-y-1.5">
              <Label>Prazo de resposta</Label>
              <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </div>
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
      </DialogContent>
    </Dialog>
  );
}

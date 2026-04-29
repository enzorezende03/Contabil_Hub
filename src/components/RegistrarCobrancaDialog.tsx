import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, MessageCircle } from "lucide-react";
import { CANAL_LABELS, type PendencyCanal, type Pendency } from "@/lib/pendency-types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pendency: Pendency;
  clientName?: string;
}

export function RegistrarCobrancaDialog({ open, onOpenChange, pendency, clientName }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [canal, setCanal] = useState<PendencyCanal>("email");
  const [descricao, setDescricao] = useState("");
  const [resposta, setResposta] = useState(false);
  const [respostaDesc, setRespostaDesc] = useState("");
  const [novoStatus, setNovoStatus] = useState<"manter" | "aguardando_resposta" | "em_andamento">("manter");
  const [saving, setSaving] = useState(false);

  function buildEmailLink() {
    const to = pendency.contato_cliente_email || "";
    const subject = `Pendência: ${pendency.documento_solicitado || "documento"} - ${clientName || ""}`;
    const body = `Olá ${pendency.contato_cliente_nome || ""},\n\nEstamos aguardando o documento "${pendency.documento_solicitado || ""}" referente à competência ${new Date(pendency.competencia).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}.\n\nPoderia nos enviar?\n\nObrigado,\nEquipe 2M Grupo`;
    return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  function buildWhatsappLink() {
    const phone = (pendency.contato_cliente_telefone || "").replace(/\D/g, "");
    const text = `Olá ${pendency.contato_cliente_nome || ""}! Estamos aguardando o documento "${pendency.documento_solicitado || ""}" referente a ${new Date(pendency.competencia).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}. Poderia nos enviar? Obrigado!`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  async function handleSave() {
    if (!user) return;
    if (!descricao.trim()) { toast.error("Descreva o que foi feito"); return; }
    setSaving(true);
    const { error } = await supabase.from("pendency_communications").insert({
      pendency_id: pendency.id,
      canal,
      descricao: descricao.trim(),
      realizado_por: user.id,
      resposta_recebida: resposta,
      resposta_descricao: resposta ? (respostaDesc.trim() || null) : null,
    });
    if (error) { setSaving(false); toast.error(`Erro: ${error.message}`); return; }

    if (novoStatus !== "manter") {
      await supabase.from("pendencies").update({ status: novoStatus }).eq("id", pendency.id);
    }

    setSaving(false);
    toast.success("Cobrança registrada");
    qc.invalidateQueries({ queryKey: ["pendencies"] });
    qc.invalidateQueries({ queryKey: ["pendency-comms", pendency.id] });
    setDescricao(""); setResposta(false); setRespostaDesc(""); setNovoStatus("manter");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar cobrança</DialogTitle>
          <DialogDescription>{clientName} — {pendency.documento_solicitado || pendency.descricao.slice(0, 60)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {pendency.tipo === "externa" && (
            <div className="flex gap-2">
              <a href={buildEmailLink()} target="_blank" rel="noreferrer" onClick={() => { setCanal("email"); setDescricao((d) => d || `E-mail enviado para ${pendency.contato_cliente_email || pendency.contato_cliente_nome || "contato"}`); }}>
                <Button type="button" variant="outline" size="sm" className="gap-1.5"><Mail className="w-3.5 h-3.5" /> Abrir e-mail</Button>
              </a>
              {pendency.contato_cliente_telefone && (
                <a href={buildWhatsappLink()} target="_blank" rel="noreferrer" onClick={() => { setCanal("whatsapp"); setDescricao((d) => d || `WhatsApp enviado para ${pendency.contato_cliente_nome || pendency.contato_cliente_telefone}`); }}>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> Abrir WhatsApp</Button>
                </a>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Canal</Label>
            <Select value={canal} onValueChange={(v) => setCanal(v as PendencyCanal)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CANAL_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>O que foi feito *</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} placeholder="Mensagem enviada / conteúdo da cobrança" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="resp" checked={resposta} onCheckedChange={(c) => setResposta(!!c)} />
            <Label htmlFor="resp" className="text-sm cursor-pointer">Houve resposta?</Label>
          </div>
          {resposta && (
            <Textarea value={respostaDesc} onChange={(e) => setRespostaDesc(e.target.value)} rows={2} placeholder="Resumo da resposta recebida" />
          )}
          <div className="space-y-1.5">
            <Label>Atualizar status</Label>
            <Select value={novoStatus} onValueChange={(v) => setNovoStatus(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manter">Manter status atual</SelectItem>
                <SelectItem value="aguardando_resposta">Aguardando resposta</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Registrando..." : "Registrar cobrança"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

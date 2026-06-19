import { useState } from "react";
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
import { CANAL_LABELS, type PendencyCanal, type Pendency } from "@/lib/pendency-types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pendency: Pendency;
  clientName?: string;
}

function todayIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function RegistrarContatoExternoDialog({ open, onOpenChange, pendency, clientName }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [canal, setCanal] = useState<PendencyCanal>("whatsapp");
  const [data, setData] = useState(todayIso());
  const [descricao, setDescricao] = useState("Contato realizado fora do sistema.");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!user) return;
    if (!descricao.trim()) {
      toast.error("Descreva o contato");
      return;
    }
    setSaving(true);
    const realizado_em = new Date(`${data}T12:00:00`).toISOString();
    const { error } = await supabase.from("pendency_communications").insert({
      pendency_id: pendency.id,
      canal,
      descricao: descricao.trim(),
      realizado_por: user.id,
      realizado_em,
      resposta_recebida: false,
    });
    setSaving(false);
    if (error) {
      toast.error("Erro: " + error.message);
      return;
    }
    toast.success("Contato externo registrado");
    qc.invalidateQueries({ queryKey: ["pendencies"] });
    qc.invalidateQueries({ queryKey: ["pendency-comms", pendency.id] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar contato externo</DialogTitle>
          <DialogDescription>
            {clientName} — atualize o histórico com uma cobrança feita fora do sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Canal</Label>
              <Select value={canal} onValueChange={(v) => setCanal(v as PendencyCanal)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CANAL_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Data do contato</Label>
              <Input
                type="date"
                value={data}
                max={todayIso()}
                onChange={(e) => setData(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              className="text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Regex pública para detecção de cobrança externa não registrada
export const EXTERNAL_CONTACT_REGEX = /\b(cobrei|liguei|enviei|mandei|falei|contatei|conversei|whats|ligaç)/i;

export function hasExternalContactHint(p: Pick<Pendency, "descricao" | "total_contatos">): boolean {
  if (p.total_contatos > 0) return false;
  if (!p.descricao) return false;
  return EXTERNAL_CONTACT_REGEX.test(p.descricao);
}

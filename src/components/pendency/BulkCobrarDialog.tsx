import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  pendencies: Pendency[];
  clientNameOf: (id: string) => string;
}

export function BulkCobrarDialog({ open, onOpenChange, pendencies, clientNameOf }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [canal, setCanal] = useState<PendencyCanal>("email");
  const [template, setTemplate] = useState(
    "Cobrança enviada em lote sobre documento(s) pendente(s).",
  );
  const [novoStatus, setNovoStatus] = useState<"manter" | "aguardando_resposta" | "em_andamento">(
    "aguardando_resposta",
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!user) return;
    if (!template.trim()) {
      toast.error("Descreva o que foi feito");
      return;
    }
    if (pendencies.length === 0) return;
    setSaving(true);

    let ok = 0;
    let fail = 0;
    // Loop individual (não bulk insert) — registra contato por pendência preservando triggers
    for (const p of pendencies) {
      const descricao = template
        .replace(/\{\{cliente\}\}/g, clientNameOf(p.client_id))
        .replace(/\{\{documento\}\}/g, p.documento_solicitado || "documento");
      const { error } = await supabase.from("pendency_communications").insert({
        pendency_id: p.id,
        canal,
        descricao: descricao.trim(),
        realizado_por: user.id,
        resposta_recebida: false,
      });
      if (error) {
        fail++;
        continue;
      }
      if (novoStatus !== "manter") {
        await supabase.from("pendencies").update({ status: novoStatus }).eq("id", p.id);
      }
      ok++;
    }

    setSaving(false);
    if (ok > 0) toast.success(`${ok} cobrança(s) registrada(s)`);
    if (fail > 0) toast.error(`${fail} falharam`);
    qc.invalidateQueries({ queryKey: ["pendencies"] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cobrar em lote</DialogTitle>
          <DialogDescription>
            Registra a mesma cobrança em {pendencies.length} pendência(s) selecionada(s).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
              <Label className="text-xs">Novo status</Label>
              <Select value={novoStatus} onValueChange={(v) => setNovoStatus(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manter">Manter atual</SelectItem>
                  <SelectItem value="aguardando_resposta">Aguardando resposta</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Mensagem registrada</Label>
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={5}
              className="text-xs"
              placeholder="Use {{cliente}} e {{documento}} para personalizar"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Placeholders: <code>{"{{cliente}}"}</code>, <code>{"{{documento}}"}</code>
            </p>
          </div>

          <div className="rounded-md border bg-muted/30 p-2 max-h-32 overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Aplicar em
            </p>
            <ul className="text-[11px] space-y-0.5">
              {pendencies.slice(0, 20).map((p) => (
                <li key={p.id} className="truncate">
                  • {clientNameOf(p.client_id)} — {p.documento_solicitado || p.descricao.slice(0, 40)}
                </li>
              ))}
              {pendencies.length > 20 && (
                <li className="text-muted-foreground">+ {pendencies.length - 20} outras</li>
              )}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Registrando..." : `Registrar em ${pendencies.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import {
  DEMAND_TYPE_LABELS,
  PRIORITY_LABELS,
  type Demand,
} from "@/lib/types";
import { formatMinutes } from "@/lib/demand-utils";
import { useTeamMembers } from "@/hooks/use-team-members";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Calendar, Clock, User, Flag, FileText, Layers, CalendarDays, Hash } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  demand: Demand | null;
  onChanged?: () => void;
}

const STATUS_OPTS: [string, string][] = [
  ["not_started", "Não iniciada"], ["in_progress", "Em andamento"], ["in_review", "Em revisão"],
  ["waiting_info", "Pausada - aguardando"], ["blocked", "Bloqueada"], ["completed", "Concluída"],
];

export function DemandDetailsDialog({ open, onOpenChange, demand, onChanged }: Props) {
  const { members } = useTeamMembers();
  const { user, profile, isAdmin } = useAuth();
  const canManage = isAdmin || profile?.role === "coordenacao";
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [form, setForm] = useState<any>({});
  const [just, setJust] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMode("view"); setJust("");
    if (demand) setForm({
      client: demand.client, description: demand.description || "", assignee: demand.assignee,
      priority: demand.priority, complexity: demand.complexity, status: demand.status,
      internal_deadline: demand.internalDeadline?.slice(0, 10) || "",
      client_deadline: demand.clientDeadline?.slice(0, 10) || "",
      competencias: demand.competencias.join(", "), types: [...demand.types],
      notes: demand.notes || "", weight: demand.weight ?? 1,
    });
  }, [demand, open]);

  if (!demand) return null;

  const save = async () => {
    if (!form.client.trim()) return toast.error("Informe o cliente.");
    if (form.types.length === 0) return toast.error("Selecione ao menos uma atividade.");
    const comps = form.competencias.split(/[,;\s]+/).map((c: string) => c.trim()).filter(Boolean);
    if (comps.some((c: string) => !/^\d{2}\/\d{4}$/.test(c))) return toast.error("Competências devem estar no formato MM/AAAA.");
    setBusy(true);
    const { error } = await supabase.from("demands").update({
      client: form.client.trim(), description: form.description, assignee: form.assignee,
      priority: form.priority, complexity: form.complexity, status: form.status,
      internal_deadline: form.internal_deadline, client_deadline: form.client_deadline,
      competencias: comps, types: form.types, notes: form.notes, weight: Number(form.weight) || 1,
    }).eq("id", demand.id);
    setBusy(false);
    if (error) return toast.error("Erro ao salvar: " + error.message);
    toast.success("Demanda atualizada.");
    onChanged?.(); onOpenChange(false);
  };

  const remove = async () => {
    if (just.trim().length < 5) return toast.error("Informe uma justificativa (mín. 5 caracteres).");
    setBusy(true);
    const { error: e1 } = await supabase.from("demand_deletions" as any).insert({
      demand_id: demand.id, client: demand.client, snapshot: demand as any,
      justificativa: just.trim().slice(0, 1000), deleted_by: user!.id,
    });
    if (e1) { setBusy(false); return toast.error("Erro ao registrar justificativa: " + e1.message); }
    const { error } = await supabase.from("demands").delete().eq("id", demand.id);
    setBusy(false);
    if (error) return toast.error("Erro ao excluir: " + error.message);
    toast.success("Demanda excluída.");
    onChanged?.(); onOpenChange(false);
  };

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const sel = "h-9 w-full px-3 text-sm border rounded-md bg-card";

  const assigneeName = members.find((m) => m.id === demand.assignee)?.name || "—";
  const fmtDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString("pt-BR") : "—";
  const fmtDateTime = (d?: string) =>
    d ? new Date(d).toLocaleString("pt-BR") : "—";

  const priorityTone =
    demand.priority === "urgente"
      ? "bg-destructive/15 text-destructive"
      : demand.priority === "alta"
        ? "bg-warning/15 text-warning"
        : "bg-muted text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {demand.client}
          </DialogTitle>
        </DialogHeader>

        {canManage && mode === "view" && (
          <div className="flex gap-2 -mt-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMode("edit")}><Pencil className="w-3.5 h-3.5" />Editar</Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setMode("delete")}><Trash2 className="w-3.5 h-3.5" />Excluir</Button>
          </div>
        )}

        {mode === "delete" && (
          <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <Label className="text-xs">Justificativa da exclusão *</Label>
            <Textarea value={just} onChange={(e) => setJust(e.target.value)} maxLength={1000} placeholder="Explique o motivo da exclusão..." />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setMode("view")} disabled={busy}>Cancelar</Button>
              <Button size="sm" variant="destructive" onClick={remove} disabled={busy || just.trim().length < 5}>{busy ? "Excluindo..." : "Confirmar exclusão"}</Button>
            </div>
          </div>
        )}

        {mode === "edit" ? (
          <div className="space-y-3">
            <div><Label className="text-xs">Cliente</Label><Input value={form.client} onChange={(e) => set("client", e.target.value)} /></div>
            <div><Label className="text-xs">Descrição</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
            <div>
              <Label className="text-xs">Atividades</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(Object.entries(DEMAND_TYPE_LABELS) as [any, string][]).map(([k, l]) => {
                  const on = form.types.includes(k);
                  return <button type="button" key={k} onClick={() => set("types", on ? form.types.filter((t: string) => t !== k) : [...form.types, k])}
                    className={`text-[11px] px-2 py-0.5 rounded border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`}>{l}</button>;
                })}
              </div>
            </div>
            <div><Label className="text-xs">Competências (MM/AAAA, separadas por vírgula)</Label><Input value={form.competencias} onChange={(e) => set("competencias", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Responsável</Label>
                <select className={sel} value={form.assignee} onChange={(e) => set("assignee", e.target.value)}>
                  {!members.some((m) => m.id === form.assignee) && <option value={form.assignee}>—</option>}
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select></div>
              <div><Label className="text-xs">Status</Label>
                <select className={sel} value={form.status} onChange={(e) => set("status", e.target.value)}>
                  {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></div>
              <div><Label className="text-xs">Prioridade</Label>
                <select className={sel} value={form.priority} onChange={(e) => set("priority", e.target.value)}>
                  {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l as string}</option>)}
                </select></div>
              <div><Label className="text-xs">Complexidade</Label>
                <select className={sel} value={form.complexity} onChange={(e) => set("complexity", e.target.value)}>
                  <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option>
                </select></div>
              <div><Label className="text-xs">Prazo interno</Label><Input type="date" value={form.internal_deadline} onChange={(e) => set("internal_deadline", e.target.value)} /></div>
              <div><Label className="text-xs">Prazo cliente</Label><Input type="date" value={form.client_deadline} onChange={(e) => set("client_deadline", e.target.value)} /></div>
              <div><Label className="text-xs">Peso</Label><Input type="number" min={1} value={form.weight} onChange={(e) => set("weight", e.target.value)} /></div>
            </div>
            <div><Label className="text-xs">Notas</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="ghost" onClick={() => setMode("view")} disabled={busy}>Cancelar</Button>
              <Button onClick={save} disabled={busy}>{busy ? "Salvando..." : "Salvar alterações"}</Button>
            </div>
          </div>
        ) : (

        <div className="space-y-4">
          {/* Status + prioridade */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={demand.status} />
            <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded ${priorityTone}`}>
              <Flag className="w-3 h-3 inline mr-1" />
              {PRIORITY_LABELS[demand.priority]}
            </span>
          </div>

          {/* Descrição */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <FileText className="w-3.5 h-3.5" />
              Descrição da demanda
            </div>
            <p className="text-sm whitespace-pre-wrap">
              {demand.description?.trim() || <span className="text-muted-foreground italic">Sem descrição informada.</span>}
            </p>
          </div>

          {/* Atividades */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <Layers className="w-3.5 h-3.5" />
              Atividades
            </div>
            <div className="flex flex-wrap gap-1.5">
              {demand.types.map((t) => (
                <span key={t} className="text-[11px] bg-muted px-2 py-0.5 rounded font-medium">
                  {DEMAND_TYPE_LABELS[t]}
                </span>
              ))}
            </div>
          </div>

          {/* Competências */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Competências
            </div>
            <div className="flex flex-wrap gap-1.5">
              {demand.competencias.map((c) => (
                <span key={c} className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Grid de metadados */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
            <Info icon={<User className="w-3.5 h-3.5" />} label="Responsável" value={assigneeName} />
            <Info icon={<Calendar className="w-3.5 h-3.5" />} label="Prazo interno" value={fmtDate(demand.internalDeadline)} />
            <Info icon={<Calendar className="w-3.5 h-3.5" />} label="Prazo cliente" value={fmtDate(demand.clientDeadline)} />
            <Info icon={<Clock className="w-3.5 h-3.5" />} label="Tempo gasto" value={formatMinutes(demand.timeSpentMinutes || 0)} />
            <Info icon={<Flag className="w-3.5 h-3.5" />} label="Complexidade" value={demand.complexity} />
            <Info icon={<Hash className="w-3.5 h-3.5" />} label="Peso" value={String(demand.weight ?? "—")} />
            <Info icon={<Calendar className="w-3.5 h-3.5" />} label="Criada em" value={fmtDateTime(demand.createdAt)} />
            <Info icon={<Hash className="w-3.5 h-3.5" />} label="ID" value={demand.id.slice(0, 8)} mono />
          </div>

          {demand.notes && (
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-xs font-medium text-muted-foreground mb-1">Notas</div>
              <p className="text-sm whitespace-pre-wrap">{demand.notes}</p>
            </div>
          )}
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-0.5">
        {icon}
        {label}
      </div>
      <div className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

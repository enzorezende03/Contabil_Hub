import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { canPerformAction } from "@/hooks/use-action-permissions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DEMAND_TYPE_LABELS, PRIORITY_LABELS, type DemandType, type Priority, type Demand } from "@/lib/types";
import { useTeamMembers } from "@/hooks/use-team-members";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planning: Demand | null;
  onSaved: () => void;
}

const MONTHS = ["01","02","03","04","05","06","07","08","09","10","11","12"];
const MONTH_NAMES: Record<string, string> = {
  "01":"Jan","02":"Fev","03":"Mar","04":"Abr","05":"Mai","06":"Jun",
  "07":"Jul","08":"Ago","09":"Set","10":"Out","11":"Nov","12":"Dez",
};

export function EditPlanningDialog({ open, onOpenChange, planning, onSaved }: Props) {
  const { profile, isAdmin, user } = useAuth();
  const { members: teamMembers } = useTeamMembers();
  const canEditDates = canPerformAction("edit_dates", profile?.role);
  const canEdit = isAdmin || profile?.role === "coordenacao" || planning?.assignee === user?.id;

  const [types, setTypes] = useState<Set<DemandType>>(new Set());
  const [months, setMonths] = useState<Set<string>>(new Set());
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [priority, setPriority] = useState<Priority>("media");
  const [assignee, setAssignee] = useState("");
  const [description, setDescription] = useState("");
  const [internalDeadline, setInternalDeadline] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!planning) return;
    setTypes(new Set(planning.types));
    const ms = new Set<string>();
    let y = String(new Date().getFullYear());
    planning.competencias.forEach((c) => {
      const [m, yr] = c.split("/");
      if (m) ms.add(m);
      if (yr) y = yr;
    });
    setMonths(ms);
    setYear(y);
    setPriority(planning.priority);
    setAssignee(planning.assignee);
    setDescription(planning.description || "");
    setInternalDeadline(planning.internalDeadline);
  }, [planning]);

  if (!planning) return null;

  const toggleType = (t: DemandType) => setTypes((prev) => {
    const n = new Set(prev);
    if (n.has(t)) { if (n.size > 1) n.delete(t); } else n.add(t);
    return n;
  });
  const toggleMonth = (m: string) => setMonths((prev) => {
    const n = new Set(prev);
    if (n.has(m)) n.delete(m); else n.add(m);
    return n;
  });

  const handleSave = async () => {
    if (!canEdit) {
      toast.error("Você não tem permissão para editar este planejamento");
      return;
    }
    if (types.size === 0 || months.size === 0 || !assignee || !internalDeadline) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    setSaving(true);
    const competencias = [...months].sort().map((m) => `${m}/${year}`);
    const { error } = await supabase
      .from("plannings")
      .update({
        types: [...types],
        competencias,
        priority,
        assignee,
        description,
        internal_deadline: internalDeadline,
      })
      .eq("id", planning.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar alterações");
      return;
    }
    toast.success("Planejamento atualizado");
    onSaved();
    onOpenChange(false);
  };

  const handleDelete = async () => {
    const { error } = await supabase.from("plannings").delete().eq("id", planning.id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Planejamento excluído");
    setConfirmDelete(false);
    onSaved();
    onOpenChange(false);
  };

  const selectClass = "h-9 w-full px-3 text-sm border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Planejamento</DialogTitle>
          </DialogHeader>

          {!canEdit && (
            <div className="text-xs text-destructive bg-destructive/10 rounded p-2">
              Você não tem permissão para editar este planejamento.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <Label className="mb-1.5">Empresa</Label>
              <Input value={planning.client} disabled />
            </div>

            <div>
              <Label className="mb-1.5">Atividades *</Label>
              <div className="grid grid-cols-2 gap-1.5 rounded-md border p-2 max-h-40 overflow-y-auto">
                {Object.entries(DEMAND_TYPE_LABELS).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-1.5 cursor-pointer text-xs hover:bg-muted/50 rounded px-1 py-0.5">
                    <Checkbox checked={types.has(k as DemandType)} onCheckedChange={() => toggleType(k as DemandType)} disabled={!canEdit} />
                    <span>{v}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-1.5">Competências *</Label>
              <div className="flex items-center gap-2 mb-1.5">
                <select value={year} onChange={(e) => setYear(e.target.value)} disabled={!canEdit} className="h-8 px-2 text-sm border rounded-md bg-card">
                  {["2026","2025","2024","2023","2022","2021","2020"].map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MONTHS.map((m) => (
                  <button key={m} type="button" disabled={!canEdit} onClick={() => toggleMonth(m)}
                    className={`h-7 w-12 text-xs font-medium rounded transition-colors ${months.has(m) ? "bg-primary text-primary-foreground" : "bg-card border hover:bg-muted"}`}>
                    {MONTH_NAMES[m]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Prioridade *</Label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} disabled={!canEdit} className={selectClass}>
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <Label>Responsável *</Label>
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!canEdit} className={selectClass}>
                  <option value="">Selecione...</option>
                  {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <Label>Prazo Interno *</Label>
                <Input type="date" value={internalDeadline} onChange={(e) => setInternalDeadline(e.target.value)} disabled={!canEdit || !canEditDates} />
                {!canEditDates && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">Seu cargo não tem permissão para alterar datas</p>
                )}
              </div>
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEdit} rows={2} />
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              {canEdit ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4 mr-1" /> Excluir
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
                {canEdit && <Button type="button" onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir planejamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O planejamento de {planning.client} será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

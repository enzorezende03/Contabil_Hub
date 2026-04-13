import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DEMAND_TYPE_LABELS,
  PRIORITY_LABELS,
  type DemandType,
  type Priority,
} from "@/lib/types";
import { TEAM_MEMBERS } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const MONTHS = ["01","02","03","04","05","06","07","08","09","10","11","12"];
const MONTH_NAMES: Record<string, string> = {
  "01":"Janeiro","02":"Fevereiro","03":"Março","04":"Abril",
  "05":"Maio","06":"Junho","07":"Julho","08":"Agosto",
  "09":"Setembro","10":"Outubro","11":"Novembro","12":"Dezembro",
};

export function CreatePlanningDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const now = new Date();
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<DemandType>>(new Set(["lancamentos"]));
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set([String(now.getMonth() + 1).padStart(2, "0")]));
  const [compYear, setCompYear] = useState(String(now.getFullYear()));
  const [priority, setPriority] = useState<Priority>("media");
  const [assignee, setAssignee] = useState("");
  const [description, setDescription] = useState("");
  const [internalDeadline, setInternalDeadline] = useState("");

  const { data: dbClients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("razao_social");
      if (error) throw error;
      return data;
    },
  });

  const toggleClient = (name: string) => {
    setSelectedClients((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const toggleType = (type: DemandType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) { if (next.size > 1) next.delete(type); } else next.add(type);
      return next;
    });
  };

  const toggleMonth = (m: string) => {
    setSelectedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(m)) { if (next.size > 1) next.delete(m); } else next.add(m);
      return next;
    });
  };

  const selectAllClients = () => setSelectedClients(new Set(dbClients.map((c: any) => c.razao_social)));
  const selectAllMonths = () => setSelectedMonths(new Set(MONTHS));
  const selectAllTypes = () => setSelectedTypes(new Set(Object.keys(DEMAND_TYPE_LABELS) as DemandType[]));

  const resetForm = () => {
    setSelectedClients(new Set());
    setSelectedTypes(new Set(["lancamentos"]));
    setSelectedMonths(new Set([String(now.getMonth() + 1).padStart(2, "0")]));
    setCompYear(String(now.getFullYear()));
    setPriority("media");
    setAssignee("");
    setDescription("");
    setInternalDeadline("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedClients.size === 0 || !assignee || !internalDeadline || !user) return;

    const typesArr = [...selectedTypes];
    const competencias = [...selectedMonths].sort().map((m) => `${m}/${compYear}`);
    const desc = description || typesArr.map((t) => DEMAND_TYPE_LABELS[t]).join(", ");

    // Create one planning per client
    const rows = [...selectedClients].map((clientName) => ({
      client: clientName,
      competencias,
      types: typesArr,
      description: desc,
      assignee,
      priority,
      internal_deadline: internalDeadline,
      status: "not_started",
      notes: "",
      created_by: user.id,
    }));

    const { error } = await supabase.from("plannings").insert(rows);

    if (error) {
      toast.error("Erro ao criar planejamento");
      return;
    }

    onCreated();
    resetForm();
    onOpenChange(false);
  };

  const selectClass = "h-9 w-full px-3 text-sm border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Planejamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Multi-select: Empresas */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="mb-0">Empresas *</Label>
              <button type="button" onClick={selectAllClients} className="text-[10px] text-primary hover:underline">
                Selecionar todas
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1 rounded-md border p-2 max-h-36 overflow-y-auto">
              {dbClients.map((c: any) => (
                <label key={c.id} className="flex items-center gap-1.5 cursor-pointer text-xs hover:bg-muted/50 rounded px-1 py-0.5">
                  <Checkbox
                    checked={selectedClients.has(c.razao_social)}
                    onCheckedChange={() => toggleClient(c.razao_social)}
                  />
                  <span>{c.razao_social}</span>
                </label>
              ))}
              {dbClients.length === 0 && (
                <span className="text-xs text-muted-foreground">Nenhum cliente cadastrado</span>
              )}
            </div>
          </div>

          {/* Multi-select: Atividades */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="mb-0">Atividades *</Label>
              <button type="button" onClick={selectAllTypes} className="text-[10px] text-primary hover:underline">
                Selecionar todos
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 rounded-md border p-2 max-h-40 overflow-y-auto">
              {Object.entries(DEMAND_TYPE_LABELS).map(([k, v]) => (
                <label key={k} className="flex items-center gap-1.5 cursor-pointer text-xs hover:bg-muted/50 rounded px-1 py-0.5">
                  <Checkbox
                    checked={selectedTypes.has(k as DemandType)}
                    onCheckedChange={() => toggleType(k as DemandType)}
                  />
                  <span>{v}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Competências */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="mb-0">Competências *</Label>
              <button type="button" onClick={selectAllMonths} className="text-[10px] text-primary hover:underline">
                Selecionar todos
              </button>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <select value={compYear} onChange={(e) => setCompYear(e.target.value)} className="h-8 px-2 text-sm border rounded-md bg-card">
                {["2026","2025","2024","2023","2022","2021","2020","2019","2018"].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MONTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMonth(m)}
                  className={`h-7 w-12 text-xs font-medium rounded transition-colors ${
                    selectedMonths.has(m)
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border hover:bg-muted"
                  }`}
                >
                  {MONTH_NAMES[m].slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Prioridade *</Label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={selectClass}>
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Responsável *</Label>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={selectClass} required>
                <option value="">Selecione...</option>
                {TEAM_MEMBERS.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <Label>Prazo Interno *</Label>
              <Input type="date" value={internalDeadline} onChange={(e) => setInternalDeadline(e.target.value)} required />
            </div>
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição do planejamento..."
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-xs text-muted-foreground">
              {selectedClients.size} empresa{selectedClients.size !== 1 ? "s" : ""} · {selectedTypes.size} atividade{selectedTypes.size > 1 ? "s" : ""} · {selectedMonths.size} mês{selectedMonths.size > 1 ? "es" : ""}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit">Criar Planejamento</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

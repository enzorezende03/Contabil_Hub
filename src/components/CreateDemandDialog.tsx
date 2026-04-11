import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DEMAND_TYPE_LABELS,
  PRIORITY_LABELS,
  type DemandType,
  type Priority,
  type Demand,
} from "@/lib/types";
import { TEAM_MEMBERS } from "@/lib/mock-data";
import { getWeightForType } from "@/lib/demand-utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface CreateDemandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (demand: Demand) => void;
}

const MONTHS = ["01","02","03","04","05","06","07","08","09","10","11","12"];
const MONTH_NAMES: Record<string, string> = {
  "01":"Janeiro","02":"Fevereiro","03":"Março","04":"Abril",
  "05":"Maio","06":"Junho","07":"Julho","08":"Agosto",
  "09":"Setembro","10":"Outubro","11":"Novembro","12":"Dezembro",
};

export function CreateDemandDialog({ open, onOpenChange, onCreated }: CreateDemandDialogProps) {
  const now = new Date();
  const [client, setClient] = useState("");
  const [type, setType] = useState<DemandType>("lancamentos");
  const [compMonth, setCompMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [compYear, setCompYear] = useState(String(now.getFullYear()));
  const [priority, setPriority] = useState<Priority>("media");
  const [assignee, setAssignee] = useState("");
  const [description, setDescription] = useState("");
  const [internalDeadline, setInternalDeadline] = useState("");
  const [clientDeadline, setClientDeadline] = useState("");

  const { data: dbClients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("razao_social");
      if (error) throw error;
      return data;
    },
  });

  const resetForm = () => {
    setClient("");
    setType("lancamentos");
    setCompMonth(String(now.getMonth() + 1).padStart(2, "0"));
    setCompYear(String(now.getFullYear()));
    setPriority("media");
    setAssignee("");
    setDescription("");
    setInternalDeadline("");
    setClientDeadline("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !assignee || !internalDeadline) return;

    const demand: Demand = {
      id: `d-${Date.now()}`,
      client,
      competencia: `${compMonth}/${compYear}`,
      type,
      description: description || DEMAND_TYPE_LABELS[type],
      assignee,
      complexity: "media",
      weight: getWeightForType(type),
      priority,
      internalDeadline,
      clientDeadline: clientDeadline || internalDeadline,
      status: "not_started",
      timeSpentMinutes: 0,
      notes: "",
      isLegacy: false,
      createdAt: new Date().toISOString().split("T")[0],
    };

    onCreated(demand);
    resetForm();
    onOpenChange(false);
  };

  const selectClass = "h-9 w-full px-3 text-sm border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Demanda</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Cliente *</Label>
              <select value={client} onChange={(e) => setClient(e.target.value)} className={selectClass} required>
                <option value="">Selecione...</option>
                {dbClients.map((c: any) => (
                  <option key={c.id} value={c.razao_social}>{c.razao_social}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <Label>Tipo de Demanda *</Label>
              <select value={type} onChange={(e) => setType(e.target.value as DemandType)} className={selectClass}>
                {Object.entries(DEMAND_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Competência (Mês)</Label>
              <select value={compMonth} onChange={(e) => setCompMonth(e.target.value)} className={selectClass}>
                {MONTHS.map((m) => (
                  <option key={m} value={m}>{MONTH_NAMES[m]}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Competência (Ano)</Label>
              <select value={compYear} onChange={(e) => setCompYear(e.target.value)} className={selectClass}>
                {["2026","2025","2024","2023","2022","2021","2020","2019","2018"].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

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

            <div>
              <Label>Prazo Interno *</Label>
              <Input type="date" value={internalDeadline} onChange={(e) => setInternalDeadline(e.target.value)} required />
            </div>
            <div>
              <Label>Prazo Cliente</Label>
              <Input type="date" value={clientDeadline} onChange={(e) => setClientDeadline(e.target.value)} />
            </div>

            <div className="col-span-2">
              <Label>Descrição</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição da demanda..."
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">Criar Demanda</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

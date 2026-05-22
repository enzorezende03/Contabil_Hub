import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { usePersistedFilter } from "@/hooks/use-persisted-filter";
import AppLayout from "@/components/AppLayout";
import { TRIBUTACAO_LABELS, Tributacao, DemandStatus } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, FileCheck, Lock, Send, ShieldCheck, Circle, Loader2, Clock, CheckCircle2, Eye, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

type StatusOption = {
  value: DemandStatus;
  label: string;
  short: string;
  icon: typeof Circle;
  /** Tailwind classes for inactive state (subtle hint of color) */
  base: string;
  /** Tailwind classes when this option is the selected one */
  active: string;
};

const FECHAMENTO_OPTIONS: StatusOption[] = [
  { value: "not_started", label: "Não iniciada", short: "Não iniciada", icon: Circle,
    base: "text-muted-foreground hover:bg-muted",
    active: "bg-slate-200 text-slate-800 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-100" },
  { value: "in_progress", label: "Em andamento", short: "Andamento", icon: Loader2,
    base: "text-yellow-600/70 hover:bg-yellow-500/10",
    active: "bg-yellow-500/20 text-yellow-700 ring-1 ring-yellow-500/40 dark:text-yellow-300" },
  { value: "waiting_info", label: "Aguardando doc.", short: "Aguard.", icon: Clock,
    base: "text-red-600/70 hover:bg-red-500/10",
    active: "bg-red-500/20 text-red-700 ring-1 ring-red-500/40 dark:text-red-300" },
  { value: "completed", label: "Concluída", short: "Concluída", icon: CheckCircle2,
    base: "text-emerald-600/70 hover:bg-emerald-500/10",
    active: "bg-emerald-500/20 text-emerald-700 ring-1 ring-emerald-500/40 dark:text-emerald-300" },
];

const REVISAO_OPTIONS: StatusOption[] = [
  { value: "not_started", label: "Não iniciada", short: "Não iniciada", icon: Circle,
    base: "text-muted-foreground hover:bg-muted",
    active: "bg-slate-200 text-slate-800 ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-100" },
  { value: "in_progress", label: "Em andamento", short: "Andamento", icon: Loader2,
    base: "text-yellow-600/70 hover:bg-yellow-500/10",
    active: "bg-yellow-500/20 text-yellow-700 ring-1 ring-yellow-500/40 dark:text-yellow-300" },
  { value: "in_review", label: "Em revisão", short: "Revisão", icon: Eye,
    base: "text-blue-600/70 hover:bg-blue-500/10",
    active: "bg-blue-500/20 text-blue-700 ring-1 ring-blue-500/40 dark:text-blue-300" },
  { value: "completed", label: "Concluída", short: "Concluída", icon: CheckCircle2,
    base: "text-emerald-600/70 hover:bg-emerald-500/10",
    active: "bg-emerald-500/20 text-emerald-700 ring-1 ring-emerald-500/40 dark:text-emerald-300" },
];

interface StatusPillGroupProps {
  options: StatusOption[];
  value: DemandStatus;
  disabled?: boolean;
  onChange: (v: DemandStatus) => void;
  /** Optional guard: return false to block the change (and show your own toast). */
  beforeChange?: (v: DemandStatus) => boolean;
}

function StatusPillGroup({ options, value, disabled, onChange, beforeChange }: StatusPillGroupProps) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5 transition-opacity",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={opt.label}
            disabled={disabled}
            onClick={() => {
              if (selected) return;
              if (beforeChange && !beforeChange(opt.value)) return;
              onChange(opt.value);
            }}
            className={cn(
              "group inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium",
              "transition-all duration-200 ease-out active:scale-95",
              selected ? cn(opt.active, "shadow-sm scale-[1.02]") : opt.base,
            )}
          >
            <Icon
              className={cn(
                "w-3 h-3 transition-transform",
                selected && opt.value === "in_progress" && "animate-spin",
                selected && opt.value === "completed" && "scale-110",
              )}
            />
            <span className={cn("transition-all", selected ? "max-w-[120px] opacity-100" : "max-w-0 opacity-0 overflow-hidden sm:max-w-[120px] sm:opacity-100")}>
              {opt.short}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface StatusPillBulkProps {
  options: StatusOption[];
  disabled?: boolean;
  onApply: (v: DemandStatus) => void;
}

/** Variant for the "apply to selected months" bar — no permanent selection,
 *  just clickable colored chips that fire the action. */
function StatusPillBulk({ options, disabled, onApply }: StatusPillBulkProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            title={`Aplicar: ${opt.label}`}
            disabled={disabled}
            onClick={() => onApply(opt.value)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium",
              "transition-all duration-150 ease-out active:scale-95 hover:scale-105",
              opt.base,
              "hover:" + opt.active.split(" ")[0],
            )}
          >
            <Icon className="w-3 h-3" />
            <span className="hidden sm:inline">{opt.short}</span>
          </button>
        );
      })}
    </div>
  );
}
import { LiberarRevisaoDialog } from "@/components/LiberarRevisaoDialog";
import { useActionPermissions, canPerformAction } from "@/hooks/use-action-permissions";
import { REVIEW_STATUS_LABEL, REVIEW_STATUS_BADGE, buildCompetenciaDate, type ReviewStatus } from "@/lib/review-utils";
import { CellPendencyIndicator } from "@/components/CellPendencyIndicator";
import { CreatePendencyDialog } from "@/components/CreatePendencyDialog";
import { useActivePendenciesByCell } from "@/hooks/use-pendencies";
import { AlertOctagon } from "lucide-react";


const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const MONTH_SHORT: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};
const MONTH_FULL: Record<string, string> = {
  "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
  "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
  "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro",
};

type CellLevel = "none" | "sem_movimento" | "lancado" | "conc_bancaria" | "conc_contabil" | "disabled" | "lanc_andamento" | "cb_andamento" | "cc_andamento" | "aguardando_doc";

const LEVEL_CONFIG: Record<CellLevel, { bg: string; text: string; label: string }> = {
  none: { bg: "bg-muted/30", text: "text-muted-foreground/40", label: "—" },
  disabled: { bg: "bg-muted/10", text: "text-muted-foreground/20", label: "—" },
  sem_movimento: { bg: "bg-orange-500/20", text: "text-orange-500", label: "SM" },
  aguardando_doc: { bg: "bg-red-500/20", text: "text-red-500", label: "AD" },
  lanc_andamento: { bg: "bg-yellow-500/10", text: "text-yellow-400", label: "L…" },
  lancado: { bg: "bg-yellow-500/20", text: "text-yellow-500", label: "L" },
  cb_andamento: { bg: "bg-blue-500/10", text: "text-blue-400", label: "CB…" },
  conc_bancaria: { bg: "bg-blue-500/20", text: "text-blue-500", label: "CB" },
  cc_andamento: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: "CC…" },
  conc_contabil: { bg: "bg-emerald-500/20", text: "text-emerald-500", label: "CC" },
};

const DEMAND_TYPES_FOR_PANEL = [
  { type: "lancamentos" as const, label: "Lançamentos Contábeis" },
  { type: "conciliacao_bancaria" as const, label: "Conciliação Bancária" },
  { type: "conciliacao_contabil" as const, label: "Conciliação Contábil" },
];

const CLOSING_TYPES = [
  { type: "fechamento" as const, label: "Fechamento Contábil" },
  { type: "revisao" as const, label: "Revisão" },
];

const TRIBUTACAO_LABELS_MAP: Record<string, string> = {
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
  isenta_imune: "Isenta/Imune",
};

/** Piso global do quadro de Fechamento Contábil: clientes com responsabilidade
 *  anterior a esta data não aparecem em quadros antes deste ano. */
const CLOSING_FLOOR_YEAR = 2022;
const CLOSING_FLOOR_MONTH = 1;
const DEMAND_STATUS_UPSERT_BATCH_SIZE = 500;

type DemandStatusUpsertRow = {
  client_name: string;
  month: string;
  year: string;
  demand_type: string;
  status: DemandStatus;
  filled_by: string;
};

async function upsertDemandStatusRows(rows: DemandStatusUpsertRow[]) {
  for (let i = 0; i < rows.length; i += DEMAND_STATUS_UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + DEMAND_STATUS_UPSERT_BATCH_SIZE);
    const { error } = await supabase
      .from("demand_status_entries")
      .upsert(batch, { onConflict: "client_name,month,year,demand_type" });

    if (error) throw error;
  }
}

/** Returns true if the month (MM) in the given year is within responsibility */
function isMonthEnabled(competenciaInicio: string, month: string, year: string): boolean {
  // Aceita: MM/YYYY, YYYY-MM, YYYY-MM-DD
  let startMonth: number | null = null;
  let startYear: number | null = null;

  const raw = (competenciaInicio || "").trim();
  let m = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) {
    startMonth = parseInt(m[1], 10);
    startYear = parseInt(m[2], 10);
  } else if ((m = raw.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/))) {
    startYear = parseInt(m[1], 10);
    startMonth = parseInt(m[2], 10);
  }

  if (!startMonth || !startYear) return true;

  // Aplica o piso: se a responsabilidade começou antes de CLOSING_FLOOR,
  // tratamos como se tivesse começado no piso (clientes antigos já fechados
  // ficam ocultos antes do ano-piso).
  if (startYear < CLOSING_FLOOR_YEAR ||
     (startYear === CLOSING_FLOOR_YEAR && startMonth < CLOSING_FLOOR_MONTH)) {
    startYear = CLOSING_FLOOR_YEAR;
    startMonth = CLOSING_FLOOR_MONTH;
  }

  const currentMonth = parseInt(month, 10);
  const currentYear = parseInt(year, 10);
  if (currentYear > startYear) return true;
  if (currentYear < startYear) return false;
  return currentMonth >= startMonth;
}

export default function CompetenciasPage() {
  const { user, profile } = useAuth();
  const currentYear = new Date().getFullYear().toString();
  const [year, setYear] = usePersistedFilter("competencias", "year", currentYear);
  const [yearConfirmed, setYearConfirmed] = useState(() => sessionStorage.getItem("competencias_year_confirmed") === "true");
  const [selectedClient, setSelectedClient] = usePersistedFilter("competencias", "client", "all");
  const [searchClient, setSearchClient] = useState("");
  const [selectedTributacao, setSelectedTributacao] = usePersistedFilter("competencias", "tributacao", "all");
  const [selectedUnidade, setSelectedUnidade] = usePersistedFilter("competencias", "unidade", "all");
  const [selectedPerfil, setSelectedPerfil] = usePersistedFilter("competencias", "perfil", "all");
  const [selectedFinalStatus, setSelectedFinalStatus] = usePersistedFilter<"all" | "open" | "finalized">("competencias", "finalStatus", "all");
  const [selectedEcd, setSelectedEcd] = usePersistedFilter<"all" | "yes" | "no">("competencias", "ecd", "all");
  const [semMovimento, setSemMovimento] = useState<Set<string>>(new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [panelClient, setPanelClient] = useState<string | null>(null);
  const [demandStatuses, setDemandStatuses] = useState<Record<string, DemandStatus>>({});
  const [filledByMap, setFilledByMap] = useState<Record<string, string>>({});
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  
  const [batchMonths, setBatchMonths] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [liberarDialog, setLiberarDialog] = useState<{ clientName: string; clientId: string; tributacao: string; month: string } | null>(null);
  const [pendencyDialog, setPendencyDialog] = useState<{ clientId: string; clientName: string; month: string } | null>(null);

  useActionPermissions();
  const canLiberar = canPerformAction("liberar_para_revisao", profile?.role);
  const canCreatePendency = canPerformAction("gerenciar_pendencias", profile?.role);

  const { data: pendenciesByCell } = useActivePendenciesByCell(year);

  // Fetch active review submissions for the current year
  const { data: yearSubmissions = [] } = useQuery({
    queryKey: ["review-submissions-year", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_submissions")
        .select("id, client_id, competencia, status, cycle_number, submitted_at")
        .gte("competencia", `${year}-01-01`)
        .lte("competencia", `${year}-12-31`)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data as Array<{ id: string; client_id: string; competencia: string; status: ReviewStatus; cycle_number: number; submitted_at: string }>;
    },
  });

  // Realtime updates for submissions
  useEffect(() => {
    const ch = supabase
      .channel("competencias-submissions-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "review_submissions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["review-submissions-year", year] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient, year]);


  // Fetch clients from DB
  const { data: dbClients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("razao_social");
      if (error) throw error;
      return data;
    },
  });

  // Fetch closing attachments
  const { data: closingAttachments = [] } = useQuery({
    queryKey: ["closing-attachments", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closing_attachments")
        .select("*")
        .eq("year", year);
      if (error) throw error;
      return data;
    },
  });

  const attachmentMap = useMemo(() => {
    const map = new Map<string, { file_name: string; file_path: string }>();
    closingAttachments.forEach((a: any) => {
      map.set(a.client_name, { file_name: a.file_name, file_path: a.file_path });
    });
    return map;
  }, [closingAttachments]);

  const handleUploadAttachment = async (clientName: string, file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const filePath = `${year}/${clientName}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("demonstracoes-contabeis")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from("closing_attachments")
        .upsert({
          client_name: clientName,
          year,
          file_path: filePath,
          file_name: file.name,
          uploaded_by: user.id,
        }, { onConflict: "client_name,year" });
      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ["closing-attachments", year] });
      toast.success("Demonstrações contábeis anexadas com sucesso");
    } catch (e: any) {
      toast.error(`Erro ao enviar arquivo: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Load saved statuses from DB (paginated to bypass 1000-row default limit)
  useEffect(() => {
    const loadStatuses = async () => {
      const pageSize = 1000;
      let from = 0;
      const statuses: Record<string, DemandStatus> = {};
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("demand_status_entries")
          .select("client_name, month, year, demand_type, status")
          .eq("year", year)
          .range(from, from + pageSize - 1);
        if (error || !data) break;
        data.forEach((d: any) => {
          const key = `${d.client_name}|${d.month}|${d.demand_type}`;
          statuses[key] = d.status as DemandStatus;
        });
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setDemandStatuses(statuses);
    };
    loadStatuses();
  }, [year]);

  const setDemandStatus = useCallback(async (client: string, month: string, type: string, status: DemandStatus) => {
    if (!user) return;
    const key = `${client}|${month}|${type}`;
    setDemandStatuses((prev) => ({ ...prev, [key]: status }));

    const { error } = await supabase
      .from("demand_status_entries")
      .upsert({
        client_name: client,
        month,
        year,
        demand_type: type,
        status,
        filled_by: user.id,
      }, { onConflict: "client_name,month,year,demand_type" });

    if (error) {
      toast.error("Erro ao salvar status");
    } else {
      toast.success("Status atualizado");
    }
  }, [user, year]);

  const setBulkStatus = useCallback(async (client: string, months: Set<string>, type: string, status: DemandStatus) => {
    if (!user) return;
    if (months.size === 0) { toast.error("Selecione ao menos um mês"); return; }

    setDemandStatuses((prev) => {
      const next = { ...prev };
      months.forEach((m) => { next[`${client}|${m}|${type}`] = status; });
      return next;
    });

    const rows = [...months].map((m) => ({
      client_name: client,
      month: m,
      year,
      demand_type: type,
      status,
      filled_by: user.id,
    }));

    try {
      await upsertDemandStatusRows(rows);
    } catch (error) {
      console.error("Erro ao salvar status em lote", error);
      toast.error("Erro ao salvar em lote");
      return;
    }

    {
      toast.success(`Status atualizado para ${months.size} meses`);
    }
  }, [user, year]);

  const setMultiClientBulkStatus = useCallback(async (clients: Set<string>, months: Set<string>, type: string, status: DemandStatus) => {
    if (!user) return;
    if (clients.size === 0) { toast.error("Selecione ao menos uma empresa"); return; }
    if (months.size === 0) { toast.error("Selecione ao menos um mês"); return; }

    setDemandStatuses((prev) => {
      const next = { ...prev };
      clients.forEach((client) => {
        months.forEach((m) => { next[`${client}|${m}|${type}`] = status; });
      });
      return next;
    });

    const rows = [...clients].flatMap((client) =>
      [...months].map((m) => ({
        client_name: client,
        month: m,
        year,
        demand_type: type,
        status,
        filled_by: user.id,
      }))
    );

    try {
      await upsertDemandStatusRows(rows);
    } catch (error) {
      console.error("Erro ao salvar status em lote", error);
      toast.error("Erro ao salvar em lote");
      return;
    }

    {
      toast.success(`Status atualizado para ${clients.size} empresa(s) × ${months.size} mês(es)`);
    }
  }, [user, year]);

  const toggleClient = (client: string) => {
    setSelectedClients((prev) => {
      const next = new Set(prev);
      if (next.has(client)) next.delete(client); else next.add(client);
      return next;
    });
  };

  const toggleAllClientsFor = (clientList: string[]) => {
    setSelectedClients((prev) => prev.size === clientList.length ? new Set() : new Set(clientList));
  };

  const toggleBatchMonth = (m: string) => {
    setBatchMonths((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  };

  const toggleAllBatchMonths = () => {
    setBatchMonths((prev) => prev.size === 12 ? new Set() : new Set(MONTHS));
  };

  const toggleMonth = (m: string) => {
    setSelectedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  };

  const toggleAllMonths = () => {
    setSelectedMonths((prev) => prev.size === 12 ? new Set() : new Set(MONTHS));
  };

  const toggleSemMovimento = (client: string, month: string) => {
    const key = `${client}|${month}`;
    setSemMovimento((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Build client list and tributação map from DB
  const clientsMap = useMemo(() => {
    const map: Record<string, { tributacao: string; competencia_inicio: string; unidade: string; perfil: string; obrigatoriedade_ecd: boolean }> = {};
    dbClients.forEach((c: any) => {
      map[c.razao_social] = { tributacao: c.tributacao, competencia_inicio: c.competencia_inicio, unidade: c.unidade || "2m_contabilidade", perfil: c.perfil || "standard", obrigatoriedade_ecd: !!c.obrigatoriedade_ecd };
    });
    return map;
  }, [dbClients]);

  const allClientNames = useMemo(() => Object.keys(clientsMap).sort(), [clientsMap]);
  const allTributacoes = useMemo(() => {
    const set = new Set<string>();
    allClientNames.forEach((c) => { const t = clientsMap[c]?.tributacao; if (t) set.add(t); });
    return [...set].sort();
  }, [allClientNames, clientsMap]);

  const markFullClosingCompleted = useCallback(async (clientsSet: Set<string>) => {
    if (!user) return;
    if (clientsSet.size === 0) { toast.error("Selecione ao menos uma empresa"); return; }
    if (!confirm(`Marcar fechamento contábil COMPLETO (todos os meses + fechamento + revisão) como CONCLUÍDO para ${clientsSet.size} empresa(s) em ${year}?`)) return;

    const monthlyTypes = ["lancamentos", "conciliacao_bancaria", "conciliacao_contabil"];
    const closingTypes = ["fechamento", "revisao"];
    const rows: any[] = [];
    const localUpdates: Record<string, DemandStatus> = {};

    clientsSet.forEach((client) => {
      const compInicio = clientsMap[client]?.competencia_inicio || "01/2000";
      MONTHS.forEach((m) => {
        if (!isMonthEnabled(compInicio, m, year)) return;
        monthlyTypes.forEach((t) => {
          rows.push({ client_name: client, month: m, year, demand_type: t, status: "completed", filled_by: user.id });
          localUpdates[`${client}|${m}|${t}`] = "completed";
        });
      });
      closingTypes.forEach((t) => {
        rows.push({ client_name: client, month: "closing", year, demand_type: t, status: "completed", filled_by: user.id });
        localUpdates[`${client}|closing|${t}`] = "completed";
      });
    });

    setDemandStatuses((prev) => ({ ...prev, ...localUpdates }));

    const { error } = await supabase
      .from("demand_status_entries")
      .upsert(rows, { onConflict: "client_name,month,year,demand_type" });

    if (error) {
      toast.error("Erro ao marcar fechamento em lote");
    } else {
      toast.success(`Fechamento ${year} concluído para ${clientsSet.size} empresa(s)`);
      setSelectedClients(new Set());
    }
  }, [user, year, clientsMap]);

  const { clients, matrix } = useMemo(() => {
    let clientSet = [...allClientNames];

    if (selectedClient !== "all") clientSet = clientSet.filter((c) => c === selectedClient);
    const searchTrim = searchClient.trim().toLowerCase();
    if (searchTrim) clientSet = clientSet.filter((c) => c.toLowerCase().includes(searchTrim));
    if (selectedTributacao !== "all") clientSet = clientSet.filter((c) => clientsMap[c]?.tributacao === selectedTributacao);
    if (selectedUnidade !== "all") clientSet = clientSet.filter((c) => clientsMap[c]?.unidade === selectedUnidade);
    if (selectedPerfil !== "all") clientSet = clientSet.filter((c) => clientsMap[c]?.perfil === selectedPerfil);
    if (selectedEcd !== "all") clientSet = clientSet.filter((c) => !!clientsMap[c]?.obrigatoriedade_ecd === (selectedEcd === "yes"));

    const matrix: Record<string, Record<string, CellLevel>> = {};

    clientSet.forEach((client) => {
      matrix[client] = {};
      const compInicio = clientsMap[client]?.competencia_inicio || "01/2000";
      MONTHS.forEach((m) => {
        if (!isMonthEnabled(compInicio, m, year)) {
          matrix[client][m] = "disabled";
          return;
        }
        const key = `${client}|${m}`;
        if (semMovimento.has(key)) {
          matrix[client][m] = "sem_movimento";
          return;
        }
        // Check statuses from DB
        const lancKey = `${client}|${m}|lancamentos`;
        const concBancKey = `${client}|${m}|conciliacao_bancaria`;
        const concContKey = `${client}|${m}|conciliacao_contabil`;
        const lancStatus = demandStatuses[lancKey];
        const concBancStatus = demandStatuses[concBancKey];
        const concContStatus = demandStatuses[concContKey];
        const lancDone = lancStatus === "completed";
        const concBancDone = concBancStatus === "completed";
        const concContDone = concContStatus === "completed";
        const lancStarted = !!lancStatus && lancStatus !== "not_started";
        const concBancStarted = !!concBancStatus && concBancStatus !== "not_started";
        const concContStarted = !!concContStatus && concContStatus !== "not_started";

        // Check if any demand is waiting_info
        const anyWaiting = [lancStatus, concBancStatus, concContStatus].some(s => s === "waiting_info");

        let level: CellLevel = "none";
        if (anyWaiting) level = "aguardando_doc";
        else if (concContDone) level = "conc_contabil";
        else if (concContStarted) level = "cc_andamento";
        else if (concBancDone) level = "conc_bancaria";
        else if (concBancStarted) level = "cb_andamento";
        else if (lancDone) level = "lancado";
        else if (lancStarted) level = "lanc_andamento";
        matrix[client][m] = level;
      });
    });

    // Remove clients where all months are disabled (no responsibility in this year)
    const activeClients = clientSet.filter((client) =>
      MONTHS.some((m) => matrix[client][m] !== "disabled")
    );

    return { clients: activeClients, matrix };
  }, [year, selectedClient, searchClient, selectedTributacao, selectedUnidade, selectedPerfil, selectedEcd, allClientNames, clientsMap, semMovimento, demandStatuses]);

  // Map razao_social -> client UUID for review submissions wiring
  const clientIdByName = useMemo(() => {
    const map: Record<string, string> = {};
    dbClients.forEach((c: any) => { map[c.razao_social] = c.id; });
    return map;
  }, [dbClients]);

  // Submissions indexed by `${clientId}|${MM}` (latest first, since query orders desc)
  const submissionsByClientMonth = useMemo(() => {
    const map: Record<string, typeof yearSubmissions[number][]> = {};
    yearSubmissions.forEach((s) => {
      const mm = s.competencia.split("-")[1];
      const key = `${s.client_id}|${mm}`;
      (map[key] = map[key] || []).push(s);
    });
    return map;
  }, [yearSubmissions]);

  const getActiveSubmission = useCallback((clientName: string, monthMM: string) => {
    const cid = clientIdByName[clientName];
    if (!cid) return null;
    const list = submissionsByClientMonth[`${cid}|${monthMM}`] || [];
    return list.find((s) => s.status === "aguardando" || s.status === "em_revisao") || null;
  }, [clientIdByName, submissionsByClientMonth]);

  const getLatestSubmission = useCallback((clientName: string, monthMM: string) => {
    const cid = clientIdByName[clientName];
    if (!cid) return null;
    const list = submissionsByClientMonth[`${cid}|${monthMM}`] || [];
    return list[0] || null;
  }, [clientIdByName, submissionsByClientMonth]);

  const panelData = useMemo(() => {
    if (!panelClient) return null;
    const info = clientsMap[panelClient];
    return { client: panelClient, tributacao: info?.tributacao, unidade: info?.unidade, competencia_inicio: info?.competencia_inicio || "01/2000" };
  }, [panelClient, clientsMap]);

  const totalClients = clients.length;
  const totalCells = clients.reduce((acc, c) =>
    acc + MONTHS.reduce((a, m) => a + (matrix[c][m] !== "disabled" ? 1 : 0), 0), 0
  );
  const doneCells = clients.reduce((acc, c) =>
    acc + MONTHS.reduce((a, m) => a + (matrix[c][m] === "conc_contabil" ? 1 : 0), 0), 0
  );
  const pctDone = totalCells > 0 ? Math.round((doneCells / totalCells) * 100) : 0;

  // Manual override: marks client as finalized regardless of step completion
  const isManuallyFinalized = useCallback((client: string) => {
    return demandStatuses[`${client}|closing|manual_finalized`] === "completed";
  }, [demandStatuses]);

  // Check if a client is fully finalized
  const isClientFinalized = useCallback((client: string) => {
    if (isManuallyFinalized(client)) return true;
    // All months must be conc_contabil, disabled, or sem_movimento
    const allMonthsDone = MONTHS.every((m) => {
      const level = matrix[client]?.[m];
      return level === "conc_contabil" || level === "disabled" || level === "sem_movimento";
    });
    // Fechamento and revisão must be completed
    const fechamentoDone = demandStatuses[`${client}|closing|fechamento`] === "completed";
    const revisaoDone = demandStatuses[`${client}|closing|revisao`] === "completed";
    // Attachment must exist
    const hasAttachment = attachmentMap.has(client);
    return allMonthsDone && fechamentoDone && revisaoDone && hasAttachment;
  }, [matrix, demandStatuses, attachmentMap, isManuallyFinalized]);

  // Filter visible clients by closing status (does not affect totals)
  const visibleClients = useMemo(() => {
    if (selectedFinalStatus === "all") return clients;
    if (selectedFinalStatus === "open") return clients.filter((c) => !isClientFinalized(c));
    return clients.filter((c) => isClientFinalized(c));
  }, [clients, selectedFinalStatus, isClientFinalized]);

  const setManualFinalized = useCallback(async (clientsSet: Set<string>, finalized: boolean) => {
    if (!user) return;
    if (clientsSet.size === 0) { toast.error("Selecione ao menos uma empresa"); return; }
    const action = finalized ? "marcar como FINALIZADO" : "REABRIR";
    if (!confirm(`Deseja ${action} o fechamento ${year} para ${clientsSet.size} empresa(s)?\n\nEsta ação ignora as etapas pendentes.`)) return;

    const status: DemandStatus = finalized ? "completed" : "not_started";
    const rows = [...clientsSet].map((client) => ({
      client_name: client,
      month: "closing",
      year,
      demand_type: "manual_finalized",
      status,
      filled_by: user.id,
    }));

    setDemandStatuses((prev) => {
      const next = { ...prev };
      clientsSet.forEach((c) => { next[`${c}|closing|manual_finalized`] = status; });
      return next;
    });

    const { error } = await supabase
      .from("demand_status_entries")
      .upsert(rows, { onConflict: "client_name,month,year,demand_type" });

    if (error) {
      toast.error("Erro ao atualizar fechamento manual");
    } else {
      toast.success(finalized ? `Fechamento ${year} finalizado para ${clientsSet.size} empresa(s)` : `Fechamento ${year} reaberto para ${clientsSet.size} empresa(s)`);
      setSelectedClients(new Set());
    }
  }, [user, year]);

  const exportToExcel = useCallback(() => {
    const LEVEL_EXPORT_LABEL: Record<CellLevel, string> = {
      none: "Não Iniciada",
      disabled: "—",
      sem_movimento: "Sem Movimento",
      aguardando_doc: "Aguardando Doc.",
      lanc_andamento: "Lanç. em andamento",
      lancado: "Lançado",
      cb_andamento: "Conc. Banc. em andamento",
      conc_bancaria: "Conc. Bancária",
      cc_andamento: "Conc. Cont. em andamento",
      conc_contabil: "Conc. Contábil",
    };
    const STATUS_LBL: Record<string, string> = {
      not_started: "Não iniciada",
      in_progress: "Em andamento",
      waiting_info: "Aguardando doc.",
      in_review: "Em revisão",
      completed: "Concluída",
    };
    const PERFIL_LBL: Record<string, string> = { vip: "VIP", premium: "Premium", standard: "Standard", basico: "Básico" };
    const UNIDADE_LBL: Record<string, string> = { "2m_contabilidade": "2M Contabilidade", "2m_saude": "2M Saúde" };

    const rows = visibleClients.map((client) => {
      const info = clientsMap[client] || ({} as any);
      const row: Record<string, string> = {
        "Empresa": client,
        "Tributação": TRIBUTACAO_LABELS_MAP[info.tributacao] || info.tributacao || "",
        "Unidade": UNIDADE_LBL[info.unidade] || info.unidade || "",
        "Perfil": PERFIL_LBL[info.perfil] || info.perfil || "",
        "ECD": info.obrigatoriedade_ecd ? "Sim" : "Não",
      };
      MONTHS.forEach((m) => {
        const level = matrix[client]?.[m] || "none";
        row[MONTH_SHORT[m]] = LEVEL_EXPORT_LABEL[level];
      });
      row["Fechamento"] = STATUS_LBL[demandStatuses[`${client}|closing|fechamento`] || "not_started"];
      row["Revisão"] = STATUS_LBL[demandStatuses[`${client}|closing|revisao`] || "not_started"];
      row["Anexo Demonstrações"] = attachmentMap.has(client) ? (attachmentMap.get(client)?.file_name || "Sim") : "—";
      row["Status Final"] = isClientFinalized(client) ? "Finalizado" : "Em aberto";
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    // Auto column widths
    const headers = Object.keys(rows[0] || { Empresa: "" });
    ws["!cols"] = headers.map((h) => ({
      wch: Math.min(40, Math.max(h.length + 2, ...rows.map((r) => String(r[h] || "").length + 2))),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Fechamento ${year}`);
    XLSX.writeFile(wb, `fechamento_contabil_${year}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`Exportadas ${rows.length} empresa(s)`);
  }, [visibleClients, clientsMap, matrix, demandStatuses, attachmentMap, isClientFinalized, year]);

  const selectClass = "h-8 px-3 text-sm border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary";

  const yearOptions = ["2026", "2025", "2024", "2023", "2022"];

  if (!yearConfirmed) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[70vh]">
          <div className="bg-card border rounded-xl p-8 shadow-lg max-w-md w-full text-center space-y-6">
            <div>
              <h2 className="text-xl font-bold text-foreground">Fechamento Contábil</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Selecione o ano de trabalho antes de continuar
              </p>
            </div>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="h-12 w-full px-4 text-lg border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-center font-semibold"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Você está prestes a trabalhar no ano <strong className="text-foreground">{year}</strong>. Confirme para prosseguir.
            </p>
            <button
              onClick={() => { sessionStorage.setItem("competencias_year_confirmed", "true"); setYearConfirmed(true); }}
              className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
            >
              Confirmar e Continuar
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Fechamento Contábil {year}</h1>
              <p className="text-sm text-muted-foreground mt-1">Evolução contábil por empresa e mês</p>
            </div>
            <button
              onClick={exportToExcel}
              className="h-9 px-3 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-sm"
              title="Exportar para Excel respeitando os filtros atuais"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar Excel
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
          <select value={year} onChange={(e) => setYear(e.target.value)} className={`${selectClass} h-8 text-xs px-2 w-[80px] flex-shrink-0`}>
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <input
            type="text"
            value={searchClient}
            onChange={(e) => setSearchClient(e.target.value)}
            placeholder="Buscar empresa..."
            className={`${selectClass} h-8 text-xs px-2 flex-1 min-w-[160px] max-w-[240px]`}
          />
          <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} className={`${selectClass} h-8 text-xs px-2 flex-1 min-w-[140px] max-w-[220px]`}>
            <option value="all">Todas empresas</option>
            {allClientNames.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={selectedTributacao} onChange={(e) => setSelectedTributacao(e.target.value)} className={`${selectClass} h-8 text-xs px-2 w-[140px] flex-shrink-0`}>
            <option value="all">Todas tributações</option>
            {allTributacoes.map((t) => (
              <option key={t} value={t}>{TRIBUTACAO_LABELS_MAP[t] || t}</option>
            ))}
          </select>
          <select value={selectedUnidade} onChange={(e) => setSelectedUnidade(e.target.value)} className={`${selectClass} h-8 text-xs px-2 w-[140px] flex-shrink-0`}>
            <option value="all">Todas unidades</option>
            <option value="2m_contabilidade">2M Contabilidade</option>
            <option value="2m_saude">2M Saúde</option>
          </select>
          <select value={selectedPerfil} onChange={(e) => setSelectedPerfil(e.target.value)} className={`${selectClass} h-8 text-xs px-2 w-[120px] flex-shrink-0`}>
            <option value="all">Todos perfis</option>
            <option value="vip">VIP</option>
            <option value="premium">Premium</option>
            <option value="standard">Standard</option>
            <option value="basico">Básico</option>
          </select>
          <select value={selectedEcd} onChange={(e) => setSelectedEcd(e.target.value as "all" | "yes" | "no")} className={`${selectClass} h-8 text-xs px-2 w-[130px] flex-shrink-0`}>
            <option value="all">Todos (ECD)</option>
            <option value="yes">Obrigados ao ECD</option>
            <option value="no">Sem ECD</option>
          </select>
          <select value={selectedFinalStatus} onChange={(e) => setSelectedFinalStatus(e.target.value as "all" | "open" | "finalized")} className={`${selectClass} h-8 text-xs px-2 w-[150px] flex-shrink-0`}>
            <option value="all">Todas (status)</option>
            <option value="open">Em aberto</option>
            <option value="finalized">Finalizadas</option>
          </select>
        </div>

        {/* Legenda */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {(["none", "lanc_andamento", "lancado", "cb_andamento", "conc_bancaria", "cc_andamento", "conc_contabil", "aguardando_doc", "sem_movimento", "disabled"] as CellLevel[]).map((level) => {
            const cfg = LEVEL_CONFIG[level];
            const labels: Record<CellLevel, string> = {
              none: "Não Iniciada",
              disabled: "Fora resp.",
              sem_movimento: "Sem Mov.",
              aguardando_doc: "Aguard. Doc.",
              lanc_andamento: "Lanç. andamento",
              lancado: "Lançado",
              cb_andamento: "CB andamento",
              conc_bancaria: "Conc. Bancária",
              cc_andamento: "CC andamento",
              conc_contabil: "Conc. Contábil",
            };
            return (
              <div key={level} className="flex items-center gap-1">
                <div className={`w-5 h-5 rounded flex items-center justify-center ${cfg.bg}`}>
                  <span className={`font-semibold text-[8px] ${cfg.text}`}>{cfg.label}</span>
                </div>
                <span className="text-muted-foreground text-[10px]">{labels[level]}</span>
              </div>
            );
          })}
          <div className="ml-auto text-muted-foreground flex items-center gap-3">
            <span>{clients.filter(c => !isClientFinalized(c)).length} em aberto</span>
            <span>·</span>
            <span>{clients.filter(c => isClientFinalized(c)).length} finalizadas</span>
            <span>·</span>
            <span>{totalClients} total · {pctDone}% conciliado</span>
          </div>
        </div>

        {/* Barra de ação em lote */}
        {selectedClients.size > 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Ação em Lote — {selectedClients.size} empresa(s) selecionada(s)</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => markFullClosingCompleted(selectedClients)}
                  className="h-7 px-3 text-[11px] font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1"
                  title="Marca todos os meses, fechamento e revisão como concluídos para as empresas selecionadas"
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  Marcar fechamento {year} concluído
                </button>
                <button
                  onClick={() => setManualFinalized(selectedClients, true)}
                  className="h-7 px-3 text-[11px] font-semibold rounded bg-slate-700 text-white hover:bg-slate-800 transition-colors flex items-center gap-1"
                  title="Marca como finalizado mesmo sem todas as etapas concluídas (útil para anos anteriores)"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Forçar finalizado (sem etapas)
                </button>
                <button
                  onClick={() => setManualFinalized(selectedClients, false)}
                  className="h-7 px-3 text-[11px] font-semibold rounded border border-border bg-card hover:bg-muted transition-colors"
                  title="Remove a marcação manual de finalizado"
                >
                  Reabrir finalizado manual
                </button>
                <button onClick={() => { setSelectedClients(new Set()); setBatchMonths(new Set()); }} className="text-xs text-muted-foreground hover:text-foreground">Limpar seleção</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-muted-foreground mr-1">Meses:</span>
              <button onClick={toggleAllBatchMonths} className="h-6 px-2 text-[10px] font-medium border rounded bg-card hover:bg-muted transition-colors">
                {batchMonths.size === 12 ? "Limpar" : "Todos"}
              </button>
              {MONTHS.map((m) => (
                <button
                  key={m}
                  onClick={() => toggleBatchMonth(m)}
                  className={`h-6 w-9 text-[10px] font-medium rounded transition-colors ${
                    batchMonths.has(m) ? "bg-primary text-primary-foreground" : "bg-card border hover:bg-muted"
                  }`}
                >
                  {MONTH_SHORT[m]}
                </button>
              ))}
            </div>
            {batchMonths.size > 0 && (
              <div className="space-y-2">
                {DEMAND_TYPES_FOR_PANEL.map((dt) => (
                  <div key={dt.type} className="flex items-center gap-2">
                    <span className="text-xs flex-1">{dt.label}</span>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          setMultiClientBulkStatus(selectedClients, batchMonths, dt.type, e.target.value as DemandStatus);
                          e.target.value = "";
                        }
                      }}
                      className="h-7 px-2 text-[11px] border rounded bg-card focus:outline-none focus:ring-1 focus:ring-primary min-w-[140px]"
                    >
                      <option value="" disabled>Aplicar status...</option>
                      <option value="not_started">Não Iniciada</option>
                      <option value="in_progress">Em Andamento</option>
                      <option value="waiting_info">Aguardando Doc.</option>
                      <option value="completed">Concluída</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Matriz */}
        {visibleClients.length > 0 ? (
          <div className="rounded-lg border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-2 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={selectedClients.size === visibleClients.length && visibleClients.length > 0}
                      onChange={() => toggleAllClientsFor(visibleClients)}
                      className="rounded border-border"
                    />
                  </th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground sticky left-0 bg-muted/50 z-10 w-[220px] max-w-[220px]">
                    Empresa
                  </th>
                  <th className="text-left px-1 py-2 font-medium text-muted-foreground text-xs w-[40px]">Un.</th>
                  <th className="text-left px-1 py-2 font-medium text-muted-foreground text-xs w-[60px]">Perfil</th>
                  <th className="text-left px-1 py-2 font-medium text-muted-foreground text-xs w-[32px]">Trib.</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="text-center px-1 py-2 font-medium text-muted-foreground min-w-[44px]">
                      {MONTH_SHORT[m]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleClients.map((client) => {
                  const tribShort: Record<string, string> = { simples_nacional: "SN", lucro_presumido: "LP", lucro_real: "LR", isenta_imune: "II" };
                  const tribLabel = tribShort[clientsMap[client]?.tributacao] || "—";
                  const unidade = clientsMap[client]?.unidade || "2m_contabilidade";
                  const unidadeLabel = unidade === "2m_saude" ? "2MS" : "2MC";
                  const perfil = clientsMap[client]?.perfil || "standard";
                  const perfilLabels: Record<string, string> = { vip: "VIP", premium: "Premium", standard: "Standard", basico: "Básico" };
                  const perfilColors: Record<string, string> = { vip: "bg-yellow-500/15 text-yellow-600", premium: "bg-purple-500/15 text-purple-600", standard: "bg-blue-500/15 text-blue-600", basico: "bg-gray-500/15 text-gray-600" };
                  const finalized = isClientFinalized(client);
                  return (
                    <tr key={client} className={`${finalized ? "bg-muted/40 text-muted-foreground opacity-60 grayscale" : selectedClients.has(client) ? "bg-primary/5" : "hover:bg-muted/20"}`}>
                      <td className="px-2 py-2 w-8">
                        <input
                          type="checkbox"
                          checked={selectedClients.has(client)}
                          onChange={() => toggleClient(client)}
                          className="rounded border-border"
                        />
                      </td>
                      <td
                        className={`px-2 py-2 font-medium text-xs whitespace-nowrap overflow-hidden text-ellipsis sticky left-0 z-10 cursor-pointer transition-colors w-[220px] max-w-[220px] ${finalized ? "bg-muted/40 text-muted-foreground hover:text-foreground" : "bg-card hover:text-primary"}`}
                        onClick={() => setPanelClient(client)}
                        title={finalized ? `${client} — 🔒 Fechamento concluído (desativada)` : client}
                      >
                        <span className="flex items-center gap-1">
                          {finalized && <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                          <span className="truncate">{client}</span>
                        </span>
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${
                          unidade === "2m_saude" ? "bg-emerald-500/15 text-emerald-600" : "bg-blue-500/15 text-blue-600"
                        }`}>
                          {unidadeLabel}
                        </span>
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${perfilColors[perfil] || perfilColors.standard}`}>
                          {perfilLabels[perfil] || perfil}
                        </span>
                      </td>
                      <td className="px-1 py-2 text-[10px] text-muted-foreground whitespace-nowrap">{tribLabel}</td>
                      {MONTHS.map((m) => {
                        const level = matrix[client][m];
                        const cfg = LEVEL_CONFIG[level];
                        const isDisabled = level === "disabled";
                        const canToggle = !isDisabled && (level === "none" || level === "sem_movimento");
                        
                        const statusLabel: Record<string, string> = {
                          not_started: "Não Iniciada", in_progress: "Em Andamento",
                          waiting_info: "Aguardando Doc.", completed: "Concluída",
                          blocked: "Bloqueada", late: "Em Atraso", in_review: "Em Revisão",
                        };
                        const tooltip = isDisabled
                          ? "Fora da responsabilidade"
                          : `${MONTH_FULL[m]}/${year}\nLançamentos: ${statusLabel[demandStatuses[`${client}|${m}|lancamentos`]] || "Não Iniciada"}\nConc. Bancária: ${statusLabel[demandStatuses[`${client}|${m}|conciliacao_bancaria`]] || "Não Iniciada"}\nConc. Contábil: ${statusLabel[demandStatuses[`${client}|${m}|conciliacao_contabil`]] || "Não Iniciada"}`;
                        const cellClientId = clientIdByName[client];
                        const cellPendencies = cellClientId && pendenciesByCell ? (pendenciesByCell.get(`${cellClientId}|${m}`) || []) : [];
                        return (
                          <td key={m} className="text-center px-1 py-2">
                            <div className="relative mx-auto w-8 h-8">
                              <div
                                className={`w-full h-full rounded flex items-center justify-center ${cfg.bg} ${
                                  isDisabled ? "cursor-not-allowed opacity-40" : canToggle ? "cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all" : ""
                                }`}
                                onClick={canToggle ? () => toggleSemMovimento(client, m) : undefined}
                                title={cellPendencies.length ? `${tooltip}\n\n⚠ ${cellPendencies.length} pendência(s) aberta(s)` : tooltip}
                              >
                                <span className={`font-semibold text-[10px] ${cfg.text}`}>{cfg.label}</span>
                              </div>
                              <CellPendencyIndicator pendencies={cellPendencies} />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-12">Nenhuma empresa encontrada. Cadastre clientes primeiro.</p>
        )}
      </div>

      {/* Modal da empresa */}
      <Dialog open={!!panelClient} onOpenChange={(open) => !open && setPanelClient(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {panelData && (
            <>
              <DialogHeader className="pb-4 border-b">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle className="text-lg">{panelData.client}</DialogTitle>
                    <DialogDescription>
                      {TRIBUTACAO_LABELS_MAP[panelData.tributacao || ""] || "Sem tributação definida"} — {year}
                    </DialogDescription>
                  </div>
                  {canCreatePendency && clientIdByName[panelData.client] && (
                    <button
                      onClick={() => setPendencyDialog({ clientId: clientIdByName[panelData.client], clientName: panelData.client, month: String(new Date().getMonth() + 1).padStart(2, "0") })}
                      className="h-8 px-3 text-xs rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 flex items-center gap-1.5 transition-colors"
                      title="Criar pendência para esta empresa"
                    >
                      <AlertOctagon className="w-3.5 h-3.5" />
                      Criar pendência
                    </button>
                  )}
                </div>
              </DialogHeader>

              <div className="py-4 space-y-4">
                {/* Resumo visual por mês */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Resumo por Mês</h3>
                  <div className="grid grid-cols-6 gap-1.5">
                    {MONTHS.map((m) => {
                      const level = matrix[panelData.client]?.[m] || "none";
                      const cfg = LEVEL_CONFIG[level];
                      const isDisabled = level === "disabled";
                      return (
                        <div key={m} className={`rounded p-1.5 text-center ${cfg.bg} ${isDisabled ? "opacity-40" : ""}`}>
                          <p className="text-[9px] text-muted-foreground">{MONTH_SHORT[m]}</p>
                          <p className={`text-[10px] font-bold ${cfg.text}`}>{cfg.label}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Preenchimento em lote */}
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
                  <h3 className="text-sm font-semibold">Preencher em Lote</h3>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={toggleAllMonths}
                      className="h-6 px-2 text-[10px] font-medium border rounded bg-card hover:bg-muted transition-colors"
                    >
                      {selectedMonths.size === 12 ? "Limpar" : "Todos"}
                    </button>
                    {MONTHS.map((m) => {
                      const monthDisabled = !isMonthEnabled(panelData.competencia_inicio, m, year);
                      return (
                        <button
                          key={m}
                          disabled={monthDisabled}
                          onClick={() => !monthDisabled && toggleMonth(m)}
                          className={`h-6 w-9 text-[10px] font-medium rounded transition-colors ${
                            monthDisabled
                              ? "bg-muted/30 text-muted-foreground/30 cursor-not-allowed"
                              : selectedMonths.has(m)
                              ? "bg-primary text-primary-foreground"
                              : "bg-card border hover:bg-muted"
                          }`}
                        >
                          {MONTH_SHORT[m]}
                        </button>
                      );
                    })}
                  </div>
                  {selectedMonths.size > 0 && (
                    <div className="space-y-2">
                      {DEMAND_TYPES_FOR_PANEL.map((dt) => (
                        <div key={dt.type} className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs flex-1 min-w-[140px]">{dt.label}</span>
                          <StatusPillBulk
                            options={FECHAMENTO_OPTIONS}
                            onApply={(val) => setBulkStatus(panelData.client, selectedMonths, dt.type, val)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Preenchimento por mês */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Preencher por Mês</h3>
                  {MONTHS.map((m) => {
                    const monthDisabled = !isMonthEnabled(panelData.competencia_inicio, m, year);
                    if (monthDisabled) {
                      return (
                        <div key={m} className="rounded-md border bg-muted/10 p-3 opacity-40 cursor-not-allowed">
                          <span className="text-xs font-semibold text-muted-foreground">{MONTH_FULL[m]} — Fora da responsabilidade</span>
                        </div>
                      );
                    }

                    const smKey = `${panelData.client}|${m}`;
                    const isSM = semMovimento.has(smKey);

                    return (
                      <div key={m} className="rounded-md border bg-muted/10 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold">{MONTH_FULL[m]}</span>
                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isSM}
                              onChange={() => toggleSemMovimento(panelData.client, m)}
                              className="rounded border-border accent-orange-500"
                            />
                            <span className="text-[10px] text-orange-500 font-medium">Sem movimento</span>
                          </label>
                        </div>
                        {!isSM && (
                          <div className="space-y-2">
                            {DEMAND_TYPES_FOR_PANEL.map((dt) => {
                              const statusKey = `${panelData.client}|${m}|${dt.type}`;
                              const currentStatus = (demandStatuses[statusKey] || "not_started") as DemandStatus;

                              return (
                                <div key={dt.type} className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs flex-1 min-w-[140px]">{dt.label}</span>
                                  <StatusPillGroup
                                    options={FECHAMENTO_OPTIONS}
                                    value={currentStatus}
                                    onChange={(val) => setDemandStatus(panelData.client, m, dt.type, val)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {!isSM && (() => {
                          const active = getActiveSubmission(panelData.client, m);
                          const latest = getLatestSubmission(panelData.client, m);
                          const monthlyDone = DEMAND_TYPES_FOR_PANEL.every((dt) =>
                            (demandStatuses[`${panelData.client}|${m}|${dt.type}`] || "not_started") === "completed"
                          );
                          const cid = clientIdByName[panelData.client];
                          const trib = clientsMap[panelData.client]?.tributacao || "";
                          const finalizedExercise = isClientFinalized(panelData.client);
                          const showLiberar = canLiberar && !active && !finalizedExercise && cid;

                          if (!active && !latest && !showLiberar) return null;

                          return (
                            <div className="mt-2 pt-2 border-t flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                {active ? (
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${REVIEW_STATUS_BADGE[active.status]}`}>
                                    Revisão: {REVIEW_STATUS_LABEL[active.status]} (#{active.cycle_number})
                                  </span>
                                ) : latest ? (
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${REVIEW_STATUS_BADGE[latest.status]}`}>
                                    Última: {REVIEW_STATUS_LABEL[latest.status]} (#{latest.cycle_number})
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground italic">Sem revisão liberada</span>
                                )}
                              </div>
                              {showLiberar && (
                                <button
                                  onClick={() => {
                                    if (!monthlyDone) {
                                      if (!confirm("Algumas etapas mensais ainda não estão concluídas. Liberar mesmo assim?")) return;
                                    }
                                    setLiberarDialog({ clientName: panelData.client, clientId: cid!, tributacao: trib, month: m });
                                  }}
                                  className="h-6 px-2 text-[10px] font-semibold rounded bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1"
                                  title="Anexar demonstrativos do UNICO SCI e enviar para revisão técnica"
                                >
                                  <Send className="w-3 h-3" /> Liberar p/ revisão
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>

                {/* Encerramento da empresa */}
                <div className="space-y-4 border-t pt-4">
                  <h3 className="text-sm font-semibold">Encerramento do Exercício</h3>

                  {/* Anexo de Demonstrações Contábeis */}
                  <div className="rounded-md border p-3 space-y-2">
                    <span className="text-xs font-semibold">Demonstrações Contábeis</span>
                    {(() => {
                      const attachment = attachmentMap.get(panelData.client);
                      if (attachment) {
                        return (
                          <div className="flex items-center gap-2">
                            <FileCheck className="w-4 h-4 text-emerald-500" />
                            <span className="text-xs text-emerald-600 font-medium truncate flex-1">{attachment.file_name}</span>
                            <button
                              onClick={() => {
                                const { data } = supabase.storage.from("demonstracoes-contabeis").getPublicUrl(attachment.file_path);
                                window.open(data.publicUrl, "_blank");
                              }}
                              className="text-[10px] text-primary hover:underline"
                            >
                              Visualizar
                            </button>
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              className="text-[10px] text-muted-foreground hover:text-foreground"
                            >
                              Substituir
                            </button>
                          </div>
                        );
                      }
                      return (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          className="flex items-center gap-2 w-full h-9 px-3 text-xs border border-dashed rounded-md hover:bg-muted/50 transition-colors text-muted-foreground"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          {uploading ? "Enviando..." : "Anexar demonstrações contábeis"}
                        </button>
                      );
                    })()}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.xlsx,.xls,.doc,.docx,.zip"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && panelData) {
                          handleUploadAttachment(panelData.client, file);
                        }
                        e.target.value = "";
                      }}
                    />
                  </div>

                  {/* Fechamento e Revisão */}
                  {(() => {
                    const hasAttachment = attachmentMap.has(panelData.client);
                    const fechamentoKey = `${panelData.client}|closing|fechamento`;
                    const fechamentoStatus = demandStatuses[fechamentoKey] || "not_started";
                    const fechamentoDone = fechamentoStatus === "completed";
                    const finalized = isClientFinalized(panelData.client);

                    return (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs flex-1 min-w-[120px]">Fechamento Contábil</span>
                          <StatusPillGroup
                            options={FECHAMENTO_OPTIONS}
                            value={fechamentoStatus as DemandStatus}
                            disabled={finalized}
                            beforeChange={(val) => {
                              if (val === "completed" && !hasAttachment) {
                                toast.error("Anexe as demonstrações contábeis antes de concluir o fechamento");
                                return false;
                              }
                              return true;
                            }}
                            onChange={(val) => setDemandStatus(panelData.client, "closing", "fechamento", val)}
                          />
                          {!hasAttachment && (
                            <span className="text-[9px] text-muted-foreground italic w-full sm:w-auto">* Anexo necessário para concluir</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs flex-1 min-w-[120px]">Revisão</span>
                          {!fechamentoDone ? (
                            <span className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                              <Lock className="w-3 h-3" /> Conclua o fechamento primeiro
                            </span>
                          ) : (
                            <StatusPillGroup
                              options={REVISAO_OPTIONS}
                              value={(demandStatuses[`${panelData.client}|closing|revisao`] || "not_started") as DemandStatus}
                              disabled={finalized}
                              onChange={(val) => setDemandStatus(panelData.client, "closing", "revisao", val)}
                            />
                          )}
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t mt-2">
                          {!isManuallyFinalized(panelData.client) ? (
                            <button
                              onClick={() => setManualFinalized(new Set([panelData.client]), true)}
                              className="h-7 px-3 text-[11px] font-semibold rounded bg-slate-700 text-white hover:bg-slate-800 transition-colors flex items-center gap-1"
                              title="Marca como finalizado mesmo sem todas as etapas concluídas"
                            >
                              <Lock className="w-3 h-3" />
                              Forçar finalizado (sem etapas)
                            </button>
                          ) : (
                            <button
                              onClick={() => setManualFinalized(new Set([panelData.client]), false)}
                              className="h-7 px-3 text-[11px] font-semibold rounded border border-border bg-card hover:bg-muted transition-colors"
                            >
                              Reabrir finalizado manual
                            </button>
                          )}
                        </div>

                        {finalized && (
                          <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 p-2 mt-2">
                            <Lock className="w-4 h-4 text-emerald-600" />
                            <span className="text-xs text-emerald-700 font-semibold">
                              {isManuallyFinalized(panelData.client)
                                ? `Finalizado manualmente — Exercício ${year} concluído`
                                : `Escrita finalizada — Exercício ${year} concluído`}
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {liberarDialog && (
        <LiberarRevisaoDialog
          open={!!liberarDialog}
          onOpenChange={(o) => { if (!o) setLiberarDialog(null); }}
          clientName={liberarDialog.clientName}
          clientId={liberarDialog.clientId}
          tributacao={liberarDialog.tributacao}
          year={year}
          defaultMonth={liberarDialog.month}
        />
      )}

      {pendencyDialog && (
        <CreatePendencyDialog
          open={!!pendencyDialog}
          onOpenChange={(o) => { if (!o) setPendencyDialog(null); }}
          clientId={pendencyDialog.clientId}
          clientName={pendencyDialog.clientName}
          month={pendencyDialog.month}
          year={year}
        />
      )}
    </AppLayout>
  );
}

import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from "react";
import { usePersistedFilter } from "@/hooks/use-persisted-filter";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
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
import { CellTriBar } from "@/components/competencias/CellTriBar";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useTeamMembers } from "@/hooks/use-team-members";
import { FecharPeriodoDialog } from "@/components/competencias/FecharPeriodoDialog";


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
function isMonthEnabled(competenciaInicio: string, month: string, year: string, dataFimContrato?: string | null): boolean {
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

  if (startYear < CLOSING_FLOOR_YEAR ||
     (startYear === CLOSING_FLOOR_YEAR && startMonth < CLOSING_FLOOR_MONTH)) {
    startYear = CLOSING_FLOOR_YEAR;
    startMonth = CLOSING_FLOOR_MONTH;
  }

  const currentMonth = parseInt(month, 10);
  const currentYear = parseInt(year, 10);

  // After end of contract → disabled
  if (dataFimContrato) {
    const fim = new Date(dataFimContrato + "T00:00:00");
    const endYear = fim.getFullYear();
    const endMonth = fim.getMonth() + 1;
    if (currentYear > endYear) return false;
    if (currentYear === endYear && currentMonth > endMonth) return false;
  }

  if (currentYear > startYear) return true;
  if (currentYear < startYear) return false;
  return currentMonth >= startMonth;
}

export default function CompetenciasPage() {
  const { user, profile } = useAuth();
  const currentYear = new Date().getFullYear().toString();
  const [year, setYear] = usePersistedFilter("competencias", "year", currentYear);
  const [yearConfirmed, setYearConfirmed] = useState(() => sessionStorage.getItem("competencias_year_confirmed") === "true");
  const [selectedClientsFilterRaw, setSelectedClientsFilter] = usePersistedFilter<string[]>("competencias", "client_multi", []);
  const [searchClient, setSearchClient] = useState("");
  const [selectedTributacaoRaw, setSelectedTributacao] = usePersistedFilter<string[]>("competencias", "tributacao_multi", []);
  const [selectedUnidadeRaw, setSelectedUnidade] = usePersistedFilter<string[]>("competencias", "unidade_multi", []);
  const [selectedPerfilRaw, setSelectedPerfil] = usePersistedFilter<string[]>("competencias", "perfil_multi", []);
  const [selectedFinalStatusRaw, setSelectedFinalStatus] = usePersistedFilter<string[]>("competencias", "finalStatus_multi", []);
  const [selectedEcdRaw, setSelectedEcd] = usePersistedFilter<string[]>("competencias", "ecd_multi", []);
  const selectedClientsFilter = Array.isArray(selectedClientsFilterRaw) ? selectedClientsFilterRaw : [];
  const selectedTributacao = Array.isArray(selectedTributacaoRaw) ? selectedTributacaoRaw : [];
  const selectedUnidade = Array.isArray(selectedUnidadeRaw) ? selectedUnidadeRaw : [];
  const selectedPerfil = Array.isArray(selectedPerfilRaw) ? selectedPerfilRaw : [];
  const selectedFinalStatus = Array.isArray(selectedFinalStatusRaw) ? selectedFinalStatusRaw : [];
  const selectedEcd = Array.isArray(selectedEcdRaw) ? selectedEcdRaw : [];
  const [semMovimento, setSemMovimento] = useState<Set<string>>(new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [panelClient, setPanelClient] = useState<string | null>(null);
  const [demandStatuses, setDemandStatuses] = useState<Record<string, DemandStatus>>({});
  const [cellMeta, setCellMeta] = useState<Record<string, { filledBy?: string; updatedAt?: string }>>({});
  const [filledByMap, setFilledByMap] = useState<Record<string, string>>({});
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  
  const [batchMonths, setBatchMonths] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [liberarDialog, setLiberarDialog] = useState<{ clientName: string; clientId: string; tributacao: string; month: string } | null>(null);
  const [pendencyDialog, setPendencyDialog] = useState<{ clientId: string; clientName: string; month: string } | null>(null);
  const [fecharPeriodoDialog, setFecharPeriodoDialog] = useState<{
    clientId: string; clientName: string; tributacao: string; cadencia: string;
    periodoLabel: string; periodoInicio: string; periodoFim: string;
  } | null>(null);

  useActionPermissions();
  const canLiberar = canPerformAction("liberar_para_revisao", profile?.role);
  const canCreatePendency = canPerformAction("gerenciar_pendencias", profile?.role);

  const { data: pendenciesByCell } = useActivePendenciesByCell(year);
  const { members: teamMembers } = useTeamMembers();
  const teamNameById = useMemo(() => {
    const m: Record<string, string> = {};
    teamMembers.forEach((t) => { m[t.id] = t.name; });
    return m;
  }, [teamMembers]);

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

  type ClosingPeriod = {
    client_id: string; client_name: string; cadencia: string;
    periodo_label: string; periodo_inicio: string; periodo_fim: string;
    meses_esperados: number; meses_completos: number;
    periodo_status: "aprovado" | "em_revisao" | "pronto" | "em_andamento" | "nao_iniciado";
  };
  // Closing periods (v_closing_periods) for the displayed year
  const { data: closingPeriods = [] } = useQuery<ClosingPeriod[]>({
    queryKey: ["v_closing_periods", year],
    queryFn: async () => {
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      const { data, error } = await (supabase as any)
        .from("v_closing_periods")
        .select("client_id, client_name, cadencia, periodo_label, periodo_inicio, periodo_fim, meses_esperados, meses_completos, periodo_status")
        .lte("periodo_inicio", end)
        .gte("periodo_fim", start);
      if (error) { console.error(error); return []; }
      return (data || []) as ClosingPeriod[];
    },
  });

  // Map clientName -> periods
  const periodsByClient = useMemo(() => {
    const m = new Map<string, ClosingPeriod[]>();
    closingPeriods.forEach((p) => {
      const arr = m.get(p.client_name) || [];
      arr.push(p);
      m.set(p.client_name, arr);
    });
    return m;
  }, [closingPeriods]);

  // Count of periods ready to close (status = pronto)
  const periodsReadyCount = useMemo(
    () => closingPeriods.filter((p) => p.periodo_status === "pronto").length,
    [closingPeriods],
  );


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
      const metas: Record<string, { filledBy?: string; updatedAt?: string }> = {};
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("demand_status_entries")
          .select("client_name, month, year, demand_type, status, filled_by, updated_at")
          .eq("year", year)
          .range(from, from + pageSize - 1);
        if (error || !data) break;
        data.forEach((d: any) => {
          const key = `${d.client_name}|${d.month}|${d.demand_type}`;
          statuses[key] = d.status as DemandStatus;
          metas[key] = { filledBy: d.filled_by, updatedAt: d.updated_at };
        });
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setDemandStatuses(statuses);
      setCellMeta(metas);
    };
    loadStatuses();
  }, [year]);

  const setDemandStatus = useCallback(async (client: string, month: string, type: string, status: DemandStatus) => {
    if (!user) return;
    const key = `${client}|${month}|${type}`;
    setDemandStatuses((prev) => ({ ...prev, [key]: status }));
    setCellMeta((prev) => ({ ...prev, [key]: { filledBy: user.id, updatedAt: new Date().toISOString() } }));

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
    setCellMeta((prev) => {
      const next = { ...prev };
      const now = new Date().toISOString();
      months.forEach((m) => { next[`${client}|${m}|${type}`] = { filledBy: user.id, updatedAt: now }; });
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
    const map: Record<string, { tributacao: string; competencia_inicio: string; unidade: string; perfil: string; obrigatoriedade_ecd: boolean; data_fim_contrato: string | null; apelido: string | null; cadencia_fechamento: string }> = {};
    dbClients.forEach((c: any) => {
      map[c.razao_social] = {
        tributacao: c.tributacao,
        competencia_inicio: c.competencia_inicio,
        unidade: c.unidade || "2m_contabilidade",
        perfil: c.perfil || "standard",
        obrigatoriedade_ecd: !!c.obrigatoriedade_ecd,
        data_fim_contrato: c.data_fim_contrato || null,
        apelido: c.apelido || null,
        cadencia_fechamento: c.cadencia_fechamento || "mensal",
      };
    });
    return map;
  }, [dbClients]);

  // Converte razão social para sentence case (preserva acentos, hífens e espaços).
  const toSentenceCase = useCallback((razao: string): string => {
    if (!razao) return "";
    return razao
      .toLowerCase()
      .replace(/(?:^|\s|-)\p{L}/gu, (match) => match.toUpperCase());
  }, []);

  const displayName = useCallback((client: string): string => {
    return toSentenceCase(client);
  }, [toSentenceCase]);

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
    const rows: DemandStatusUpsertRow[] = [];
    const localUpdates: Record<string, DemandStatus> = {};

    clientsSet.forEach((client) => {
      const compInicio = clientsMap[client]?.competencia_inicio || "01/2000";
      const fim = clientsMap[client]?.data_fim_contrato || null;
      MONTHS.forEach((m) => {
        if (!isMonthEnabled(compInicio, m, year, fim)) return;
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

    try {
      await upsertDemandStatusRows(rows);
    } catch (error) {
      console.error("Erro ao marcar fechamento em lote", error);
      toast.error("Erro ao marcar fechamento em lote");
      return;
    }

    {
      toast.success(`Fechamento ${year} concluído para ${clientsSet.size} empresa(s)`);
      setSelectedClients(new Set());
    }
  }, [user, year, clientsMap]);

  const { clients, matrix } = useMemo(() => {
    let clientSet = [...allClientNames];

    if (selectedClientsFilter.length > 0) clientSet = clientSet.filter((c) => selectedClientsFilter.includes(c));
    const searchTrim = searchClient.trim().toLowerCase();
    if (searchTrim) clientSet = clientSet.filter((c) => c.toLowerCase().includes(searchTrim));
    if (selectedTributacao.length > 0) clientSet = clientSet.filter((c) => selectedTributacao.includes(clientsMap[c]?.tributacao));
    if (selectedUnidade.length > 0) clientSet = clientSet.filter((c) => selectedUnidade.includes(clientsMap[c]?.unidade));
    if (selectedPerfil.length > 0) clientSet = clientSet.filter((c) => selectedPerfil.includes(clientsMap[c]?.perfil));
    if (selectedEcd.length > 0 && selectedEcd.length < 2) clientSet = clientSet.filter((c) => !!clientsMap[c]?.obrigatoriedade_ecd === (selectedEcd[0] === "yes"));

    const matrix: Record<string, Record<string, CellLevel>> = {};

    clientSet.forEach((client) => {
      matrix[client] = {};
      const compInicio = clientsMap[client]?.competencia_inicio || "01/2000";
      const fim = clientsMap[client]?.data_fim_contrato || null;
      MONTHS.forEach((m) => {
        if (!isMonthEnabled(compInicio, m, year, fim)) {
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
  }, [year, selectedClientsFilter, searchClient, selectedTributacao, selectedUnidade, selectedPerfil, selectedEcd, allClientNames, clientsMap, semMovimento, demandStatuses]);

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
    return { client: panelClient, tributacao: info?.tributacao, unidade: info?.unidade, competencia_inicio: info?.competencia_inicio || "01/2000", data_fim_contrato: info?.data_fim_contrato || null };
  }, [panelClient, clientsMap]);

  const totalClients = clients.length;
  const totalCells = clients.reduce((acc, c) =>
    acc + MONTHS.reduce((a, m) => a + (matrix[c][m] !== "disabled" ? 1 : 0), 0), 0
  );
  const doneCells = clients.reduce((acc, c) =>
    acc + MONTHS.reduce((a, m) => a + (matrix[c][m] === "conc_contabil" ? 1 : 0), 0), 0
  );
  const pctDone = totalCells > 0 ? Math.round((doneCells / totalCells) * 100) : 0;

  // Current real-world month/year for highlighting
  const nowYear = new Date().getFullYear();
  const nowMonth = new Date().getMonth() + 1;
  const displayedYear = parseInt(year, 10);
  const isDisplayedYearCurrent = displayedYear === nowYear;
  const isCurrentMonth = (m: string) => isDisplayedYearCurrent && parseInt(m, 10) === nowMonth;
  const isFutureMonth = (m: string) =>
    displayedYear > nowYear || (displayedYear === nowYear && parseInt(m, 10) > nowMonth);

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
    if (selectedFinalStatus.length === 0 || selectedFinalStatus.length === 2) return clients;
    if (selectedFinalStatus.includes("open")) return clients.filter((c) => !isClientFinalized(c));
    return clients.filter((c) => isClientFinalized(c));
  }, [clients, selectedFinalStatus, isClientFinalized]);

  const setManualFinalized = useCallback(async (clientsSet: Set<string>, finalized: boolean) => {
    if (!user) return;
    if (clientsSet.size === 0) { toast.error("Selecione ao menos uma empresa"); return; }
    const action = finalized ? "marcar como FINALIZADO" : "REABRIR";
    if (!confirm(`Deseja ${action} o fechamento ${year} para ${clientsSet.size} empresa(s)?\n\nEsta ação ignora as etapas pendentes.`)) return;

    const status: DemandStatus = finalized ? "completed" : "not_started";
    const rows: DemandStatusUpsertRow[] = [...clientsSet].map((client) => ({
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

    try {
      await upsertDemandStatusRows(rows);
    } catch (error) {
      console.error("Erro ao atualizar fechamento manual", error);
      toast.error("Erro ao atualizar fechamento manual");
      return;
    }

    {
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
        "Empresa": displayName(client),
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
              <h1 className="text-2xl font-bold tracking-tight">Fechamento contábil {year}</h1>
              <p className="text-sm text-muted-foreground mt-1">Evolução por empresa e mês</p>
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
          <MultiSelectFilter
            allLabel="Todas empresas"
            options={allClientNames.map((c) => ({ value: c, label: displayName(c) }))}
            value={selectedClientsFilter}
            onChange={setSelectedClientsFilter}
            className="flex-1 min-w-[140px] max-w-[220px]"
          />
          <MultiSelectFilter
            allLabel="Todas tributações"
            options={allTributacoes.map((t) => ({ value: t, label: TRIBUTACAO_LABELS_MAP[t] || t }))}
            value={selectedTributacao}
            onChange={setSelectedTributacao}
            width="140px"
          />
          <MultiSelectFilter
            allLabel="Todas unidades"
            options={[
              { value: "2m_contabilidade", label: "2M Contabilidade" },
              { value: "2m_saude", label: "2M Saúde" },
            ]}
            value={selectedUnidade}
            onChange={setSelectedUnidade}
            width="140px"
          />
          <MultiSelectFilter
            allLabel="Todos perfis"
            options={[
              { value: "vip", label: "VIP" },
              { value: "premium", label: "Premium" },
              { value: "standard", label: "Standard" },
              { value: "basico", label: "Básico" },
            ]}
            value={selectedPerfil}
            onChange={setSelectedPerfil}
            width="120px"
          />
          <MultiSelectFilter
            allLabel="Todos (ECD)"
            options={[
              { value: "yes", label: "Obrigados ao ECD" },
              { value: "no", label: "Sem ECD" },
            ]}
            value={selectedEcd}
            onChange={setSelectedEcd}
            width="130px"
          />
          <MultiSelectFilter
            allLabel="Todas (status)"
            options={[
              { value: "open", label: "Em aberto" },
              { value: "finalized", label: "Finalizadas" },
            ]}
            value={selectedFinalStatus}
            onChange={setSelectedFinalStatus}
            width="150px"
          />
          {(selectedClientsFilter.length + selectedTributacao.length + selectedUnidade.length + selectedPerfil.length + selectedEcd.length + selectedFinalStatus.length > 0 || searchClient.trim().length > 0) && (
            <button
              type="button"
              onClick={() => {
                setSelectedClientsFilter([]);
                setSelectedTributacao([]);
                setSelectedUnidade([]);
                setSelectedPerfil([]);
                setSelectedEcd([]);
                setSelectedFinalStatus([]);
                setSearchClient("");
              }}
              className="h-8 text-xs px-3 rounded-md border border-input bg-background hover:bg-accent/40 flex-shrink-0 text-muted-foreground"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Legenda compacta */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-foreground">Posições:</span>
            <div className="grid grid-cols-3 gap-px w-7 h-[14px] rounded-sm overflow-hidden">
              <div className="bg-muted/60" /><div className="bg-muted/60" /><div className="bg-muted/60" />
            </div>
            <span>Lançamento · Conc. Banc. · Conc. Cont.</span>
          </div>
          <span className="opacity-40">|</span>
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-success" /> Concluído</div>
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-warning/70" /> Em andamento</div>
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-destructive/70" /> Aguard. doc.</div>
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-info/80" /> Em revisão</div>
          <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-muted/50" /> Não iniciado</div>
          <div className="flex items-center gap-1">
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundImage: "repeating-linear-gradient(45deg, hsl(var(--warning) / 0.5) 0 2px, hsl(var(--warning) / 0.15) 2px 4px)" }}
            />
            Sem movimento
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span>{clients.filter(c => !isClientFinalized(c)).length} em aberto</span>
            <span>·</span>
            <span>{clients.filter(c => isClientFinalized(c)).length} finalizadas</span>
            <span>·</span>
            <span className="text-info font-medium">{periodsReadyCount} períodos prontos p/ fechar</span>
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
        {visibleClients.length > 0 && (
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
                    <th
                      key={m}
                      className={`text-center px-1 py-2 font-medium text-muted-foreground min-w-[44px] ${
                        isCurrentMonth(m) ? "bg-primary/10 text-foreground font-semibold" : ""
                      }`}
                    >
                      {MONTH_SHORT[m]}
                    </th>
                  ))}
                  <th className="text-center px-2 py-2 font-medium text-muted-foreground text-xs w-[64px] border-l border-border bg-muted/70">
                    Total
                  </th>
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
                  const eligibleMonths = MONTHS.filter((m) => {
                    const lvl = matrix[client][m];
                    return lvl !== "disabled" && lvl !== "sem_movimento";
                  });
                  const doneMonths = eligibleMonths.filter((m) => matrix[client][m] === "conc_contabil");
                  const rowPct = eligibleMonths.length > 0 ? Math.round((doneMonths.length / eligibleMonths.length) * 100) : 0;
                  const rowPctColor = rowPct >= 80 ? "text-success" : rowPct >= 50 ? "text-warning" : "text-destructive";
                  return (
                  <Fragment key={client}>
                    <tr className={`group transition-colors ${finalized ? "bg-muted/40 text-muted-foreground opacity-60 grayscale" : selectedClients.has(client) ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/30"}`}>
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
                        title={finalized ? `${displayName(client)} — 🔒 Fechamento concluído (desativada)` : displayName(client)}
                      >
                        <span className="flex items-center gap-1">
                          {finalized && <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                          <span className="truncate">{displayName(client)}</span>
                        </span>
                        {(() => {
                          const arr = periodsByClient.get(client) || [];
                          if (!arr.length) return null;
                          const ref = new Date();
                          const refYear = ref.getFullYear();
                          const dispYear = parseInt(year, 10);
                          let p = dispYear === refYear
                            ? arr.find((x) => new Date(x.periodo_inicio) <= ref && new Date(x.periodo_fim) >= ref)
                            : undefined;
                          if (!p) {
                            const past = arr
                              .filter((x) => new Date(x.periodo_fim) < ref)
                              .sort((a, b) => (a.periodo_fim < b.periodo_fim ? 1 : -1));
                            p = past[0] || arr[arr.length - 1];
                          }
                          if (!p) return null;
                          const cad = p.cadencia === "mensal" ? "fech. mensal"
                            : p.cadencia === "trimestral" ? "fech. trimestral"
                            : p.cadencia === "semestral" ? "fech. semestral"
                            : p.cadencia === "anual" ? "fech. anual"
                            : "fech. livre";
                          const stTxt: Record<string, string> = {
                            nao_iniciado: "não iniciado",
                            em_andamento: "em andamento",
                            pronto: "pronto p/ fechar",
                            em_revisao: "em revisão",
                            aprovado: "aprovado",
                          };
                          const stColor: Record<string, string> = {
                            nao_iniciado: "text-muted-foreground",
                            em_andamento: "text-warning",
                            pronto: "text-info",
                            em_revisao: "text-warning",
                            aprovado: "text-success",
                          };
                          return (
                            <span className="block mt-0.5 text-[10px] text-muted-foreground truncate">
                              {cad} · {p.periodo_label} <span className={stColor[p.periodo_status]}>{stTxt[p.periodo_status]}</span>
                            </span>
                          );
                        })()}
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
                          not_started: "Não iniciada", in_progress: "Em andamento",
                          waiting_info: "Aguardando doc.", completed: "Concluída",
                          blocked: "Bloqueada", late: "Em atraso", in_review: "Em revisão",
                        };
                        const cellClientId = clientIdByName[client];
                        const cellPendencies = cellClientId && pendenciesByCell ? (pendenciesByCell.get(`${cellClientId}|${m}`) || []) : [];
                        const triMode: "disabled" | "sem_movimento" | "normal" =
                          isDisabled ? "disabled" : level === "sem_movimento" ? "sem_movimento" : "normal";

                        const tipoRows = [
                          { type: "lancamentos", label: "Lançamento" },
                          { type: "conciliacao_bancaria", label: "Conc. bancária" },
                          { type: "conciliacao_contabil", label: "Conc. contábil" },
                        ] as const;

                        const fmtWhen = (iso?: string) => {
                          if (!iso) return "";
                          try {
                            const d = new Date(iso);
                            return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                          } catch { return ""; }
                        };

                        return (
                          <td
                            key={m}
                            className={`text-center px-1 py-2 ${isCurrentMonth(m) ? "bg-primary/[0.06]" : ""}`}
                          >
                            <div className="relative mx-auto w-7 h-[22px]">
                              <Tooltip delayDuration={400}>
                                <TooltipTrigger asChild>
                                  <div
                                    className={`w-full h-full rounded-sm ${
                                      isDisabled ? "cursor-not-allowed" : canToggle ? "cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all" : "cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
                                    }`}
                                    onClick={
                                      isDisabled
                                        ? undefined
                                        : canToggle
                                        ? () => toggleSemMovimento(client, m)
                                        : () => setPanelClient(client)
                                    }
                                  >
                                    <CellTriBar
                                      mode={triMode}
                                      statuses={{
                                        lancamentos: demandStatuses[`${client}|${m}|lancamentos`],
                                        conciliacao_bancaria: demandStatuses[`${client}|${m}|conciliacao_bancaria`],
                                        conciliacao_contabil: demandStatuses[`${client}|${m}|conciliacao_contabil`],
                                      }}
                                    />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="p-0 max-w-[260px]">
                                  {isDisabled ? (
                                    <div className="px-3 py-2 text-xs">Fora da responsabilidade</div>
                                  ) : (
                                    <div className="text-xs">
                                      <div className="px-3 py-1.5 border-b border-border/60 font-semibold">
                                        {MONTH_FULL[m]}/{year}
                                      </div>
                                      <div className="px-3 py-2 space-y-1.5">
                                        {tipoRows.map((row) => {
                                          const k = `${client}|${m}|${row.type}`;
                                          const st = demandStatuses[k];
                                          const meta = cellMeta[k];
                                          const who = meta?.filledBy ? teamNameById[meta.filledBy] : undefined;
                                          const when = fmtWhen(meta?.updatedAt);
                                          return (
                                            <div key={row.type} className="flex flex-col gap-0.5">
                                              <div className="flex justify-between gap-3">
                                                <span className="text-muted-foreground">{row.label}</span>
                                                <span className="font-medium">{statusLabel[st] || "Não iniciada"}</span>
                                              </div>
                                              {(who || when) && (
                                                <div className="text-[10px] text-muted-foreground">
                                                  {who || "—"}{when ? ` · ${when}` : ""}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      {cellPendencies.length > 0 && (
                                        <div className="px-3 py-1.5 border-t border-border/60 text-destructive font-medium">
                                          ⚠ {cellPendencies.length} pendência(s) aberta(s)
                                        </div>
                                      )}
                                      <div className="px-3 py-1.5 border-t border-border/60 text-[10px] text-muted-foreground">
                                        {canToggle ? "Clique para alternar sem movimento" : "Clique para ver detalhes"}
                                      </div>
                                    </div>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                              <CellPendencyIndicator pendencies={cellPendencies} />
                            </div>
                          </td>
                        );
                      })}
                      <td className="text-center px-2 py-2 border-l border-border bg-muted/30">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[11px] font-semibold tabular-nums ${rowPctColor}`}>{rowPct}%</span>
                          <div className="w-12 h-[3px] rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${rowPct >= 80 ? "bg-success" : rowPct >= 50 ? "bg-warning" : "bg-destructive"}`}
                              style={{ width: `${rowPct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                    {(() => {
                      const arr = periodsByClient.get(client) || [];
                      if (!arr.length) return null;
                      const bandColor = (st: string) =>
                        st === "aprovado" ? "bg-success"
                        : st === "em_revisao" ? "bg-warning"
                        : st === "pronto" ? "bg-info"
                        : st === "em_andamento" ? "bg-muted-foreground/30"
                        : "bg-transparent";
                      return (
                        <tr key={`${client}-band`} aria-hidden="true" className="border-b border-border/40">
                          <td className="p-0" colSpan={5} />
                          {MONTHS.map((m) => {
                            const monthDate = new Date(parseInt(year, 10), parseInt(m, 10) - 1, 15);
                            const p = arr.find((x) => new Date(x.periodo_inicio) <= monthDate && new Date(x.periodo_fim) >= monthDate);
                            const cid = clientIdByName[client];
                            const trib = clientsMap[client]?.tributacao || "";
                            const ready = p?.periodo_status === "pronto" && !!cid;
                            return (
                              <td key={m} className="p-0 align-top">
                                <div
                                  className={`h-[5px] mx-1 rounded-full ${p ? bandColor(p.periodo_status) : "bg-transparent"} ${ready ? "cursor-pointer hover:h-[7px] transition-all" : ""}`}
                                  title={p ? `${p.periodo_label} · ${p.periodo_status.replace("_", " ")}${ready ? " · clique para fechar" : ""}` : ""}
                                  onClick={ready ? () => setFecharPeriodoDialog({
                                    clientId: cid!,
                                    clientName: client,
                                    tributacao: trib,
                                    cadencia: p!.cadencia,
                                    periodoLabel: p!.periodo_label,
                                    periodoInicio: p!.periodo_inicio,
                                    periodoFim: p!.periodo_fim,
                                  }) : undefined}
                                />
                              </td>
                            );
                          })}
                          <td className="p-0" />
                        </tr>
                      );
                    })()}
                  </Fragment>

                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/40">
                <tr>
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2 text-xs font-semibold text-muted-foreground sticky left-0 bg-muted/40 z-10">
                    % conciliado / mês
                  </td>
                  <td colSpan={3} />
                  {MONTHS.map((m) => {
                    const elig = visibleClients.filter((c) => {
                      const lvl = matrix[c][m];
                      return lvl !== "disabled" && lvl !== "sem_movimento";
                    });
                    const done = elig.filter((c) => matrix[c][m] === "conc_contabil").length;
                    const pct = elig.length > 0 ? Math.round((done / elig.length) * 100) : 0;
                    const future = isFutureMonth(m);
                    const current = isCurrentMonth(m);
                    const color = future
                      ? "text-muted-foreground/50"
                      : current
                      ? "text-info"
                      : pct >= 80
                      ? "text-success"
                      : pct >= 50
                      ? "text-warning"
                      : "text-destructive";
                    return (
                      <td
                        key={m}
                        className={`text-center px-1 py-2 text-[11px] font-semibold tabular-nums ${color} ${current ? "bg-primary/[0.06]" : ""}`}
                        title={`${done}/${elig.length} empresas com fechamento mensal completo`}
                      >
                        {elig.length === 0 ? "—" : `${pct}%`}
                      </td>
                    );
                  })}
                  <td className="border-l border-border bg-muted/50" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {periodsReadyCount > 0 && (
          <div className="rounded-lg border border-info/40 bg-info/10 px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-info" />
              <div>
                <p className="text-sm font-semibold">{periodsReadyCount} período(s) prontos para fechar</p>
                <p className="text-[11px] text-muted-foreground">Todas as três tarefas concluídas em todos os meses do período. Revise e libere para revisão.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const ready = [...closingPeriods]
                  .filter((p) => p.periodo_status === "pronto")
                  .sort((a, b) => (a.periodo_fim < b.periodo_fim ? -1 : 1));
                const p = ready[0];
                if (!p) return;
                const trib = clientsMap[p.client_name]?.tributacao || "";
                setFecharPeriodoDialog({
                  clientId: p.client_id,
                  clientName: p.client_name,
                  tributacao: trib,
                  cadencia: p.cadencia,
                  periodoLabel: p.periodo_label,
                  periodoInicio: p.periodo_inicio,
                  periodoFim: p.periodo_fim,
                });
              }}
              className="h-9 px-4 rounded-md bg-info text-info-foreground text-sm font-semibold hover:bg-info/90 transition-colors"
            >
              Fechar período mais antigo
            </button>
          </div>
        )}
        {!visibleClients.length && (
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
                    <DialogTitle className="text-lg">{displayName(panelData.client)}</DialogTitle>
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
                      const monthDisabled = !isMonthEnabled(panelData.competencia_inicio, m, year, panelData.data_fim_contrato);
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
                    const monthDisabled = !isMonthEnabled(panelData.competencia_inicio, m, year, panelData.data_fim_contrato);
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

      {fecharPeriodoDialog && (
        <FecharPeriodoDialog
          open={!!fecharPeriodoDialog}
          onOpenChange={(o) => { if (!o) setFecharPeriodoDialog(null); }}
          clientId={fecharPeriodoDialog.clientId}
          clientName={fecharPeriodoDialog.clientName}
          tributacao={fecharPeriodoDialog.tributacao}
          cadencia={fecharPeriodoDialog.cadencia}
          periodoLabel={fecharPeriodoDialog.periodoLabel}
          periodoInicio={fecharPeriodoDialog.periodoInicio}
          periodoFim={fecharPeriodoDialog.periodoFim}
          demandStatuses={demandStatuses}
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

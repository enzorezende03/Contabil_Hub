import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { usePersistedFilter } from "@/hooks/use-persisted-filter";
import AppLayout from "@/components/AppLayout";
import { TRIBUTACAO_LABELS, Tributacao, DemandStatus } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, FileCheck, Lock } from "lucide-react";

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
};

/** Piso global do quadro de Fechamento Contábil: clientes com responsabilidade
 *  anterior a esta data não aparecem em quadros antes deste ano. */
const CLOSING_FLOOR_YEAR = 2022;
const CLOSING_FLOOR_MONTH = 1;

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
  const { user } = useAuth();
  const currentYear = new Date().getFullYear().toString();
  const [year, setYear] = usePersistedFilter("competencias", "year", currentYear);
  const [yearConfirmed, setYearConfirmed] = useState(() => sessionStorage.getItem("competencias_year_confirmed") === "true");
  const [selectedClient, setSelectedClient] = usePersistedFilter("competencias", "client", "all");
  const [selectedTributacao, setSelectedTributacao] = usePersistedFilter("competencias", "tributacao", "all");
  const [selectedUnidade, setSelectedUnidade] = usePersistedFilter("competencias", "unidade", "all");
  const [selectedPerfil, setSelectedPerfil] = usePersistedFilter("competencias", "perfil", "all");
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

  // Load saved statuses from DB
  useEffect(() => {
    const loadStatuses = async () => {
      const { data } = await supabase
        .from("demand_status_entries")
        .select("client_name, month, year, demand_type, status")
        .eq("year", year);
      if (data) {
        const statuses: Record<string, DemandStatus> = {};
        data.forEach((d: any) => {
          const key = `${d.client_name}|${d.month}|${d.demand_type}`;
          statuses[key] = d.status as DemandStatus;
        });
        setDemandStatuses(statuses);
      }
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

    const { error } = await supabase
      .from("demand_status_entries")
      .upsert(rows, { onConflict: "client_name,month,year,demand_type" });

    if (error) {
      toast.error("Erro ao salvar em lote");
    } else {
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

    const { error } = await supabase
      .from("demand_status_entries")
      .upsert(rows, { onConflict: "client_name,month,year,demand_type" });

    if (error) {
      toast.error("Erro ao salvar em lote");
    } else {
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
    const map: Record<string, { tributacao: string; competencia_inicio: string; unidade: string; perfil: string }> = {};
    dbClients.forEach((c: any) => {
      map[c.razao_social] = { tributacao: c.tributacao, competencia_inicio: c.competencia_inicio, unidade: c.unidade || "2m_contabilidade", perfil: c.perfil || "standard" };
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
    if (selectedTributacao !== "all") clientSet = clientSet.filter((c) => clientsMap[c]?.tributacao === selectedTributacao);
    if (selectedUnidade !== "all") clientSet = clientSet.filter((c) => clientsMap[c]?.unidade === selectedUnidade);
    if (selectedPerfil !== "all") clientSet = clientSet.filter((c) => clientsMap[c]?.perfil === selectedPerfil);

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
  }, [year, selectedClient, selectedTributacao, selectedUnidade, selectedPerfil, allClientNames, clientsMap, semMovimento, demandStatuses]);

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

  // Check if a client is fully finalized
  const isClientFinalized = useCallback((client: string) => {
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
  }, [matrix, demandStatuses, attachmentMap]);

  const selectClass = "h-8 px-3 text-sm border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary";

  const yearOptions = ["2026", "2025", "2024", "2023", "2022", "2021"];

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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Fechamento Contábil {year}</h1>
              <p className="text-sm text-muted-foreground mt-1">Evolução contábil por empresa e mês</p>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          <select value={year} onChange={(e) => setYear(e.target.value)} className={selectClass}>
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} className={selectClass}>
            <option value="all">Todas as empresas</option>
            {allClientNames.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={selectedTributacao} onChange={(e) => setSelectedTributacao(e.target.value)} className={selectClass}>
            <option value="all">Todas as tributações</option>
            {allTributacoes.map((t) => (
              <option key={t} value={t}>{TRIBUTACAO_LABELS_MAP[t] || t}</option>
            ))}
          </select>
          <select value={selectedUnidade} onChange={(e) => setSelectedUnidade(e.target.value)} className={selectClass}>
            <option value="all">Todas as unidades</option>
            <option value="2m_contabilidade">2M Contabilidade</option>
            <option value="2m_saude">2M Saúde</option>
          </select>
          <select value={selectedPerfil} onChange={(e) => setSelectedPerfil(e.target.value)} className={selectClass}>
            <option value="all">Todos os perfis</option>
            <option value="vip">VIP</option>
            <option value="premium">Premium</option>
            <option value="standard">Standard</option>
            <option value="basico">Básico</option>
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
          <div className="ml-auto text-muted-foreground">
            {totalClients} empresas · {pctDone}% conciliado
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
        {clients.length > 0 ? (
          <div className="rounded-lg border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-2 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={selectedClients.size === clients.length && clients.length > 0}
                      onChange={() => toggleAllClientsFor(clients)}
                      className="rounded border-border"
                    />
                  </th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground sticky left-0 bg-muted/50 z-10 w-[140px] max-w-[140px]">
                    Empresa
                  </th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground text-xs">Unidade</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground text-xs">Perfil</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground text-xs">Trib.</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="text-center px-1 py-2 font-medium text-muted-foreground min-w-[44px]">
                      {MONTH_SHORT[m]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clients.map((client) => {
                  const tribShort: Record<string, string> = { simples_nacional: "SN", lucro_presumido: "LP", lucro_real: "LR" };
                  const tribLabel = tribShort[clientsMap[client]?.tributacao] || "—";
                  const unidade = clientsMap[client]?.unidade || "2m_contabilidade";
                  const unidadeLabel = unidade === "2m_saude" ? "2MS" : "2MC";
                  const perfil = clientsMap[client]?.perfil || "standard";
                  const perfilLabels: Record<string, string> = { vip: "VIP", premium: "Premium", standard: "Standard", basico: "Básico" };
                  const perfilColors: Record<string, string> = { vip: "bg-yellow-500/15 text-yellow-600", premium: "bg-purple-500/15 text-purple-600", standard: "bg-blue-500/15 text-blue-600", basico: "bg-gray-500/15 text-gray-600" };
                  const finalized = isClientFinalized(client);
                  return (
                    <tr key={client} className={`${finalized ? "bg-emerald-500/10 opacity-70" : selectedClients.has(client) ? "bg-primary/5" : "hover:bg-muted/20"}`}>
                      <td className="px-2 py-2 w-8">
                        <input
                          type="checkbox"
                          checked={selectedClients.has(client)}
                          onChange={() => toggleClient(client)}
                          className="rounded border-border"
                        />
                      </td>
                      <td
                        className={`px-2 py-2 font-medium text-xs whitespace-nowrap overflow-hidden text-ellipsis sticky left-0 z-10 cursor-pointer hover:text-primary transition-colors w-[140px] max-w-[140px] ${finalized ? "bg-emerald-500/10" : "bg-card"}`}
                        onClick={() => setPanelClient(client)}
                        title={finalized ? `${client} — ✅ Finalizado` : client}
                      >
                        <span className="flex items-center gap-1">
                          {finalized && <Lock className="w-3 h-3 text-emerald-600 flex-shrink-0" />}
                          <span className="truncate">{client}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${
                          unidade === "2m_saude" ? "bg-emerald-500/15 text-emerald-600" : "bg-blue-500/15 text-blue-600"
                        }`}>
                          {unidadeLabel}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${perfilColors[perfil] || perfilColors.standard}`}>
                          {perfilLabels[perfil] || perfil}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-[10px] text-muted-foreground whitespace-nowrap">{tribLabel}</td>
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
                        return (
                          <td key={m} className="text-center px-1 py-2">
                            <div className="relative mx-auto w-8 h-8">
                              <div
                                className={`w-full h-full rounded flex items-center justify-center ${cfg.bg} ${
                                  isDisabled ? "cursor-not-allowed opacity-40" : canToggle ? "cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all" : ""
                                }`}
                                onClick={canToggle ? () => toggleSemMovimento(client, m) : undefined}
                                title={tooltip}
                              >
                                <span className={`font-semibold text-[10px] ${cfg.text}`}>{cfg.label}</span>
                              </div>
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
                <DialogTitle className="text-lg">{panelData.client}</DialogTitle>
                <DialogDescription>
                  {TRIBUTACAO_LABELS_MAP[panelData.tributacao || ""] || "Sem tributação definida"} — {year}
                </DialogDescription>
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
                        <div key={dt.type} className="flex items-center gap-2">
                          <span className="text-xs flex-1">{dt.label}</span>
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                setBulkStatus(panelData.client, selectedMonths, dt.type, e.target.value as DemandStatus);
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
                              const currentStatus = demandStatuses[statusKey] || "not_started";

                              return (
                                <div key={dt.type} className="flex items-center gap-2">
                                  <span className="text-xs flex-1">{dt.label}</span>
                                  <select
                                    value={currentStatus}
                                    onChange={(e) => setDemandStatus(panelData.client, m, dt.type, e.target.value as DemandStatus)}
                                    className="h-7 px-2 text-[11px] border rounded bg-card focus:outline-none focus:ring-1 focus:ring-primary min-w-[140px]"
                                  >
                                    <option value="not_started">Não Iniciada</option>
                                    <option value="in_progress">Em Andamento</option>
                                    <option value="waiting_info">Aguardando Doc.</option>
                                    <option value="completed">Concluída</option>
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        )}
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
                        <div className="flex items-center gap-2">
                          <span className="text-xs flex-1">Fechamento Contábil</span>
                          <select
                            value={fechamentoStatus}
                            disabled={finalized}
                            onChange={(e) => {
                              const val = e.target.value as DemandStatus;
                              if (val === "completed" && !hasAttachment) {
                                toast.error("Anexe as demonstrações contábeis antes de concluir o fechamento");
                                return;
                              }
                              setDemandStatus(panelData.client, "closing", "fechamento", val);
                            }}
                            className="h-7 px-2 text-[11px] border rounded bg-card focus:outline-none focus:ring-1 focus:ring-primary min-w-[140px] disabled:opacity-50"
                          >
                            <option value="not_started">Não Iniciada</option>
                            <option value="in_progress">Em Andamento</option>
                            <option value="waiting_info">Aguardando Doc.</option>
                            <option value="completed">Concluída</option>
                          </select>
                          {!hasAttachment && (
                            <span className="text-[9px] text-muted-foreground italic">* Anexo necessário para concluir</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs flex-1">Revisão</span>
                          {!fechamentoDone ? (
                            <span className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                              <Lock className="w-3 h-3" /> Conclua o fechamento primeiro
                            </span>
                          ) : (
                            <select
                              value={demandStatuses[`${panelData.client}|closing|revisao`] || "not_started"}
                              disabled={finalized}
                              onChange={(e) => setDemandStatus(panelData.client, "closing", "revisao", e.target.value as DemandStatus)}
                              className="h-7 px-2 text-[11px] border rounded bg-card focus:outline-none focus:ring-1 focus:ring-primary min-w-[140px] disabled:opacity-50"
                            >
                              <option value="not_started">Não Iniciada</option>
                              <option value="in_progress">Em Andamento</option>
                              <option value="in_review">Em Revisão</option>
                              <option value="completed">Concluída</option>
                            </select>
                          )}
                        </div>

                        {finalized && (
                          <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 p-2 mt-2">
                            <Lock className="w-4 h-4 text-emerald-600" />
                            <span className="text-xs text-emerald-700 font-semibold">Escrita finalizada — Exercício {year} concluído</span>
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
    </AppLayout>
  );
}

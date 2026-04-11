import { useState, useMemo, useCallback, useEffect } from "react";
import { usePersistedFilter } from "@/hooks/use-persisted-filter";
import AppLayout from "@/components/AppLayout";
import { TRIBUTACAO_LABELS, Tributacao, DemandStatus } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";

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

/** Returns true if the month (MM) in the given year is within responsibility */
function isMonthEnabled(competenciaInicio: string, month: string, year: string): boolean {
  // competenciaInicio format: MM/YYYY
  const parts = competenciaInicio.split("/");
  if (parts.length !== 2) return true;
  const startMonth = parseInt(parts[0], 10);
  const startYear = parseInt(parts[1], 10);
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
  const [selectedClient, setSelectedClient] = usePersistedFilter("competencias", "client", "all");
  const [selectedTributacao, setSelectedTributacao] = usePersistedFilter("competencias", "tributacao", "all");
  const [selectedUnidade, setSelectedUnidade] = usePersistedFilter("competencias", "unidade", "all");
  const [semMovimento, setSemMovimento] = useState<Set<string>>(new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [panelClient, setPanelClient] = useState<string | null>(null);
  const [demandStatuses, setDemandStatuses] = useState<Record<string, DemandStatus>>({});
  const [filledByMap, setFilledByMap] = useState<Record<string, string>>({});

  // Fetch clients from DB
  const { data: dbClients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("razao_social");
      if (error) throw error;
      return data;
    },
  });

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
    const map: Record<string, { tributacao: string; competencia_inicio: string; unidade: string }> = {};
    dbClients.forEach((c: any) => {
      map[c.razao_social] = { tributacao: c.tributacao, competencia_inicio: c.competencia_inicio, unidade: c.unidade || "2m_contabilidade" };
    });
    return map;
  }, [dbClients]);

  const allClientNames = useMemo(() => Object.keys(clientsMap).sort(), [clientsMap]);
  const allTributacoes = useMemo(() => {
    const set = new Set<string>();
    allClientNames.forEach((c) => { const t = clientsMap[c]?.tributacao; if (t) set.add(t); });
    return [...set].sort();
  }, [allClientNames, clientsMap]);

  const { clients, matrix } = useMemo(() => {
    let clientSet = [...allClientNames];

    if (selectedClient !== "all") clientSet = clientSet.filter((c) => c === selectedClient);
    if (selectedTributacao !== "all") clientSet = clientSet.filter((c) => clientsMap[c]?.tributacao === selectedTributacao);
    if (selectedUnidade !== "all") clientSet = clientSet.filter((c) => clientsMap[c]?.unidade === selectedUnidade);

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

    return { clients: clientSet, matrix };
  }, [year, selectedClient, selectedTributacao, selectedUnidade, allClientNames, clientsMap, semMovimento, demandStatuses]);

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

  const selectClass = "h-8 px-3 text-sm border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fechamento Contábil {year}</h1>
          <p className="text-sm text-muted-foreground mt-1">Evolução contábil por empresa e mês</p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          <select value={year} onChange={(e) => setYear(e.target.value)} className={selectClass}>
            {["2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018"].map((y) => (
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

        {/* Matriz */}
        {clients.length > 0 ? (
          <div className="rounded-lg border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-muted/50 z-10 min-w-[180px]">
                    Empresa
                  </th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground text-xs">Unidade</th>
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
                  const tribLabel = TRIBUTACAO_LABELS_MAP[clientsMap[client]?.tributacao] || "—";
                  const unidade = clientsMap[client]?.unidade || "2m_contabilidade";
                  const unidadeLabel = unidade === "2m_saude" ? "Saúde" : "Contab.";
                  return (
                    <tr key={client} className="hover:bg-muted/20">
                      <td
                        className="px-3 py-2 font-medium text-sm whitespace-nowrap sticky left-0 bg-card z-10 cursor-pointer hover:text-primary transition-colors"
                        onClick={() => setPanelClient(client)}
                      >
                        {client}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${
                          unidade === "2m_saude" ? "bg-emerald-500/15 text-emerald-600" : "bg-blue-500/15 text-blue-600"
                        }`}>
                          {unidadeLabel}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-[10px] text-muted-foreground whitespace-nowrap">{tribLabel}</td>
                      {MONTHS.map((m) => {
                        const level = matrix[client][m];
                        const cfg = LEVEL_CONFIG[level];
                        const isDisabled = level === "disabled";
                        const canToggle = !isDisabled && (level === "none" || level === "sem_movimento");
                        return (
                          <td key={m} className="text-center px-1 py-2">
                            <div
                              className={`mx-auto w-8 h-8 rounded flex items-center justify-center ${cfg.bg} ${
                                isDisabled ? "cursor-not-allowed opacity-40" : canToggle ? "cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all" : ""
                              }`}
                              onClick={canToggle ? () => toggleSemMovimento(client, m) : undefined}
                              title={isDisabled ? "Fora da responsabilidade" : canToggle ? "Clique para marcar/desmarcar sem movimento" : undefined}
                            >
                              <span className={`font-semibold text-[10px] ${cfg.text}`}>{cfg.label}</span>
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
                <div className="space-y-3 border-t pt-4">
                  <h3 className="text-sm font-semibold">Encerramento do Exercício</h3>
                  {CLOSING_TYPES.map((dt) => {
                    const statusKey = `${panelData.client}|closing|${dt.type}`;
                    const currentStatus = demandStatuses[statusKey] || "not_started";

                    return (
                      <div key={dt.type} className="flex items-center gap-2">
                        <span className="text-xs flex-1">{dt.label}</span>
                        <select
                          value={currentStatus}
                          onChange={(e) => setDemandStatus(panelData.client, "closing", dt.type, e.target.value as DemandStatus)}
                          className="h-7 px-2 text-[11px] border rounded bg-card focus:outline-none focus:ring-1 focus:ring-primary min-w-[140px]"
                        >
                          <option value="not_started">Não Iniciada</option>
                          <option value="in_progress">Em Andamento</option>
                          <option value="in_review">Em Revisão</option>
                          <option value="waiting_info">Aguardando Doc.</option>
                          <option value="completed">Concluída</option>
                          <option value="blocked">Bloqueada</option>
                          <option value="late">Em Atraso</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

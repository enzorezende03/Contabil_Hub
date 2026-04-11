import { useState, useMemo, Fragment, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import { MOCK_DEMANDS, CLIENT_TRIBUTACAO } from "@/lib/mock-data";
import { TRIBUTACAO_LABELS, Tributacao, DemandStatus, DemandType, STATUS_LABELS, DEMAND_TYPE_LABELS } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "sonner";

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

type CellLevel = "none" | "sem_movimento" | "lancado" | "conc_bancaria" | "conc_contabil";

const LEVEL_CONFIG: Record<CellLevel, { bg: string; text: string; label: string }> = {
  none: { bg: "bg-muted/30", text: "text-muted-foreground/40", label: "—" },
  sem_movimento: { bg: "bg-orange-500/20", text: "text-orange-500", label: "SM" },
  lancado: { bg: "bg-yellow-500/20", text: "text-yellow-500", label: "L" },
  conc_bancaria: { bg: "bg-blue-500/20", text: "text-blue-500", label: "CB" },
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

export default function CompetenciasPage() {
  const currentYear = new Date().getFullYear().toString();
  const [year, setYear] = useState(currentYear);
  const [selectedClient, setSelectedClient] = useState("all");
  const [selectedTributacao, setSelectedTributacao] = useState("all");
  const [semMovimento, setSemMovimento] = useState<Set<string>>(new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [panelClient, setPanelClient] = useState<string | null>(null);
  // Track demand statuses: key = "client|month|type" -> DemandStatus
  const [demandStatuses, setDemandStatuses] = useState<Record<string, DemandStatus>>({});

  const setDemandStatus = useCallback((client: string, month: string, type: string, status: DemandStatus) => {
    const key = `${client}|${month}|${type}`;
    setDemandStatuses((prev) => ({ ...prev, [key]: status }));
    toast.success("Status atualizado");
  }, []);

  const setBulkStatus = useCallback((client: string, months: Set<string>, type: string, status: DemandStatus) => {
    if (months.size === 0) { toast.error("Selecione ao menos um mês"); return; }
    setDemandStatuses((prev) => {
      const next = { ...prev };
      months.forEach((m) => { next[`${client}|${m}|${type}`] = status; });
      return next;
    });
    toast.success(`Status atualizado para ${months.size} meses`);
  }, []);

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

  const allDemands = useMemo(() => MOCK_DEMANDS.filter((d) => !d.isLegacy), []);
  const allClients = useMemo(() => [...new Set(allDemands.map((d) => d.client))].sort(), [allDemands]);
  const allTributacoes = useMemo(() => {
    const set = new Set<Tributacao>();
    allClients.forEach((c) => { const t = CLIENT_TRIBUTACAO[c]; if (t) set.add(t); });
    return [...set].sort();
  }, [allClients]);

  const { clients, matrix } = useMemo(() => {
    const yearDemands = allDemands.filter((d) => d.competencia.endsWith(`/${year}`));
    let clientSet = [...new Set(yearDemands.map((d) => d.client))].sort();

    if (selectedClient !== "all") clientSet = clientSet.filter((c) => c === selectedClient);
    if (selectedTributacao !== "all") clientSet = clientSet.filter((c) => CLIENT_TRIBUTACAO[c] === selectedTributacao);

    const matrix: Record<string, Record<string, CellLevel>> = {};

    clientSet.forEach((client) => {
      matrix[client] = {};
      MONTHS.forEach((m) => {
        const key = `${client}|${m}`;
        if (semMovimento.has(key)) {
          matrix[client][m] = "sem_movimento";
          return;
        }
        const comp = `${m}/${year}`;
        const clientMonth = yearDemands.filter((d) => d.client === client && d.competencia === comp);
        const hasLanc = clientMonth.some((d) => d.type === "lancamentos");
        const hasConcBanc = clientMonth.some((d) => d.type === "conciliacao_bancaria");
        const hasConcCont = clientMonth.some((d) => d.type === "conciliacao_contabil");
        let level: CellLevel = "none";
        if (hasConcCont) level = "conc_contabil";
        else if (hasConcBanc) level = "conc_bancaria";
        else if (hasLanc) level = "lancado";
        matrix[client][m] = level;
      });
    });

    return { clients: clientSet, matrix };
  }, [year, selectedClient, selectedTributacao, allDemands, semMovimento]);

  // Panel data: demands for the selected client grouped by month
  const panelData = useMemo(() => {
    if (!panelClient) return null;
    const clientDemands = allDemands.filter(
      (d) => d.client === panelClient && d.competencia.endsWith(`/${year}`)
    );
    const byMonth: Record<string, typeof clientDemands> = {};
    MONTHS.forEach((m) => {
      const comp = `${m}/${year}`;
      const demands = clientDemands.filter((d) => d.competencia === comp);
      if (demands.length > 0) byMonth[m] = demands;
    });
    return { client: panelClient, trib: CLIENT_TRIBUTACAO[panelClient], byMonth, allDemands: clientDemands };
  }, [panelClient, year, allDemands]);

  const totalClients = clients.length;
  const totalCells = totalClients * MONTHS.length;
  const doneCells = clients.reduce((acc, c) =>
    acc + MONTHS.reduce((a, m) => a + (matrix[c][m] === "conc_contabil" ? 1 : 0), 0), 0
  );
  const pctDone = totalCells > 0 ? Math.round((doneCells / totalCells) * 100) : 0;

  const selectClass = "h-8 px-3 text-sm border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Competências {year}</h1>
          <p className="text-sm text-muted-foreground mt-1">Evolução contábil por empresa e mês</p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          <select value={year} onChange={(e) => setYear(e.target.value)} className={selectClass}>
            {["2026", "2025", "2024", "2023"].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} className={selectClass}>
            <option value="all">Todas as empresas</option>
            {allClients.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={selectedTributacao} onChange={(e) => setSelectedTributacao(e.target.value)} className={selectClass}>
            <option value="all">Todas as tributações</option>
            {allTributacoes.map((t) => (
              <option key={t} value={t}>{TRIBUTACAO_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {/* Legenda */}
        <div className="flex flex-wrap items-center gap-5 text-xs">
          {(["sem_movimento", "lancado", "conc_bancaria", "conc_contabil", "none"] as CellLevel[]).map((level) => {
            const cfg = LEVEL_CONFIG[level];
            const labels: Record<CellLevel, string> = {
              none: "Sem demanda",
              sem_movimento: "Sem Movimento",
              lancado: "Lançado",
              conc_bancaria: "Conc. Bancária",
              conc_contabil: "Conc. Contábil",
            };
            return (
              <div key={level} className="flex items-center gap-1.5">
                <div className={`w-6 h-6 rounded flex items-center justify-center ${cfg.bg}`}>
                  <span className={`font-semibold text-[10px] ${cfg.text}`}>{cfg.label}</span>
                </div>
                <span className="text-muted-foreground">{labels[level]}</span>
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
                  const trib = CLIENT_TRIBUTACAO[client];
                  const tribLabel = trib ? TRIBUTACAO_LABELS[trib] : "—";
                  return (
                    <tr key={client} className="hover:bg-muted/20">
                      <td
                        className="px-3 py-2 font-medium text-sm whitespace-nowrap sticky left-0 bg-card z-10 cursor-pointer hover:text-primary transition-colors"
                        onClick={() => setPanelClient(client)}
                      >
                        {client}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-muted-foreground whitespace-nowrap">{tribLabel}</td>
                      {MONTHS.map((m) => {
                        const level = matrix[client][m];
                        const cfg = LEVEL_CONFIG[level];
                        const canToggle = level === "none" || level === "sem_movimento";
                        return (
                          <td key={m} className="text-center px-1 py-2">
                            <div
                              className={`mx-auto w-8 h-8 rounded flex items-center justify-center ${cfg.bg} ${canToggle ? "cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all" : ""}`}
                              onClick={canToggle ? () => toggleSemMovimento(client, m) : undefined}
                              title={canToggle ? "Clique para marcar/desmarcar sem movimento" : undefined}
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
          <p className="text-center text-muted-foreground py-12">Nenhuma empresa encontrada com os filtros selecionados.</p>
        )}
      </div>

      {/* Painel lateral da empresa */}
      <Sheet open={!!panelClient} onOpenChange={(open) => !open && setPanelClient(null)}>
        <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
          {panelData && (
            <>
              <SheetHeader className="pb-4 border-b">
                <SheetTitle className="text-lg">{panelData.client}</SheetTitle>
                <SheetDescription>
                  {panelData.trib ? TRIBUTACAO_LABELS[panelData.trib] : "Sem tributação definida"} — {year}
                </SheetDescription>
              </SheetHeader>

              <div className="py-4 space-y-4">
                {/* Resumo visual por mês */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Resumo por Mês</h3>
                  <div className="grid grid-cols-6 gap-1.5">
                    {MONTHS.map((m) => {
                      const level = matrix[panelData.client]?.[m] || "none";
                      const cfg = LEVEL_CONFIG[level];
                      return (
                        <div key={m} className={`rounded p-1.5 text-center ${cfg.bg}`}>
                          <p className="text-[9px] text-muted-foreground">{MONTH_SHORT[m]}</p>
                          <p className={`text-[10px] font-bold ${cfg.text}`}>{cfg.label}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Preenchimento por mês */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Preencher Demandas por Mês</h3>
                  {MONTHS.map((m) => {
                    const smKey = `${panelData.client}|${m}`;
                    const isSM = semMovimento.has(smKey);
                    const comp = `${m}/${year}`;
                    const monthDemands = allDemands.filter(
                      (d) => d.client === panelData.client && d.competencia === comp
                    );

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
                              const existing = monthDemands.find((d) => d.type === dt.type);
                              const statusKey = `${panelData.client}|${m}|${dt.type}`;
                              const currentStatus = demandStatuses[statusKey] || existing?.status || "not_started";

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
                                    <option value="waiting_info">Aguardando Info</option>
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
                          <option value="waiting_info">Aguardando Info</option>
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
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}

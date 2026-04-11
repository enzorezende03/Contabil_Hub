import { useState, useMemo, Fragment } from "react";
import AppLayout from "@/components/AppLayout";
import { MOCK_DEMANDS, CLIENT_TRIBUTACAO } from "@/lib/mock-data";
import { TRIBUTACAO_LABELS, Tributacao, DemandStatus, STATUS_LABELS, DEMAND_TYPE_LABELS } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { X } from "lucide-react";

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
  { type: "fechamento" as const, label: "Fechamento Contábil" },
  { type: "revisao" as const, label: "Revisão" },
];

export default function CompetenciasPage() {
  const currentYear = new Date().getFullYear().toString();
  const [year, setYear] = useState(currentYear);
  const [selectedClient, setSelectedClient] = useState("all");
  const [selectedTributacao, setSelectedTributacao] = useState("all");
  const [semMovimento, setSemMovimento] = useState<Set<string>>(new Set());
  const [panelClient, setPanelClient] = useState<string | null>(null);

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
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          {panelData && (
            <>
              <SheetHeader className="pb-4 border-b">
                <SheetTitle className="text-lg">{panelData.client}</SheetTitle>
                {panelData.trib && (
                  <p className="text-xs text-muted-foreground">{TRIBUTACAO_LABELS[panelData.trib]}</p>
                )}
              </SheetHeader>

              <div className="py-4 space-y-6">
                {/* Resumo por mês */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Visão por Mês — {year}</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {MONTHS.map((m) => {
                      const level = matrix[panelData.client]?.[m] || "none";
                      const cfg = LEVEL_CONFIG[level];
                      return (
                        <div key={m} className={`rounded-md p-2 text-center ${cfg.bg}`}>
                          <p className="text-[10px] text-muted-foreground">{MONTH_SHORT[m]}</p>
                          <p className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Demandas detalhadas por mês */}
                {Object.entries(panelData.byMonth).length > 0 ? (
                  Object.entries(panelData.byMonth).map(([m, demands]) => (
                    <div key={m}>
                      <h4 className="text-sm font-semibold mb-2 text-primary">{MONTH_FULL[m]}</h4>
                      <div className="space-y-2">
                        {demands.map((d) => (
                          <div key={d.id} className="rounded-md border bg-muted/20 p-3 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium">{DEMAND_TYPE_LABELS[d.type]}</span>
                              <StatusBadge status={d.status} />
                            </div>
                            <p className="text-xs text-muted-foreground">{d.description}</p>
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                              <span>Prazo: {new Date(d.internalDeadline).toLocaleDateString("pt-BR")}</span>
                              {d.notes && <span>• {d.notes}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma demanda registrada para {panelData.client} em {year}.
                  </p>
                )}

                {/* Checklist de demandas por mês (para preencher) */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Checklist de Atividades</h3>
                  <p className="text-xs text-muted-foreground mb-3">Marque as atividades conforme concluídas</p>
                  {MONTHS.map((m) => {
                    const smKey = `${panelData.client}|${m}`;
                    const isSM = semMovimento.has(smKey);
                    const comp = `${m}/${year}`;
                    const monthDemands = allDemands.filter(
                      (d) => d.client === panelData.client && d.competencia === comp
                    );

                    return (
                      <div key={m} className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">{MONTH_SHORT[m]}/{year}</span>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSM}
                              onChange={() => toggleSemMovimento(panelData.client, m)}
                              className="rounded border-border"
                            />
                            <span className="text-[10px] text-orange-500">Sem movimento</span>
                          </label>
                        </div>
                        {!isSM && (
                          <div className="ml-2 space-y-1">
                            {DEMAND_TYPES_FOR_PANEL.map((dt) => {
                              const exists = monthDemands.find((d) => d.type === dt.type);
                              const done = exists?.status === "completed";
                              return (
                                <div key={dt.type} className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${done ? "bg-status-completed" : exists ? "bg-status-in-progress" : "bg-muted"}`} />
                                  <span className={`text-xs ${done ? "line-through text-muted-foreground" : exists ? "" : "text-muted-foreground/50"}`}>
                                    {dt.label}
                                  </span>
                                  {exists && <StatusBadge status={exists.status} />}
                                </div>
                              );
                            })}
                          </div>
                        )}
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

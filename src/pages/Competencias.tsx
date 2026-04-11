import { useState, useMemo, Fragment } from "react";
import AppLayout from "@/components/AppLayout";
import { MOCK_DEMANDS, CLIENT_TRIBUTACAO } from "@/lib/mock-data";
import { TRIBUTACAO_LABELS, Tributacao } from "@/lib/types";

const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const MONTH_SHORT: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

// Status levels for each cell
type CellLevel = "none" | "lancado" | "conc_bancaria" | "conc_contabil";

const LEVEL_CONFIG: Record<CellLevel, { bg: string; text: string; label: string }> = {
  none: { bg: "bg-muted/30", text: "text-muted-foreground/40", label: "—" },
  lancado: { bg: "bg-yellow-500/20", text: "text-yellow-500", label: "L" },
  conc_bancaria: { bg: "bg-blue-500/20", text: "text-blue-500", label: "CB" },
  conc_contabil: { bg: "bg-emerald-500/20", text: "text-emerald-500", label: "CC" },
};

export default function CompetenciasPage() {
  const currentYear = new Date().getFullYear().toString();
  const [year, setYear] = useState(currentYear);
  const [selectedClient, setSelectedClient] = useState("all");
  const [selectedTributacao, setSelectedTributacao] = useState("all");

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
        const comp = `${m}/${year}`;
        const clientMonth = yearDemands.filter((d) => d.client === client && d.competencia === comp);

        const hasLanc = clientMonth.some((d) => d.type === "lancamentos");
        const hasConcBanc = clientMonth.some((d) => d.type === "conciliacao_bancaria");
        const hasConcCont = clientMonth.some((d) => d.type === "conciliacao_contabil");

        // Highest level reached
        let level: CellLevel = "none";
        if (hasConcCont) level = "conc_contabil";
        else if (hasConcBanc) level = "conc_bancaria";
        else if (hasLanc) level = "lancado";

        matrix[client][m] = level;
      });
    });

    return { clients: clientSet, matrix };
  }, [year, selectedClient, selectedTributacao, allDemands]);

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
          <p className="text-sm text-muted-foreground mt-1">
            Evolução contábil por empresa e mês
          </p>
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
        <div className="flex items-center gap-5 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded flex items-center justify-center bg-yellow-500/20">
              <span className="text-yellow-500 font-semibold text-[10px]">L</span>
            </div>
            <span className="text-muted-foreground">Lançado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded flex items-center justify-center bg-blue-500/20">
              <span className="text-blue-500 font-semibold text-[10px]">CB</span>
            </div>
            <span className="text-muted-foreground">Conc. Bancária</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded flex items-center justify-center bg-emerald-500/20">
              <span className="text-emerald-500 font-semibold text-[10px]">CC</span>
            </div>
            <span className="text-muted-foreground">Conc. Contábil</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded flex items-center justify-center bg-muted/30">
              <span className="text-muted-foreground/40 font-semibold text-[10px]">—</span>
            </div>
            <span className="text-muted-foreground">Sem demanda</span>
          </div>
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
                      <td className="px-3 py-2 font-medium text-sm whitespace-nowrap sticky left-0 bg-card z-10">
                        {client}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-muted-foreground whitespace-nowrap">{tribLabel}</td>
                      {MONTHS.map((m) => {
                        const level = matrix[client][m];
                        const cfg = LEVEL_CONFIG[level];
                        return (
                          <td key={m} className="text-center px-1 py-2">
                            <div className={`mx-auto w-8 h-8 rounded flex items-center justify-center ${cfg.bg}`}>
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
    </AppLayout>
  );
}

import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { MOCK_DEMANDS } from "@/lib/mock-data";
import { Check, Minus, X } from "lucide-react";

const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const MONTH_SHORT: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

type CellStatus = "done" | "partial" | "none";

function CellIcon({ status }: { status: CellStatus }) {
  if (status === "done") return <Check className="w-4 h-4 text-status-completed" />;
  if (status === "partial") return <Minus className="w-4 h-4 text-status-in-progress" />;
  return <X className="w-4 h-4 text-muted-foreground/30" />;
}

function cellBg(status: CellStatus) {
  if (status === "done") return "bg-status-completed/15";
  if (status === "partial") return "bg-status-in-progress/15";
  return "";
}

export default function CompetenciasPage() {
  const currentYear = new Date().getFullYear().toString();
  const [year, setYear] = useState(currentYear);

  // Get unique clients that have demands in the selected year (non-legacy)
  const { clients, matrix } = useMemo(() => {
    const yearDemands = MOCK_DEMANDS.filter(
      (d) => !d.isLegacy && d.competencia.endsWith(`/${year}`)
    );

    const clientSet = [...new Set(yearDemands.map((d) => d.client))].sort();

    const matrix: Record<string, Record<string, { lancamentos: CellStatus; conciliacoes: CellStatus }>> = {};

    clientSet.forEach((client) => {
      matrix[client] = {};
      MONTHS.forEach((m) => {
        const comp = `${m}/${year}`;
        const clientMonth = yearDemands.filter((d) => d.client === client && d.competencia === comp);

        // Lançamentos
        const lanc = clientMonth.filter((d) => d.type === "lancamentos");
        let lancStatus: CellStatus = "none";
        if (lanc.length > 0) {
          lancStatus = lanc.every((d) => d.status === "completed") ? "done" : "partial";
        }

        // Conciliações (bancária + contábil)
        const conc = clientMonth.filter((d) =>
          d.type === "conciliacao_bancaria" || d.type === "conciliacao_contabil"
        );
        let concStatus: CellStatus = "none";
        if (conc.length > 0) {
          concStatus = conc.every((d) => d.status === "completed") ? "done" : "partial";
        }

        matrix[client][m] = { lancamentos: lancStatus, conciliacoes: concStatus };
      });
    });

    return { clients: clientSet, matrix };
  }, [year]);

  // Stats
  const totalClients = clients.length;
  const totalCells = totalClients * MONTHS.length * 2;
  const doneCells = clients.reduce((acc, c) => {
    return acc + MONTHS.reduce((a, m) => {
      const cell = matrix[c][m];
      return a + (cell.lancamentos === "done" ? 1 : 0) + (cell.conciliacoes === "done" ? 1 : 0);
    }, 0);
  }, 0);
  const pctDone = totalCells > 0 ? Math.round((doneCells / totalCells) * 100) : 0;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Competências {year}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visão geral de lançamentos e conciliações por empresa e mês
            </p>
          </div>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="h-8 px-3 text-sm border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {["2026", "2025", "2024", "2023"].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Legenda e resumo */}
        <div className="flex items-center gap-6 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded flex items-center justify-center bg-status-completed/15">
              <Check className="w-3.5 h-3.5 text-status-completed" />
            </div>
            <span className="text-muted-foreground">Concluído</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded flex items-center justify-center bg-status-in-progress/15">
              <Minus className="w-3.5 h-3.5 text-status-in-progress" />
            </div>
            <span className="text-muted-foreground">Em andamento</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded flex items-center justify-center">
              <X className="w-3.5 h-3.5 text-muted-foreground/30" />
            </div>
            <span className="text-muted-foreground">Sem demanda</span>
          </div>
          <div className="ml-auto text-muted-foreground">
            {totalClients} empresas · {pctDone}% concluído
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
                  {MONTHS.map((m) => (
                    <th key={m} className="text-center px-1 py-2 font-medium text-muted-foreground" colSpan={2}>
                      {MONTH_SHORT[m]}
                    </th>
                  ))}
                </tr>
                <tr className="border-b bg-muted/30">
                  <th className="sticky left-0 bg-muted/30 z-10" />
                  {MONTHS.map((m) => (
                    <Fragment key={m}>
                      <th className="text-center px-0.5 py-1 text-[10px] text-muted-foreground font-normal">Lanç</th>
                      <th className="text-center px-0.5 py-1 text-[10px] text-muted-foreground font-normal border-r border-border/50 last:border-r-0">Conc</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clients.map((client) => (
                  <tr key={client} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium text-sm whitespace-nowrap sticky left-0 bg-card z-10">
                      {client}
                    </td>
                    {MONTHS.map((m) => {
                      const cell = matrix[client][m];
                      return (
                        <Fragment key={m}>
                          <td className={`text-center px-1 py-2 ${cellBg(cell.lancamentos)}`}>
                            <div className="flex justify-center">
                              <CellIcon status={cell.lancamentos} />
                            </div>
                          </td>
                          <td className={`text-center px-1 py-2 border-r border-border/30 last:border-r-0 ${cellBg(cell.conciliacoes)}`}>
                            <div className="flex justify-center">
                              <CellIcon status={cell.conciliacoes} />
                            </div>
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-12">Nenhuma demanda encontrada para {year}.</p>
        )}
      </div>
    </AppLayout>
  );
}

// Need Fragment import
import { Fragment } from "react";

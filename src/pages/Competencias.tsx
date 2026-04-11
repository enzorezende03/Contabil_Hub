import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { MOCK_DEMANDS, TEAM_MEMBERS } from "@/lib/mock-data";
import { StatusBadge } from "@/components/StatusBadge";
import { STATUS_LABELS, DemandStatus } from "@/lib/types";

const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const MONTH_NAMES: Record<string, string> = {
  "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
  "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
  "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro",
};

export default function CompetenciasPage() {
  const [year, setYear] = useState("2026");

  const monthData = useMemo(() => {
    return MONTHS.map((m) => {
      const comp = `${m}/${year}`;
      const demands = MOCK_DEMANDS.filter((d) => d.competencia === comp);
      const completed = demands.filter((d) => d.status === "completed").length;
      const pct = demands.length > 0 ? Math.round((completed / demands.length) * 100) : 0;
      return { month: m, label: MONTH_NAMES[m], demands, total: demands.length, completed, pct };
    });
  }, [year]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Competências</h1>
            <p className="text-sm text-muted-foreground mt-1">Visão mensal das demandas</p>
          </div>
          <select value={year} onChange={(e) => setYear(e.target.value)} className="h-8 px-2 text-sm border rounded-md bg-card">
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {monthData.map((m) => (
            <div key={m.month} className={`rounded-lg border bg-card p-4 ${m.total > 0 ? "hover:border-primary/30 cursor-pointer transition-colors" : "opacity-50"}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">{m.label}</h3>
                {m.total > 0 && (
                  <span className="text-xs font-medium text-primary">{m.pct}%</span>
                )}
              </div>
              {m.total > 0 ? (
                <>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-status-completed rounded-full transition-all" style={{ width: `${m.pct}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{m.completed}/{m.total} concluídas</span>
                    <span>{m.total - m.completed} pendentes</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Sem demandas</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { MOCK_DEMANDS, TEAM_MEMBERS } from "@/lib/mock-data";
import { StatusBadge } from "@/components/StatusBadge";

export default function LegacyPage() {
  const legacy = MOCK_DEMANDS.filter((d) => d.isLegacy);
  const getMember = (id: string) => TEAM_MEMBERS.find((m) => m.id === id);

  // Group by year extracted from competencia (MM/YYYY)
  const byYear = useMemo(() => {
    const map: Record<string, typeof legacy> = {};
    legacy.forEach((d) => {
      const year = d.competencia.split("/")[1] || "Outros";
      if (!map[year]) map[year] = [];
      map[year].push(d);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, []);

  const years = useMemo(() => byYear.map(([y]) => y), [byYear]);
  const [selectedYear, setSelectedYear] = useState<string>("all");

  const filteredYears = selectedYear === "all" ? byYear : byYear.filter(([y]) => y === selectedYear);

  // Global stats
  const totalFiltered = filteredYears.reduce((s, [, items]) => s + items.length, 0);
  const completedFiltered = filteredYears.reduce((s, [, items]) => s + items.filter((d) => d.status === "completed").length, 0);
  const pctFiltered = totalFiltered > 0 ? Math.round((completedFiltered / totalFiltered) * 100) : 0;

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Escritas Antigas</h1>
            <p className="text-sm text-muted-foreground mt-1">Controle de demandas de anos anteriores, organizado por ano</p>
          </div>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="rounded-md border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">Todos os anos</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* KPIs globais */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold mt-1">{totalFiltered}</p>
          </div>
          <div className="rounded-lg border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">Concluídas</p>
            <p className="text-2xl font-bold mt-1 text-status-completed">{completedFiltered}</p>
          </div>
          <div className="rounded-lg border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">% Concluído</p>
            <p className="text-2xl font-bold mt-1">{pctFiltered}%</p>
            <div className="w-full h-2 bg-muted rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-status-completed rounded-full transition-all" style={{ width: `${pctFiltered}%` }} />
            </div>
          </div>
        </div>

        {/* Seções por ano */}
        {filteredYears.map(([year, items]) => {
          const yearCompleted = items.filter((d) => d.status === "completed").length;
          const yearPct = items.length > 0 ? Math.round((yearCompleted / items.length) * 100) : 0;

          return (
            <div key={year} className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">{year}</h2>
                <span className="text-xs text-muted-foreground">
                  {yearCompleted}/{items.length} concluídas
                </span>
                <div className="flex-1 max-w-[200px] h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-status-completed rounded-full transition-all" style={{ width: `${yearPct}%` }} />
                </div>
                <span className="text-xs font-medium">{yearPct}%</span>
              </div>

              <div className="rounded-lg border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Cliente</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Competência</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tipo</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Responsável</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Prazo</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Obs.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((d) => (
                      <tr key={d.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2.5 font-medium">{d.client}</td>
                        <td className="px-3 py-2.5 text-xs">{d.competencia}</td>
                        <td className="px-3 py-2.5 text-xs">{d.description}</td>
                        <td className="px-3 py-2.5"><StatusBadge status={d.status} /></td>
                        <td className="px-3 py-2.5 text-xs">{getMember(d.assignee)?.name}</td>
                        <td className="px-3 py-2.5 text-xs">{new Date(d.internalDeadline).toLocaleDateString("pt-BR")}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{d.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {filteredYears.length === 0 && (
          <p className="text-center text-muted-foreground py-8">Nenhuma demanda antiga encontrada.</p>
        )}
      </div>
    </AppLayout>
  );
}

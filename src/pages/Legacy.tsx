import AppLayout from "@/components/AppLayout";
import { MOCK_DEMANDS } from "@/lib/mock-data";
import { StatusBadge } from "@/components/StatusBadge";
import { TEAM_MEMBERS } from "@/lib/mock-data";

export default function LegacyPage() {
  const legacy = MOCK_DEMANDS.filter((d) => d.isLegacy);
  const completed = legacy.filter((d) => d.status === "completed").length;
  const pct = legacy.length > 0 ? Math.round((completed / legacy.length) * 100) : 0;
  const getMember = (id: string) => TEAM_MEMBERS.find((m) => m.id === id);

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Escritas Antigas</h1>
          <p className="text-sm text-muted-foreground mt-1">Controle de demandas de anos anteriores</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold mt-1">{legacy.length}</p>
          </div>
          <div className="rounded-lg border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">Concluídas</p>
            <p className="text-2xl font-bold mt-1 text-status-completed">{completed}</p>
          </div>
          <div className="rounded-lg border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">% Concluído</p>
            <p className="text-2xl font-bold mt-1">{pct}%</p>
            <div className="w-full h-2 bg-muted rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-status-completed rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
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
              {legacy.map((d) => (
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
    </AppLayout>
  );
}

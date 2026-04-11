import AppLayout from "@/components/AppLayout";
import { MOCK_DEMANDS, TEAM_MEMBERS } from "@/lib/mock-data";
import { getDeadlineUrgency, getDemandsByAssignee } from "@/lib/demand-utils";
import { AlertTriangle, Clock, Ban, UserX, Pause } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";

export default function AlertsPage() {
  const demands = MOCK_DEMANDS;

  const lateDemands = demands.filter((d) => d.status === "late" || (d.status !== "completed" && getDeadlineUrgency(d.internalDeadline) === "overdue"));
  const blockedDemands = demands.filter((d) => d.status === "blocked");
  const attentionDemands = demands.filter((d) => d.status === "attention");

  // Overloaded: >3 active demands
  const overloaded = TEAM_MEMBERS.filter((m) => {
    const active = getDemandsByAssignee(demands, m.id).filter((d) => d.status !== "completed").length;
    return active > 3;
  });

  const getMember = (id: string) => TEAM_MEMBERS.find((m) => m.id === id);

  const AlertSection = ({ title, icon: Icon, items, color }: { title: string; icon: any; items: typeof demands; color: string }) => (
    <div className="rounded-lg border bg-card p-4">
      <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${color}`}>
        <Icon className="w-4 h-4" />
        {title}
        <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full ml-1">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum alerta ✅</p>
      ) : (
        <div className="divide-y divide-border">
          {items.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-2 gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{d.client}</p>
                <p className="text-xs text-muted-foreground">{d.description} · {d.competencias.join(", ")}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-muted-foreground">{getMember(d.assignee)?.name.split(" ")[0]}</span>
                <StatusBadge status={d.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-4 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alertas</h1>
          <p className="text-sm text-muted-foreground mt-1">Situações que requerem atenção imediata</p>
        </div>

        <AlertSection title="Demandas em Atraso" icon={Clock} items={lateDemands} color="text-status-late" />
        <AlertSection title="Demandas Bloqueadas" icon={Ban} items={blockedDemands} color="text-status-blocked" />
        <AlertSection title="Requer Atenção" icon={AlertTriangle} items={attentionDemands} color="text-status-attention" />

        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-status-waiting">
            <UserX className="w-4 h-4" />
            Colaboradores Sobrecarregados
            <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full ml-1">{overloaded.length}</span>
          </h3>
          {overloaded.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma sobrecarga detectada ✅</p>
          ) : (
            <div className="space-y-2">
              {overloaded.map((m) => {
                const active = getDemandsByAssignee(demands, m.id).filter((d) => d.status !== "completed").length;
                return (
                  <div key={m.id} className="flex items-center justify-between py-1">
                    <span className="text-sm font-medium">{m.name}</span>
                    <span className="text-xs text-status-waiting font-medium">{active} demandas ativas</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

import AppLayout from "@/components/AppLayout";
import { DEFAULT_WEIGHTS, DEMAND_TYPE_LABELS } from "@/lib/types";
import { TEAM_MEMBERS } from "@/lib/mock-data";
import { ROLE_LABELS } from "@/lib/types";
import { Settings as SettingsIcon } from "lucide-react";

export default function SettingsPage() {
  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">Pesos, equipe e parâmetros do sistema</p>
        </div>

        {/* Weights */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Pesos das Demandas</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {DEFAULT_WEIGHTS.map((w) => (
              <div key={w.type} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                <span className="text-sm">{w.label}</span>
                <span className="text-sm font-bold text-primary">{w.weight}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Team */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Equipe</h3>
          <div className="divide-y divide-border">
            {TEAM_MEMBERS.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                    {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <span className="text-sm font-medium">{m.name}</span>
                </div>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{ROLE_LABELS[m.role]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

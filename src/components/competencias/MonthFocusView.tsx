import { useMemo } from "react";
import { CheckCircle2, Loader2, Clock, Circle, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DemandStatus } from "@/lib/types";

const TYPES = [
  { key: "lancamentos", label: "Lançamento" },
  { key: "conciliacao_bancaria", label: "Conc. Banc." },
  { key: "conciliacao_contabil", label: "Conc. Cont." },
] as const;

type TypeKey = (typeof TYPES)[number]["key"];

const STATUS_META: Partial<Record<DemandStatus, { label: string; icon: typeof Circle; cls: string }>> = {
  not_started: { label: "Não iniciada", icon: Circle, cls: "text-muted-foreground bg-muted/40" },
  in_progress: { label: "Em andamento", icon: Loader2, cls: "text-warning bg-warning/15" },
  waiting_info: { label: "Aguard. doc.", icon: Clock, cls: "text-destructive bg-destructive/15" },
  in_review: { label: "Em revisão", icon: AlertOctagon, cls: "text-info bg-info/15" },
  completed: { label: "Concluída", icon: CheckCircle2, cls: "text-success bg-success/15" },
};
const FALLBACK_META = { label: "—", icon: Circle, cls: "text-muted-foreground bg-muted/40" };

export interface MonthFocusViewProps {
  clients: string[];
  clientsMap: Record<string, { unidade?: string; tributacao?: string; perfil?: string } | undefined>;
  month: string;
  monthLabel: string;
  year: string;
  demandStatuses: Record<string, DemandStatus>;
  isMonthEnabledFor: (client: string, month: string) => boolean;
  filter: "all" | "pendentes" | "atrasados";
  onOpenClient: (client: string) => void;
  displayName: (client: string) => string;
  isCurrentOrPast: boolean;
}


function statusFor(map: Record<string, DemandStatus>, client: string, month: string, type: string): DemandStatus {
  return (map[`${client}|${month}|${type}`] || "not_started") as DemandStatus;
}

function rowIsPendente(map: Record<string, DemandStatus>, client: string, month: string): boolean {
  return TYPES.some((t) => statusFor(map, client, month, t.key) !== "completed");
}

export function MonthFocusView({
  clients, clientsMap, month, monthLabel, year, demandStatuses,
  isMonthEnabledFor, filter, onOpenClient, displayName, isCurrentOrPast,
}: MonthFocusViewProps) {

  const tribShort: Record<string, string> = {
    simples_nacional: "SN", lucro_presumido: "LP", lucro_real: "LR", isenta_imune: "II",
  };

  const rows = useMemo(() => {
    const list = clients
      .filter((c) => isMonthEnabledFor(c, month))
      .map((c) => {
        const lanc = statusFor(demandStatuses, c, month, "lancamentos");
        const cb = statusFor(demandStatuses, c, month, "conciliacao_bancaria");
        const cc = statusFor(demandStatuses, c, month, "conciliacao_contabil");
        const done = [lanc, cb, cc].filter((s) => s === "completed").length;
        return { client: c, lanc, cb, cc, done, pendente: done < 3 };
      });

    let filtered = list;
    if (filter === "pendentes") filtered = list.filter((r) => r.pendente);
    if (filter === "atrasados") filtered = isCurrentOrPast ? list.filter((r) => r.pendente) : [];

    // Default sort: pendentes first, then by client name
    return filtered.sort((a, b) => {
      if (a.pendente !== b.pendente) return a.pendente ? -1 : 1;
      return a.client.localeCompare(b.client, "pt-BR");
    });
  }, [clients, demandStatuses, month, filter, isMonthEnabledFor, isCurrentOrPast]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Nenhuma empresa para {monthLabel}/{year} com este filtro.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[280px]">Empresa</th>
            <th className="text-left px-2 py-2 font-medium text-muted-foreground text-xs w-[50px]">Trib.</th>
            {TYPES.map((t) => (
              <th key={t.key} className="text-left px-2 py-2 font-medium text-muted-foreground text-xs">
                {t.label}
              </th>
            ))}
            <th className="text-center px-2 py-2 font-medium text-muted-foreground text-xs w-[80px]">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const trib = tribShort[clientsMap[r.client]?.tributacao || ""] || "—";
            const allDone = r.done === 3;
            return (
              <tr key={r.client} className="hover:bg-muted/30 transition-colors">
                <td
                  className="px-3 py-2 font-medium text-xs cursor-pointer hover:text-primary truncate max-w-[280px]"
                  onClick={() => onOpenClient(r.client)}
                  title={displayName(r.client)}
                >
                  {displayName(r.client)}
                </td>
                <td className="px-2 py-2 text-[11px] text-muted-foreground">{trib}</td>
                {TYPES.map((t) => {
                  const st = r[t.key === "lancamentos" ? "lanc" : t.key === "conciliacao_bancaria" ? "cb" : "cc"];
                  const meta = STATUS_META[st] ?? FALLBACK_META;
                  const Icon = meta.icon;
                  return (
                    <td key={t.key} className="px-2 py-2">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium", meta.cls)}>
                        <Icon className={cn("w-3 h-3", st === "in_progress" && "animate-spin")} />
                        {meta.label}
                      </span>
                    </td>

                  );
                })}
                <td className="px-2 py-2 text-center">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold",
                      allDone ? "bg-success/20 text-success" : "bg-warning/20 text-warning",
                    )}
                  >
                    {r.done}/3
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

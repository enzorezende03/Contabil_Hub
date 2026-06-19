import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link2, ExternalLink, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Props {
  clientName?: string;
  competencia: string; // YYYY-MM-DD
}

const STATUS_LABEL: Record<string, string> = {
  not_started: "Não iniciado",
  in_progress: "Em andamento",
  blocked: "Bloqueado",
  completed: "Concluído",
};

const STATUS_TONE: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-info/15 text-info",
  blocked: "bg-destructive/15 text-destructive",
  completed: "bg-emerald-500/15 text-emerald-700",
};

function competenciaMMYYYY(comp: string): string {
  try {
    const d = new Date(comp);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return "";
  }
}

export function RelatedPlanningSection({ clientName, competencia }: Props) {
  const compKey = competenciaMMYYYY(competencia);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["pendency-related-plannings", clientName, compKey],
    enabled: !!clientName && !!compKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plannings")
        .select("id, client, competencias, types, description, assignee, status, internal_deadline")
        .eq("client", clientName!)
        .contains("competencias", [compKey])
        .order("internal_deadline", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Trabalho relacionado no planejamento</h3>
        <span className="text-[11px] text-muted-foreground">
          ({clientName || "—"} · {compKey || "—"})
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> Buscando planejamentos…
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum planejamento desta competência para este cliente.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it: any) => (
            <li
              key={it.id}
              className="rounded-md border bg-card px-2.5 py-2 flex items-center gap-2 text-xs"
            >
              <span
                className={cn(
                  "shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded",
                  STATUS_TONE[it.status] || "bg-muted text-muted-foreground",
                )}
              >
                {STATUS_LABEL[it.status] || it.status}
              </span>
              <span className="flex-1 truncate" title={it.description || ""}>
                {(it.types || []).join(", ") || "Planejamento"}
                {it.description ? ` — ${it.description}` : ""}
              </span>
              {it.internal_deadline && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  prazo {new Date(it.internal_deadline).toLocaleDateString("pt-BR")}
                </span>
              )}
              <Link
                to={`/planejamento?id=${it.id}`}
                className="shrink-0 inline-flex items-center gap-1 text-primary hover:underline"
              >
                Abrir <ExternalLink className="w-3 h-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import { Mail, MessageCircle, Phone, Users, FileText, Plus, CheckCircle2, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { CANAL_LABELS, type PendencyCanal, type Pendency } from "@/lib/pendency-types";

const CANAL_ICON: Record<string, any> = {
  email: Mail,
  whatsapp: MessageCircle,
  telefone: Phone,
  reuniao: Users,
  presencial: Users,
  sistema: FileText,
  outro: FileText,
};

const CANAL_TONE: Record<string, string> = {
  email: "bg-info/15 text-info border-info/30",
  whatsapp: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  telefone: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  reuniao: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  presencial: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  sistema: "bg-muted text-muted-foreground border-border",
  outro: "bg-muted text-muted-foreground border-border",
};

interface Comm {
  id: string;
  canal: PendencyCanal;
  descricao: string;
  realizado_em: string;
  resposta_recebida: boolean | null;
  resposta_descricao: string | null;
}

interface Props {
  pendency: Pendency;
  comms: Comm[];
}

function fmt(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PendencyTimeline({ pendency, comms }: Props) {
  // Build events: creation + comms (+ resolved if any), ordered desc
  type Event =
    | { kind: "created"; at: string }
    | { kind: "comm"; at: string; canal: PendencyCanal; descricao: string; resposta?: string | null; respondida?: boolean }
    | { kind: "resolved"; at: string; notes?: string | null }
    | { kind: "paused"; at: string };

  const events: Event[] = [
    { kind: "created", at: pendency.created_at },
    ...comms.map<Event>((c) => ({
      kind: "comm",
      at: c.realizado_em,
      canal: c.canal,
      descricao: c.descricao,
      respondida: !!c.resposta_recebida,
      resposta: c.resposta_descricao,
    })),
  ];
  if (pendency.resolved_at) {
    events.push({ kind: "resolved", at: pendency.resolved_at, notes: pendency.resolution_notes });
  }
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Linha do tempo</h3>
        <span className="text-[11px] text-muted-foreground">
          {comms.length} cobrança{comms.length === 1 ? "" : "s"}
        </span>
      </div>

      <ol className="relative ml-2 border-l border-border pl-4 space-y-3">
        {events.map((ev, i) => {
          if (ev.kind === "created") {
            return (
              <li key={i} className="relative">
                <Dot tone="bg-muted text-muted-foreground border-border">
                  <Plus className="w-3 h-3" />
                </Dot>
                <div className="text-[11px] text-muted-foreground mb-0.5">{fmt(ev.at)}</div>
                <div className="text-xs">Pendência criada</div>
              </li>
            );
          }
          if (ev.kind === "resolved") {
            return (
              <li key={i} className="relative">
                <Dot tone="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" />
                </Dot>
                <div className="text-[11px] text-muted-foreground mb-0.5">{fmt(ev.at)}</div>
                <div className="text-xs font-medium text-emerald-700">Resolvida</div>
                {ev.notes && <div className="text-[11px] text-muted-foreground mt-0.5">{ev.notes}</div>}
              </li>
            );
          }
          if (ev.kind === "paused") {
            return (
              <li key={i} className="relative">
                <Dot tone="bg-amber-500/15 text-amber-700 border-amber-500/30">
                  <Pause className="w-3 h-3" />
                </Dot>
                <div className="text-[11px] text-muted-foreground mb-0.5">{fmt(ev.at)}</div>
                <div className="text-xs">Follow-up pausado</div>
              </li>
            );
          }
          const Icon = CANAL_ICON[ev.canal] || FileText;
          const tone = CANAL_TONE[ev.canal] || CANAL_TONE.outro;
          return (
            <li key={i} className="relative">
              <Dot tone={tone}>
                <Icon className="w-3 h-3" />
              </Dot>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                  {CANAL_LABELS[ev.canal]}
                </span>
                <span className="text-[11px] text-muted-foreground">{fmt(ev.at)}</span>
                {ev.respondida && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700">
                    respondida
                  </span>
                )}
              </div>
              <div className="text-xs whitespace-pre-wrap">{ev.descricao}</div>
              {ev.respondida && ev.resposta && (
                <div className="mt-1 rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-[11px]">
                  <span className="font-semibold text-emerald-700">↩ Resposta:</span> {ev.resposta}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Dot({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "absolute -left-[22px] top-0 flex items-center justify-center w-5 h-5 rounded-full border",
        tone,
      )}
    >
      {children}
    </span>
  );
}

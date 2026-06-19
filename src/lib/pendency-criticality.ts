import type { Pendency } from "./pendency-types";

export type PendencyCriticality = "critica" | "urgente" | "aguardando_resposta" | "normal";

const DAY = 86_400_000;

/**
 * Compute a derived "criticality" classification for a pendency.
 * Rules (in order):
 *   critica   = prazo vencido
 *             OR (aberta há > 14d AND total_contatos = 0)
 *             OR (último contato há > 10d AND total_contatos > 0)
 *   urgente   = next_followup_at <= now()
 *             OR prazo_resposta < now() + 3d
 *   aguardando_resposta = último contato há <= 7d
 *   normal    = resto
 */
export function pendencyCriticality(p: Pendency): PendencyCriticality {
  if (p.status === "resolvida" || p.status === "cancelada") return "normal";
  const now = Date.now();
  const ageDays = Math.floor((now - new Date(p.created_at).getTime()) / DAY);
  const lastContactAge = p.ultimo_contato_em
    ? Math.floor((now - new Date(p.ultimo_contato_em).getTime()) / DAY)
    : null;
  const prazoMs = p.prazo_resposta ? new Date(p.prazo_resposta).getTime() : null;

  // critica
  if (prazoMs !== null && prazoMs < now) return "critica";
  if (ageDays > 14 && p.total_contatos === 0) return "critica";
  if (lastContactAge !== null && lastContactAge > 10 && p.total_contatos > 0) return "critica";

  // urgente — but skip if explicitly paused (user chose to stop following up)
  if (!p.followup_paused) {
    if (p.next_followup_at && new Date(p.next_followup_at).getTime() <= now) return "urgente";
    if (prazoMs !== null && prazoMs < now + 3 * DAY) return "urgente";
  }

  // aguardando
  if (lastContactAge !== null && lastContactAge <= 7) return "aguardando_resposta";

  return "normal";
}

const ORDER: Record<PendencyCriticality, number> = {
  critica: 0,
  urgente: 1,
  aguardando_resposta: 2,
  normal: 3,
};

export function criticalityRank(c: PendencyCriticality): number {
  return ORDER[c];
}

/** Tailwind class for the 3px left border stripe. */
export function criticalityStripeClass(c: PendencyCriticality): string {
  switch (c) {
    case "critica":
      return "border-l-[3px] border-l-destructive";
    case "urgente":
    case "aguardando_resposta":
      return "border-l-[3px] border-l-warning";
    default:
      return "border-l-[3px] border-l-transparent";
  }
}

/** Status pill (right side of card) contextualized by criticality. */
export function criticalityStatusPill(
  p: Pendency,
  c: PendencyCriticality,
): { label: string; tone: "danger" | "warning" | "info" | "muted" } | null {
  if (p.status === "resolvida" || p.status === "cancelada") {
    return { label: p.status === "resolvida" ? "resolvida" : "cancelada", tone: "muted" };
  }
  if (p.followup_paused) {
    return {
      label: p.followup_paused_until
        ? `pausada até ${new Date(p.followup_paused_until).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
          })}`
        : "pausada",
      tone: "muted",
    };
  }
  const now = Date.now();
  const lastContactAge = p.ultimo_contato_em
    ? Math.floor((now - new Date(p.ultimo_contato_em).getTime()) / DAY)
    : null;

  if (c === "critica") {
    if (p.prazo_resposta && new Date(p.prazo_resposta).getTime() < now) {
      return { label: "vencida", tone: "danger" };
    }
    if (lastContactAge === null) return { label: "sem contato", tone: "danger" };
    return { label: `${lastContactAge}d sem contato`, tone: "danger" };
  }
  if (c === "urgente") {
    if (p.next_followup_at && new Date(p.next_followup_at).getTime() <= now) {
      return { label: "cobrar hoje", tone: "warning" };
    }
    return { label: "vence em breve", tone: "warning" };
  }
  if (c === "aguardando_resposta") {
    return { label: `aguardando · ${lastContactAge ?? 0}d`, tone: "info" };
  }
  // normal — show "cobrar em Xd" if upcoming followup
  if (p.next_followup_at) {
    const diff = Math.ceil((new Date(p.next_followup_at).getTime() - now) / DAY);
    if (diff > 0) return { label: `cobrar em ${diff}d`, tone: "muted" };
  }
  return null;
}

import type { CellPendencyInfo } from "@/hooks/use-pendencies";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "MM/YYYY" → "jan/25" */
export function fmtComp(c: string): string {
  const [m, y] = c.split("/");
  if (!m || !y) return c;
  return `${MONTHS[Number(m) - 1] ?? m}/${y.slice(2)}`;
}

/** ["01/2025","02/2025",...,"12/2025"] → "jan–dez/25" or "jan/25, mar/25" */
export function fmtPeriod(comps: string[]): string {
  if (!comps?.length) return "";
  if (comps.length === 1) return fmtComp(comps[0]);
  const first = comps[0];
  const last = comps[comps.length - 1];
  const [m1, y1] = first.split("/");
  const [m2, y2] = last.split("/");
  if (y1 === y2) return `${MONTHS[Number(m1) - 1]}–${MONTHS[Number(m2) - 1]}/${y1.slice(2)}`;
  return `${fmtComp(first)}–${fmtComp(last)}`;
}

/** "Jane Doe" → "JD" */
export function initials(name: string): string {
  if (!name) return "?";
  const p = name.trim().split(/\s+/);
  const a = p[0]?.[0] ?? "";
  const b = p[1]?.[0] ?? p[0]?.[1] ?? "";
  return (a + b).toUpperCase();
}

const AV_COLORS = [
  "bg-primary text-primary-foreground",
  "bg-accent text-accent-foreground",
  "bg-info text-info-foreground",
];

export function avatarColor(id: string): string {
  let h = 0;
  for (const c of id ?? "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}

/** Sentence case (first letter up, rest unchanged) — preserves names already cased */
export function sentenceCase(s: string): string {
  if (!s) return s;
  // If string is FULLY uppercase, convert to title-ish casing
  const isAllUpper = s === s.toUpperCase() && /[A-ZÀ-Ý]/.test(s);
  if (isAllUpper) {
    return s
      .toLowerCase()
      .replace(/\b[\p{L}]/gu, (c) => c.toUpperCase());
  }
  return s;
}

export type DeadlineTone = "ok" | "soon" | "danger";

export function deadlineTone(deadline: string): DeadlineTone {
  if (!deadline) return "ok";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deadline);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff <= 1) return "danger";
  if (diff <= 7) return "soon";
  return "ok";
}

export function deadlineClass(tone: DeadlineTone): string {
  if (tone === "danger") return "text-destructive font-medium";
  if (tone === "soon") return "text-muted-foreground";
  return "text-success";
}

export type PendencyAlertKind = "vencida" | "externa" | "interna" | null;

export function pendencyAlertKind(pends: CellPendencyInfo[]): PendencyAlertKind {
  if (!pends?.length) return null;
  if (pends.some((p) => p.vencida)) return "vencida";
  if (pends.some((p) => p.tipo === "externa")) return "externa";
  return "interna";
}

import { useRef, useState } from "react";
import {
  MoreHorizontal,
  Pause,
  Play,
  History,
  Trash2,
  Link2,
  UserCog,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  PRIORIDADE_LABELS,
  SETOR_LABELS,
  diasAberta,
  diasUltimoContato,
  type Pendency,
  type PendencyPrioridade,
  type PendencySetor,
} from "@/lib/pendency-types";
import {
  pendencyCriticality,
  criticalityStripeClass,
  criticalityStatusPill,
} from "@/lib/pendency-criticality";
import { hasExternalContactHint } from "./RegistrarContatoExternoDialog";

// --- helpers ---------------------------------------------------------------

function sentenceCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  // Capitalize each word boundary; keep small connectors lowercase.
  const small = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "a", "o", "à"]);
  return lower
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s+$/.test(w)) return w;
      const clean = w.replace(/[^\p{L}\p{N}]/gu, "");
      if (i > 0 && small.has(clean)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function competenciaPill(comp: string): string {
  // comp is YYYY-MM-DD; show "mai/25"
  try {
    const d = new Date(comp);
    const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return `${months[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
  } catch {
    return comp;
  }
}

function lastChannelLabel(p: Pendency): string | null {
  if (!p.ultimo_contato_em) return null;
  const dt = new Date(p.ultimo_contato_em).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  return `última ${dt}`;
}

// --- types -----------------------------------------------------------------

export interface PendencyCardCompactProps {
  pendency: Pendency;
  clientName: string;
  responsavelName: string;
  responsavelOptions?: Array<{ user_id: string; display_name: string }>;
  onCobrar: () => void;
  onResolver: () => void;
  onPausar: () => void;
  onDetalhes: () => void;
  onExcluir: () => void;
  onLinkPortal?: () => void;
  onReassigned?: () => void;
  onRegistrarExterno?: () => void;
  selectable?: boolean;
  selected?: boolean;
  selectionActive?: boolean;
  onToggleSelected?: () => void;
}

// --- component -------------------------------------------------------------

export function PendencyCardCompact({
  pendency: p,
  clientName,
  responsavelName,
  responsavelOptions = [],
  onCobrar,
  onResolver,
  onPausar,
  onDetalhes,
  onExcluir,
  onLinkPortal,
  onReassigned,
  onRegistrarExterno,
  selectable = false,
  selected = false,
  selectionActive = false,
  onToggleSelected,
}: PendencyCardCompactProps) {
  const aberta = diasAberta(p.created_at);
  const ultimoCont = diasUltimoContato(p.ultimo_contato_em);
  const finalizada = p.status === "resolvida" || p.status === "cancelada";
  const externalHint = hasExternalContactHint(p);

  const showPriority = p.prioridade !== "media";

  // Derived criticality drives left-border stripe + right-side pill + sort upstream.
  const criticality = pendencyCriticality(p);
  const statusPill = criticalityStatusPill(p, criticality);

  const statusToneClass = {
    danger: "bg-destructive/15 text-destructive",
    warning: "bg-warning/20 text-warning-foreground",
    info: "bg-info/15 text-info",
    muted: "bg-muted text-muted-foreground",
  } as const;

  // Cobranças line
  let cobrancasLabel: string;
  if (p.total_contatos === 0) {
    cobrancasLabel = "nunca cobrada no sistema";
  } else {
    const sufix = lastChannelLabel(p);
    cobrancasLabel = `${p.total_contatos} cobrança${p.total_contatos > 1 ? "s" : ""}${sufix ? ` · ${sufix}` : ""}`;
  }

  // Description: prefix with [setor] for internas / documento for externas, then descricao.
  const docLabel =
    p.tipo === "externa"
      ? p.documento_solicitado
      : `[${SETOR_LABELS[p.setor_responsavel as PendencySetor] || "—"}]`;
  const descCombined = [docLabel, p.descricao].filter(Boolean).join(" — ");

  const primaryActionLabel =
    p.status === "aguardando_resposta" || p.total_contatos > 0 ? "Cobrar novamente" : "Cobrar agora";

  // Long-press → toggle selection (mobile)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  function startLongPress() {
    if (!selectable || !onToggleSelected) return;
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      onToggleSelected();
    }, 450);
  }
  function cancelLongPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  return (
    <div
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onTouchCancel={cancelLongPress}
      className={cn(
        "group rounded-lg border bg-card transition-colors hover:border-primary/40",
        "px-3 py-2.5",
        criticalityStripeClass(criticality),
        selected && "ring-1 ring-primary/40 border-primary/40 bg-primary/[0.03]",
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
        {selectable && (
          <label
            className={cn(
              "shrink-0 flex items-center justify-center w-4 h-4 mt-0.5 rounded border cursor-pointer transition",
              selected
                ? "bg-primary border-primary text-primary-foreground"
                : "bg-card border-input opacity-0 group-hover:opacity-100",
              selectionActive && "opacity-100",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelected}
              className="sr-only"
            />
            {selected && <Check className="w-3 h-3" />}
          </label>
        )}
        {/* Left: content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: client + competência + priority + status pill */}
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-[13px] font-medium leading-tight truncate"
              title={clientName}
            >
              {truncate(sentenceCase(clientName), 48)}
            </span>
            <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-info/10 text-info">
              {competenciaPill(p.competencia)}
            </span>
            {showPriority && (
              <span
                className={cn(
                  "shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
                  p.prioridade === "urgente"
                    ? "bg-destructive/15 text-destructive"
                    : p.prioridade === "alta"
                      ? "bg-warning/15 text-warning"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {PRIORIDADE_LABELS[p.prioridade as PendencyPrioridade]}
              </span>
            )}
            {statusPill && (
              <span
                className={cn(
                  "ml-auto shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded",
                  statusToneClass[statusPill.tone],
                )}
              >
                {statusPill.label}
              </span>
            )}
          </div>

          {/* Row 2: description (one line) */}
          {descCombined && (
            <p
              className="text-[11px] text-muted-foreground truncate mt-1"
              title={descCombined}
            >
              {descCombined}
            </p>
          )}

          {/* Row 3: meta */}
          <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground mt-1 min-w-0">
            <span>aberta há {aberta}d</span>
            <span aria-hidden>·</span>
            <span className={cn(p.total_contatos === 0 && aberta > 7 && "text-warning")}>
              {cobrancasLabel}
            </span>
            <span className="ml-auto truncate" title={responsavelName}>
              {responsavelName}
            </span>
          </div>

          {/* Banner: dica de contato externo não registrado */}
          {!finalizada && externalHint && onRegistrarExterno && (
            <button
              type="button"
              onClick={onRegistrarExterno}
              className="mt-2 w-full text-left flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-2 py-1.5 text-[11px] text-warning-foreground hover:bg-warning/20 transition-colors"
            >
              <span className="text-warning">⚠</span>
              <span className="flex-1">
                A descrição menciona contato com o cliente, mas nenhuma cobrança foi registrada.
              </span>
              <span className="font-medium underline-offset-2 hover:underline">
                Registrar contato externo
              </span>
            </button>
          )}
        </div>

        {/* Right: actions */}
        {!finalizada && (
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" className="h-7 px-2.5 text-xs" onClick={onCobrar}>
              {primaryActionLabel}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs"
              onClick={onResolver}
            >
              Resolver
            </Button>
            <CardMoreMenu
              pendency={p}
              responsavelOptions={responsavelOptions}
              onPausar={onPausar}
              onDetalhes={onDetalhes}
              onExcluir={onExcluir}
              onLinkPortal={onLinkPortal}
              onReassigned={onReassigned}
            />
          </div>
        )}
        {finalizada && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={onDetalhes}
            >
              <History className="w-3.5 h-3.5 mr-1" /> Histórico
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- ⋯ menu ----------------------------------------------------------------

function CardMoreMenu({
  pendency: p,
  responsavelOptions,
  onPausar,
  onDetalhes,
  onExcluir,
  onLinkPortal,
  onReassigned,
}: {
  pendency: Pendency;
  responsavelOptions: Array<{ user_id: string; display_name: string }>;
  onPausar: () => void;
  onDetalhes: () => void;
  onExcluir: () => void;
  onLinkPortal?: () => void;
  onReassigned?: () => void;
}) {
  const [reassignOpen, setReassignOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = responsavelOptions.filter((r) =>
    (r.display_name || "").toLowerCase().includes(search.toLowerCase()),
  );

  async function handleReassign(userId: string) {
    if (userId === p.responsavel_id) {
      setReassignOpen(false);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("pendencies")
      .update({ responsavel_id: userId })
      .eq("id", p.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao reatribuir: " + error.message);
      return;
    }
    toast.success("Pendência reatribuída");
    setReassignOpen(false);
    setSearch("");
    onReassigned?.();
  }

  return (
    <>
      <DropdownMenu>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">Mais ações</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={onPausar}>
            {p.followup_paused ? (
              <>
                <Play className="w-3.5 h-3.5 mr-2" /> Despausar
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5 mr-2" /> Pausar
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setReassignOpen(true)}>
            <UserCog className="w-3.5 h-3.5 mr-2" /> Reatribuir
          </DropdownMenuItem>
          {p.tipo === "externa" && onLinkPortal && (
            <DropdownMenuItem onClick={onLinkPortal}>
              <Link2 className="w-3.5 h-3.5 mr-2" /> Link do portal
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onDetalhes}>
            <History className="w-3.5 h-3.5 mr-2" /> Histórico
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onExcluir}
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Inline reassign dialog (driven by state) */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reatribuir pendência</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            placeholder="Buscar responsável..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full px-2 text-sm border rounded-md bg-card focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="max-h-72 overflow-y-auto space-y-0.5 mt-2">
            {filtered.length === 0 && (
              <div className="text-[11px] text-muted-foreground p-2 text-center">
                Nenhum responsável encontrado
              </div>
            )}
            {filtered.map((r) => {
              const isCurrent = r.user_id === p.responsavel_id;
              return (
                <button
                  key={r.user_id}
                  type="button"
                  disabled={saving}
                  onClick={() => handleReassign(r.user_id)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-2 py-2 text-sm rounded hover:bg-muted transition",
                    isCurrent && "bg-muted/50",
                    "disabled:opacity-50",
                  )}
                >
                  <span className="truncate">{r.display_name || "—"}</span>
                  {isCurrent && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

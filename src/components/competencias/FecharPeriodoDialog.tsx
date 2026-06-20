import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Upload, FileText, X, AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import {
  TIPO_DEMONSTRATIVO_OPTIONS,
  TIPO_DEMONSTRATIVO_LABEL,
  type TipoDemonstrativo,
  DEFAULT_REQUIRED_BY_TRIBUTACAO,
} from "@/lib/review-utils";
import { ReviewerPicker } from "@/components/ReviewerPicker";
import type { DemandStatus } from "@/lib/types";

interface FecharPeriodoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  tributacao: string;
  cadencia: string;
  periodoLabel: string;
  /** YYYY-MM-DD */
  periodoInicio: string;
  /** YYYY-MM-DD */
  periodoFim: string;
  /** Lookup: `${clientName}|MM|type` -> status */
  demandStatuses: Record<string, DemandStatus>;
}

interface PendingFile {
  file: File;
  tipo: TipoDemonstrativo;
}

const MONTH_FULL: Record<string, string> = {
  "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
  "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
  "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro",
};

function eachMonthInRange(startISO: string, endISO: string): { year: string; month: string }[] {
  const out: { year: string; month: string }[] = [];
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  let y = s.getFullYear();
  let m = s.getMonth(); // 0-indexed
  while (y < e.getFullYear() || (y === e.getFullYear() && m <= e.getMonth())) {
    out.push({ year: String(y), month: String(m + 1).padStart(2, "0") });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return out;
}

export function FecharPeriodoDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  tributacao,
  cadencia,
  periodoLabel,
  periodoInicio,
  periodoFim,
  demandStatuses,
}: FecharPeriodoDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inicio, setInicio] = useState(periodoInicio);
  const [fim, setFim] = useState(periodoFim);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [reviewerId, setReviewerId] = useState<string | null>(null);
  const [reviewerName, setReviewerName] = useState("");

  useEffect(() => {
    if (open) {
      setInicio(periodoInicio);
      setFim(periodoFim);
    }
  }, [open, periodoInicio, periodoFim]);

  const isLivre = cadencia === "livre";

  const { data: requiredCfg } = useQuery({
    queryKey: ["required_deliverables_by_tributacao"],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "required_deliverables_by_tributacao")
        .maybeSingle();
      return (data?.value as Record<string, TipoDemonstrativo[]>) || DEFAULT_REQUIRED_BY_TRIBUTACAO;
    },
  });

  const required = (requiredCfg?.[tributacao] || DEFAULT_REQUIRED_BY_TRIBUTACAO[tributacao] || []) as TipoDemonstrativo[];
  const presentTypes = useMemo(() => new Set(pending.map((p) => p.tipo)), [pending]);
  const missing = required.filter((r) => !presentTypes.has(r));

  // Validate range
  const months = useMemo(() => {
    if (!inicio || !fim || inicio > fim) return [];
    return eachMonthInRange(inicio, fim);
  }, [inicio, fim]);

  const validation = useMemo(() => {
    const issues: { month: string; year: string; missing: string[] }[] = [];
    months.forEach(({ year, month }) => {
      const types = ["lancamentos", "conciliacao_bancaria", "conciliacao_contabil"] as const;
      const m: string[] = [];
      types.forEach((t) => {
        const key = `${clientName}|${month}|${t}`;
        if (demandStatuses[key] !== "completed") m.push(t);
      });
      if (m.length) issues.push({ month, year, missing: m });
    });
    return issues;
  }, [months, demandStatuses, clientName]);

  const rangeOk = months.length > 0 && validation.length === 0;

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).map((file) => {
      const name = file.name.toLowerCase();
      let guess: TipoDemonstrativo = "outros";
      if (name.includes("dre")) guess = "dre";
      else if (name.includes("balancete")) guess = "balancete";
      else if (name.includes("balanco") || name.includes("balanço")) guess = "balanco";
      else if (name.includes("razao") || name.includes("razão")) guess = "razao";
      else if (name.includes("dlpa")) guess = "dlpa";
      else if (name.includes("ecd")) guess = "ecd";
      else if (name.includes("defis")) guess = "defis";
      if (guess === "outros" && missing.length > 0) guess = missing[0];
      return { file, tipo: guess };
    });
    setPending((prev) => [...prev, ...arr]);
  };

  const reset = () => {
    setPending([]);
    setReviewerId(null);
    setReviewerName("");
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!rangeOk) { toast.error("Há meses do período sem todas as etapas concluídas."); return; }
    if (pending.length === 0) { toast.error("Anexe pelo menos um demonstrativo."); return; }
    if (missing.length > 0) {
      toast.error(`Faltando: ${missing.map((t) => TIPO_DEMONSTRATIVO_LABEL[t]).join(", ")}`);
      return;
    }
    if (!reviewerId) { toast.error("Selecione a analista responsável pela revisão."); return; }

    setSubmitting(true);
    try {
      const last = months[months.length - 1];
      const competencia = `${last.year}-${last.month}-01`;

      const { data: existing } = await supabase
        .from("review_submissions")
        .select("id")
        .eq("client_id", clientId)
        .eq("competencia", competencia)
        .in("status", ["aguardando", "em_revisao"])
        .maybeSingle();
      if (existing) {
        toast.error("Já existe uma submissão ativa para esta competência.");
        setSubmitting(false);
        return;
      }

      const { count: previousCount } = await supabase
        .from("review_submissions")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("competencia", competencia);
      const nextCycle = (previousCount || 0) + 1;

      const { data: sub, error: subErr } = await supabase
        .from("review_submissions")
        .insert({
          client_id: clientId,
          competencia,
          periodo_inicio: inicio,
          periodo_fim: fim,
          cycle_number: nextCycle,
          status: "aguardando",
          submitted_by: user.id,
          reviewer_id: reviewerId,
          reviewer_assigned_at: new Date().toISOString(),
        } as any)
        .select("id")
        .single();
      if (subErr || !sub) throw subErr || new Error("Falha ao criar submissão");

      for (const item of pending) {
        const { count: vCount } = await supabase
          .from("closing_deliverables")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .eq("competencia", competencia)
          .eq("tipo_demonstrativo", item.tipo);
        const versao = (vCount || 0) + 1;
        const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${clientId}/${competencia}/${item.tipo}/v${versao}_${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("closing-deliverables")
          .upload(path, item.file, { contentType: item.file.type || "application/pdf" });
        if (upErr) throw upErr;
        const { error: delErr } = await supabase.from("closing_deliverables").insert({
          client_id: clientId,
          competencia,
          tipo_demonstrativo: item.tipo,
          titulo: `${TIPO_DEMONSTRATIVO_LABEL[item.tipo]} ${periodoLabel}`,
          arquivo_path: path,
          file_size_bytes: item.file.size,
          versao,
          gerado_por: user.id,
          origem: "unico_sci",
          review_submission_id: sub.id,
          approved: false,
        });
        if (delErr) throw delErr;
      }

      toast.success(`Período ${periodoLabel} enviado para revisão.`);
      queryClient.invalidateQueries({ queryKey: ["review-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["review-submissions-year"] });
      queryClient.invalidateQueries({ queryKey: ["v_closing_periods"] });
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast.error(`Erro ao fechar período: ${e.message || e}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fechar período — {periodoLabel}</DialogTitle>
          <DialogDescription>
            {clientName} · cadência {cadencia}. Confirme o intervalo, anexe os demonstrativos e atribua a revisora.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Início</Label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} disabled={!isLivre} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fim</Label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} disabled={!isLivre} />
            </div>
          </div>

          {/* Validation */}
          <div className={`rounded-md border p-3 text-xs ${rangeOk ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10"}`}>
            {rangeOk ? (
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="w-4 h-4" />
                {months.length} mês(es) com todas as etapas concluídas.
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-warning font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  {months.length === 0 ? "Intervalo inválido." : `${validation.length} mês(es) com etapas pendentes:`}
                </div>
                <ul className="ml-5 list-disc text-muted-foreground">
                  {validation.slice(0, 6).map((v) => (
                    <li key={`${v.year}-${v.month}`}>
                      {MONTH_FULL[v.month]}/{v.year} — falta {v.missing.map((t) =>
                        t === "lancamentos" ? "lançamentos" : t === "conciliacao_bancaria" ? "conc. bancária" : "conc. contábil"
                      ).join(", ")}
                    </li>
                  ))}
                  {validation.length > 6 && <li>… e mais {validation.length - 6}.</li>}
                </ul>
              </div>
            )}
          </div>

          {/* Required deliverables */}
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium mb-2">Demonstrativos obrigatórios:</div>
            <div className="flex flex-wrap gap-1.5">
              {required.length === 0 && (
                <span className="text-[11px] text-muted-foreground">Nenhum tipo obrigatório.</span>
              )}
              {required.map((r) => {
                const ok = presentTypes.has(r);
                return (
                  <span
                    key={r}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                      ok ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {ok ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                    {TIPO_DEMONSTRATIVO_LABEL[r]}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Reviewer */}
          <div className="space-y-1.5">
            <Label className="text-xs">Analista responsável pela revisão *</Label>
            <ReviewerPicker
              value={reviewerId}
              onChange={(id, name) => { setReviewerId(id); setReviewerName(name); }}
              placeholder="Escolha quem vai revisar..."
            />
            {reviewerName && (
              <p className="text-[10px] text-muted-foreground">
                A notificação será enviada para <strong>{reviewerName}</strong>.
              </p>
            )}
          </div>

          {/* Upload */}
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-20 border-2 border-dashed border-border rounded-md hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary"
            >
              <Upload className="w-5 h-5" />
              <span className="text-xs">Selecionar PDFs (UNICO SCI)</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
            />
          </div>

          {pending.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium">Anexos ({pending.length})</div>
              {pending.map((p, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-md border bg-card">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{p.file.name}</div>
                    <div className="text-[10px] text-muted-foreground">{(p.file.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <select
                    value={p.tipo}
                    onChange={(e) => setPending((prev) => prev.map((x, idx) => idx === i ? { ...x, tipo: e.target.value as TipoDemonstrativo } : x))}
                    className="h-7 px-2 text-[11px] border rounded bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {TIPO_DEMONSTRATIVO_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setPending((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-destructive"
                    type="button"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !rangeOk || pending.length === 0 || missing.length > 0 || !reviewerId}
          >
            {submitting ? "Enviando..." : "Fechar período e liberar revisão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

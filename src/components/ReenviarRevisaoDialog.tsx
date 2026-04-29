import { useState, useMemo, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Upload, FileText, X, AlertTriangle, Reply } from "lucide-react";
import {
  TIPO_DEMONSTRATIVO_OPTIONS,
  TIPO_DEMONSTRATIVO_LABEL,
  type TipoDemonstrativo,
  DEFAULT_REQUIRED_BY_TRIBUTACAO,
} from "@/lib/review-utils";
import { ReviewerPicker } from "@/components/ReviewerPicker";

interface ReenviarRevisaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The previous submission being replaced (status = devolvido). */
  previousSubmissionId: string;
  clientId: string;
  clientName: string;
  competencia: string; // YYYY-MM-DD
  tributacao: string;
  /** Apontamentos abertos da submissão anterior, para preencher resumo. */
  apontamentosAnteriores?: { descricao: string; conta_referencia: string | null; tipo?: TipoDemonstrativo }[];
  onSubmitted?: () => void;
}

interface PendingFile {
  file: File;
  tipo: TipoDemonstrativo;
}

export function ReenviarRevisaoDialog({
  open,
  onOpenChange,
  previousSubmissionId,
  clientId,
  clientName,
  competencia,
  tributacao,
  apontamentosAnteriores = [],
  onSubmitted,
}: ReenviarRevisaoDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [resumo, setResumo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewerId, setReviewerId] = useState<string | null>(null);
  const [reviewerName, setReviewerName] = useState<string>("");

  // Pré-selecionar a revisora anterior (mesma da submissão devolvida).
  useEffect(() => {
    if (!open || reviewerId) return;
    (async () => {
      const { data } = await supabase
        .from("review_submissions")
        .select("reviewer_id")
        .eq("id", previousSubmissionId)
        .maybeSingle();
      if (data?.reviewer_id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", data.reviewer_id)
          .maybeSingle();
        setReviewerId(data.reviewer_id);
        setReviewerName(prof?.display_name || "");
      }
    })();
  }, [open, previousSubmissionId, reviewerId]);

  // Pré-popular o resumo com referências aos apontamentos
  useEffect(() => {
    if (open && apontamentosAnteriores.length > 0 && !resumo) {
      const lines = apontamentosAnteriores
        .slice(0, 6)
        .map((a) => `• ${a.conta_referencia ? `[${a.conta_referencia}] ` : ""}${a.descricao}`)
        .join("\n");
      setResumo(`Ajustes aplicados:\n${lines}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const handleSubmit = async () => {
    if (!user) return;
    if (pending.length === 0) { toast.error("Anexe pelo menos um demonstrativo corrigido."); return; }
    if (missing.length > 0) {
      toast.error(`Faltando: ${missing.map((t) => TIPO_DEMONSTRATIVO_LABEL[t]).join(", ")}`);
      return;
    }
    if (!reviewerId) {
      toast.error("Selecione a analista responsável pela revisão.");
      return;
    }
    setSubmitting(true);
    try {
      // 1) Cancelar a submissão devolvida (mantém histórico mas libera o índice único).
      const { error: cancelErr } = await supabase
        .from("review_submissions")
        .update({ status: "cancelado" })
        .eq("id", previousSubmissionId);
      if (cancelErr) throw cancelErr;

      // 2) Determinar próximo cycle_number
      const { count: previousCount } = await supabase
        .from("review_submissions")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("competencia", competencia);
      const nextCycle = (previousCount || 1) + 1;

      // 3) Criar nova submissão
      const { data: sub, error: subErr } = await supabase
        .from("review_submissions")
        .insert({
          client_id: clientId,
          competencia,
          cycle_number: nextCycle,
          status: "aguardando",
          submitted_by: user.id,
          review_summary: resumo || null,
          reviewer_id: reviewerId,
          reviewer_assigned_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (subErr || !sub) throw subErr || new Error("Falha ao criar nova submissão");

      // 4) Upload dos PDFs como nova versão
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
          titulo: `${TIPO_DEMONSTRATIVO_LABEL[item.tipo]} (v${versao})`,
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

      toast.success(`Nova submissão #${nextCycle} enviada para revisão.`);
      supabase.functions.invoke("notify-review-event", { body: { event: "submitted", submission_id: sub.id } }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["review-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["review-submissions-year"] });
      queryClient.invalidateQueries({ queryKey: ["review-badge"] });
      onOpenChange(false);
      setPending([]);
      setResumo("");
      onSubmitted?.();
    } catch (e: any) {
      toast.error(`Erro ao reenviar: ${e.message || e}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Reply className="w-4 h-4" /> Reenviar para revisão
          </DialogTitle>
          <DialogDescription>
            {clientName} · Anexe a versão corrigida dos demonstrativos. Os arquivos anteriores são preservados como histórico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {apontamentosAnteriores.length > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
              <div className="text-xs font-medium mb-1.5 text-warning-foreground">Apontamentos a corrigir</div>
              <ul className="space-y-1">
                {apontamentosAnteriores.map((a, i) => (
                  <li key={i} className="text-[11px] text-foreground/80">
                    {a.conta_referencia && (
                      <span className="font-mono text-[10px] bg-foreground/5 px-1 py-0.5 rounded mr-1">{a.conta_referencia}</span>
                    )}
                    {a.descricao}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium mb-2">Demonstrativos obrigatórios:</div>
            <div className="flex flex-wrap gap-1.5">
              {required.map((r) => {
                const ok = presentTypes.has(r);
                return (
                  <span
                    key={r}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                      ok ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {ok ? "✓" : "•"} {TIPO_DEMONSTRATIVO_LABEL[r]}
                  </span>
                );
              })}
            </div>
            {missing.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive">
                <AlertTriangle className="w-3 h-3" />
                Faltando: {missing.map((t) => TIPO_DEMONSTRATIVO_LABEL[t]).join(", ")}
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-20 border-2 border-dashed border-border rounded-md hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary"
            >
              <Upload className="w-5 h-5" />
              <span className="text-xs">Selecionar PDFs corrigidos</span>
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
                    onChange={(e) => setPending((prev) => prev.map((x, j) => j === i ? { ...x, tipo: e.target.value as TipoDemonstrativo } : x))}
                    className="h-7 px-2 text-[11px] border rounded bg-card"
                  >
                    {TIPO_DEMONSTRATIVO_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <button onClick={() => setPending((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Resumo das correções (vai para a revisora)</Label>
            <Textarea
              value={resumo}
              onChange={(e) => setResumo(e.target.value)}
              rows={4}
              className="text-xs"
              placeholder="Descreva o que foi corrigido em cada apontamento..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting || pending.length === 0 || missing.length > 0}>
            {submitting ? "Enviando..." : "Reenviar para revisão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Upload, FileText, X, AlertTriangle } from "lucide-react";
import {
  TIPO_DEMONSTRATIVO_OPTIONS,
  TIPO_DEMONSTRATIVO_LABEL,
  type TipoDemonstrativo,
  DEFAULT_REQUIRED_BY_TRIBUTACAO,
  buildCompetenciaDate,
} from "@/lib/review-utils";

interface LiberarRevisaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  clientId: string | null;
  tributacao: string;
  year: string;
  /** "MM" string when liberating a single month, or null to ask the user to pick. */
  defaultMonth?: string | null;
}

interface PendingFile {
  file: File;
  tipo: TipoDemonstrativo;
}

const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const MONTH_FULL: Record<string, string> = {
  "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
  "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
  "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro",
};

export function LiberarRevisaoDialog({
  open,
  onOpenChange,
  clientName,
  clientId,
  tributacao,
  year,
  defaultMonth,
}: LiberarRevisaoDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [month, setMonth] = useState<string>(defaultMonth || "12");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Fetch required deliverables config from settings
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
      // Try to guess the type from the filename
      const name = file.name.toLowerCase();
      let guess: TipoDemonstrativo = "outros";
      if (name.includes("dre")) guess = "dre";
      else if (name.includes("balancete")) guess = "balancete";
      else if (name.includes("balanco") || name.includes("balanço")) guess = "balanco";
      else if (name.includes("razao") || name.includes("razão")) guess = "razao";
      else if (name.includes("dlpa")) guess = "dlpa";
      else if (name.includes("ecd")) guess = "ecd";
      else if (name.includes("defis")) guess = "defis";
      // Pick first missing required type as fallback
      if (guess === "outros" && missing.length > 0) guess = missing[0];
      return { file, tipo: guess };
    });
    setPending((prev) => [...prev, ...arr]);
  };

  const updateTipo = (idx: number, tipo: TipoDemonstrativo) => {
    setPending((prev) => prev.map((p, i) => (i === idx ? { ...p, tipo } : p)));
  };

  const removeFile = (idx: number) => {
    setPending((prev) => prev.filter((_, i) => i !== idx));
  };

  const reset = () => {
    setPending([]);
    setMonth(defaultMonth || "12");
  };

  const handleSubmit = async () => {
    if (!user || !clientId) {
      toast.error("Cliente não identificado.");
      return;
    }
    if (pending.length === 0) {
      toast.error("Anexe pelo menos um demonstrativo.");
      return;
    }
    if (missing.length > 0) {
      toast.error(`Faltando: ${missing.map((t) => TIPO_DEMONSTRATIVO_LABEL[t]).join(", ")}`);
      return;
    }

    setSubmitting(true);
    try {
      const competencia = buildCompetenciaDate(year, month);

      // 1) Verify there is no active submission (server constraint will also enforce)
      const { data: existing } = await supabase
        .from("review_submissions")
        .select("id, cycle_number")
        .eq("client_id", clientId)
        .eq("competencia", competencia)
        .in("status", ["aguardando", "em_revisao"])
        .maybeSingle();
      if (existing) {
        toast.error("Já existe uma submissão ativa para esta competência.");
        setSubmitting(false);
        return;
      }

      // Determine the next cycle number (count previous submissions for this client+competencia)
      const { count: previousCount } = await supabase
        .from("review_submissions")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("competencia", competencia);
      const nextCycle = (previousCount || 0) + 1;

      // 2) Create review_submission
      const { data: sub, error: subErr } = await supabase
        .from("review_submissions")
        .insert({
          client_id: clientId,
          competencia,
          cycle_number: nextCycle,
          status: "aguardando",
          submitted_by: user.id,
        })
        .select("id")
        .single();
      if (subErr || !sub) throw subErr || new Error("Falha ao criar submissão");

      // 3) Upload PDFs and create deliverables
      for (const item of pending) {
        // Determine version (count of existing deliverables of same tipo)
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
          titulo: `${TIPO_DEMONSTRATIVO_LABEL[item.tipo]} ${MONTH_FULL[month]}/${year}`,
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

      toast.success(`Submissão #${nextCycle} criada com ${pending.length} demonstrativo(s).`);
      queryClient.invalidateQueries({ queryKey: ["review-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["review-badge"] });
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast.error(`Erro ao liberar para revisão: ${e.message || e}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Liberar para revisão</DialogTitle>
          <DialogDescription>
            {clientName} — anexe os demonstrativos contábeis gerados no UNICO SCI.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!defaultMonth && (
            <div className="space-y-1.5">
              <Label className="text-xs">Competência</Label>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-9 w-full px-3 text-sm border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {MONTHS.map((m) => (
                  <option key={m} value={m}>{MONTH_FULL[m]}/{year}</option>
                ))}
              </select>
            </div>
          )}
          {defaultMonth && (
            <div className="text-xs text-muted-foreground">
              Competência: <strong className="text-foreground">{MONTH_FULL[defaultMonth]}/{year}</strong>
            </div>
          )}

          {/* Required summary */}
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium mb-2">Demonstrativos obrigatórios para esta tributação:</div>
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
              {required.length === 0 && (
                <span className="text-[11px] text-muted-foreground">Nenhum tipo obrigatório configurado.</span>
              )}
            </div>
            {missing.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive">
                <AlertTriangle className="w-3 h-3" />
                Faltando: {missing.map((t) => TIPO_DEMONSTRATIVO_LABEL[t]).join(", ")}
              </div>
            )}
          </div>

          {/* Drop area */}
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
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {/* Pending list */}
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
                    onChange={(e) => updateTipo(i, e.target.value as TipoDemonstrativo)}
                    className="h-7 px-2 text-[11px] border rounded bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {TIPO_DEMONSTRATIVO_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeFile(i)}
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
            disabled={submitting || pending.length === 0 || missing.length > 0}
          >
            {submitting ? "Enviando..." : "Liberar para revisão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

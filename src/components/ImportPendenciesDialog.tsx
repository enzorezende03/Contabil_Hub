import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Upload, CheckCircle2, Loader2 } from "lucide-react";

type TemplateType = "conciliacao_bancaria" | "documentos" | "outro";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId?: string;
  clientName?: string;
  competencia?: string;   // YYYY-MM-DD
  month?: string;
  year?: string;
}

interface Client { id: string; razao_social: string; }

const TEMPLATE_LABEL: Record<TemplateType, string> = {
  conciliacao_bancaria: "Conciliação Bancária",
  documentos: "Documentos",
  outro: "Outro",
};

const TEMPLATE_COLUMNS: Record<TemplateType, string[]> = {
  conciliacao_bancaria: ["Banco", "Conta", "Período", "Descrição", "Prazo (DD/MM/AAAA)", "Prioridade (baixa|media|alta|urgente)"],
  documentos: ["Documento", "Descrição", "Prazo (DD/MM/AAAA)", "Prioridade (baixa|media|alta|urgente)"],
  outro: ["Descrição", "Prazo (DD/MM/AAAA)", "Prioridade (baixa|media|alta|urgente)"],
};

interface ParsedRow {
  descricao: string;
  prazo: string | null;
  prioridade: "baixa" | "media" | "alta" | "urgente";
  raw: Record<string, any>;
  valid: boolean;
  error?: string;
}

function parsePrazo(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}
function parsePrioridade(v: any): ParsedRow["prioridade"] {
  const s = String(v || "").toLowerCase().trim();
  if (["baixa", "media", "alta", "urgente"].includes(s)) return s as any;
  return "media";
}

function buildDescricaoFromRow(template: TemplateType, row: Record<string, any>): string {
  if (template === "conciliacao_bancaria") {
    const parts = [
      row["Banco"] && `Banco: ${row["Banco"]}`,
      row["Conta"] && `Conta: ${row["Conta"]}`,
      row["Período"] && `Período: ${row["Período"]}`,
      row["Descrição"],
    ].filter(Boolean);
    return parts.join(" — ");
  }
  if (template === "documentos") {
    const parts = [row["Documento"] && `${row["Documento"]}`, row["Descrição"]].filter(Boolean);
    return parts.join(" — ");
  }
  return String(row["Descrição"] || "").trim();
}

export function ImportPendenciesDialog({ open, onOpenChange, clientId: propClientId, clientName: propClientName, competencia, month, year }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const initialComp = competencia || (month && year ? `${year}-${month.padStart(2, "0")}-01` : "");

  const [step, setStep] = useState<"setup" | "preview" | "done">("setup");
  const [clientId, setClientId] = useState(propClientId || "");
  const [comp, setComp] = useState(initialComp);
  const [templateType, setTemplateType] = useState<TemplateType>("conciliacao_bancaria");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [createdBatchId, setCreatedBatchId] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    if (!open) return;
    setStep("setup");
    setFile(null);
    setRows([]);
    setCreatedBatchId(null);
    setCreatedCount(0);
    setClientId(propClientId || "");
    setComp(initialComp);
    supabase.from("clients").select("id, razao_social").order("razao_social").then(({ data }) => setClients((data || []) as Client[]));
  }, [open, propClientId, initialComp]);

  const selectedClientName = useMemo(() => propClientName || clients.find((c) => c.id === clientId)?.razao_social || "", [clients, clientId, propClientName]);

  function downloadTemplate() {
    const cols = TEMPLATE_COLUMNS[templateType];
    const ws = XLSX.utils.aoa_to_sheet([cols, cols.map(() => "")]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendencias");
    XLSX.writeFile(wb, `template_pendencias_${templateType}.xlsx`);
  }

  async function handleFile(f: File) {
    setFile(f);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
    const parsed: ParsedRow[] = data.map((row) => {
      const descricao = buildDescricaoFromRow(templateType, row);
      const prazo = parsePrazo(row["Prazo (DD/MM/AAAA)"] ?? row["Prazo"]);
      const prioridade = parsePrioridade(row["Prioridade (baixa|media|alta|urgente)"] ?? row["Prioridade"]);
      return {
        descricao,
        prazo,
        prioridade,
        raw: row,
        valid: descricao.length > 0,
        error: descricao.length === 0 ? "Descrição vazia" : undefined,
      };
    });
    setRows(parsed);
    setStep("preview");
  }

  async function handleImport() {
    if (!user || !clientId || !comp) { toast.error("Selecione cliente e competência"); return; }
    const validRows = rows.filter((r) => r.valid);
    if (validRows.length === 0) { toast.error("Nenhuma linha válida"); return; }

    setImporting(true);
    try {
      // 1. Upload arquivo
      let arquivoPath: string | null = null;
      if (file) {
        const path = `${clientId}/${comp.slice(0, 7)}/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from("pendency-imports").upload(path, file, {
          contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: false,
        });
        if (upErr) throw new Error(`Upload falhou: ${upErr.message}`);
        arquivoPath = path;
      }

      // 2. Criar batch
      const { data: batch, error: batchErr } = await supabase
        .from("pendency_import_batches")
        .insert({
          client_id: clientId,
          competencia: comp,
          template_type: templateType,
          arquivo_path: arquivoPath,
          arquivo_nome: file?.name || null,
          total_linhas: rows.length,
          total_criadas: validRows.length,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (batchErr || !batch) throw new Error(`Lote falhou: ${batchErr?.message}`);

      // 3. Criar pendências
      const pendRows = validRows.map((r) => ({
        client_id: clientId,
        competencia: comp,
        tipo: "externa" as const,
        descricao: r.descricao,
        prioridade: r.prioridade,
        prazo_resposta: r.prazo,
        responsavel_id: user.id,
        created_by: user.id,
        import_batch_id: batch.id,
        followup_cadence_days: 5,
      }));
      const { error: pendErr } = await supabase.from("pendencies").insert(pendRows);
      if (pendErr) throw new Error(`Criação de pendências falhou: ${pendErr.message}`);

      setCreatedBatchId(batch.id);
      setCreatedCount(validRows.length);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["pendencies"] });
      qc.invalidateQueries({ queryKey: ["pendencies-by-cell"] });
      qc.invalidateQueries({ queryKey: ["pendencies-by-planning"] });
      toast.success(`${validRows.length} pendência(s) criada(s) em lote`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao importar");
    } finally {
      setImporting(false);
    }
  }

  async function gerarLinkPortal() {
    if (!createdBatchId) return;
    toast.info("Gerando links de acesso para o cliente...");
    // Cria um token por pendência do lote
    const { data: pends } = await supabase
      .from("pendencies")
      .select("id")
      .eq("import_batch_id", createdBatchId);
    if (!pends?.length) { toast.error("Nenhuma pendência encontrada no lote"); return; }
    const results = await Promise.all(
      pends.map((p) =>
        supabase.functions.invoke("pendency-token-create", { body: { pendencyId: p.id, expiresInDays: 30 } }),
      ),
    );
    const okCount = results.filter((r) => !r.error && (r.data as any)?.token).length;
    toast.success(`${okCount} link(s) gerado(s). Acesse cada pendência para copiar o código.`);
    onOpenChange(false);
  }

  const validCount = rows.filter((r) => r.valid).length;
  const invalidCount = rows.length - validCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" /> Importar planilha de pendências
          </DialogTitle>
          <DialogDescription>
            Importe múltiplas pendências externas a partir de uma planilha Excel. A planilha original fica anexada ao lote para histórico.
          </DialogDescription>
        </DialogHeader>

        {step === "setup" && (
          <div className="space-y-4 py-2">
            {!propClientId && (
              <div className="space-y-1.5">
                <Label>Cliente *</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {propClientName && (
              <div className="text-sm"><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{propClientName}</span></div>
            )}

            <div className="space-y-1.5">
              <Label>Competência *</Label>
              <Input type="date" value={comp} onChange={(e) => setComp(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select value={templateType} onValueChange={(v) => setTemplateType(v as TemplateType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TEMPLATE_LABEL) as TemplateType[]).map((k) => (
                    <SelectItem key={k} value={k}>{TEMPLATE_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Colunas esperadas: {TEMPLATE_COLUMNS[templateType].join(", ")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="button" variant="outline" onClick={downloadTemplate}>
                <Download className="w-4 h-4 mr-1" /> Baixar template em branco
              </Button>
              <Label htmlFor="pendency-import-file" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90 text-sm font-medium">
                <Upload className="w-4 h-4" /> Selecionar planilha preenchida
              </Label>
              <input
                id="pendency-import-file"
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (!clientId || !comp) { toast.error("Selecione cliente e competência antes"); return; }
                  handleFile(f);
                }}
              />
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-3 py-2">
            <div className="text-sm flex items-center gap-3">
              <span><span className="text-muted-foreground">Arquivo:</span> <span className="font-medium">{file?.name}</span></span>
              <span className="text-emerald-600">{validCount} válidas</span>
              {invalidCount > 0 && <span className="text-destructive">{invalidCount} inválidas</span>}
            </div>
            <div className="border rounded-md max-h-80 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5">#</th>
                    <th className="text-left px-2 py-1.5">Descrição</th>
                    <th className="text-left px-2 py-1.5">Prazo</th>
                    <th className="text-left px-2 py-1.5">Prioridade</th>
                    <th className="text-left px-2 py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, i) => (
                    <tr key={i} className={r.valid ? "" : "bg-destructive/5"}>
                      <td className="px-2 py-1.5">{i + 1}</td>
                      <td className="px-2 py-1.5">{r.descricao || <span className="text-muted-foreground italic">(vazio)</span>}</td>
                      <td className="px-2 py-1.5">{r.prazo || "—"}</td>
                      <td className="px-2 py-1.5">{r.prioridade}</td>
                      <td className="px-2 py-1.5">
                        {r.valid ? <span className="text-emerald-600">OK</span> : <span className="text-destructive" title={r.error}>Pular</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
            <div>
              <p className="font-medium">{createdCount} pendência(s) criada(s) com sucesso</p>
              <p className="text-sm text-muted-foreground">
                Cliente: {selectedClientName} · Competência: {comp}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "setup" && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("setup")} disabled={importing}>Voltar</Button>
              <Button onClick={handleImport} disabled={importing || validCount === 0}>
                {importing ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importando...</> : `Criar ${validCount} pendência(s)`}
              </Button>
            </>
          )}
          {step === "done" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button onClick={gerarLinkPortal}>Gerar links para o cliente responder</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

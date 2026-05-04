import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface DbClient { id: string; cnpj: string; razao_social: string }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  year: string;
  clients: DbClient[];
  onImported?: () => void;
}

const MONTHS_PT: Record<string, number> = {
  janeiro: 1, fevereiro: 2, "março": 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

function normalizeCnpj(s: string): string | null {
  const m = String(s ?? "").match(/(\d{14})\s*$/);
  if (m) return m[1];
  const digits = String(s ?? "").replace(/\D/g, "");
  return digits.length === 14 ? digits : null;
}

function detectMonth(s: any): number {
  if (s == null) return 0;
  const txt = String(s).toLowerCase();
  const m = txt.match(/atividade\s*:\s*(\d{1,2})\s*-/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 12) return n;
  }
  for (const [name, num] of Object.entries(MONTHS_PT)) {
    if (txt.includes(name)) return num;
  }
  return 0;
}

interface Row {
  cnpj: string;
  razao_social_planilha: string;
  matched_client?: DbClient;
  lanc: number;
  conc: number;
  desativado: boolean;
}

export function ImportGClickDialog({ open, onOpenChange, year, clients, onImported }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [fileName, setFileName] = useState<string>("");

  const cnpjMap = useMemo(() => {
    const m = new Map<string, DbClient>();
    clients.forEach((c) => { if (c.cnpj) m.set(String(c.cnpj).replace(/\D/g, ""), c); });
    return m;
  }, [clients]);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });

    // Aggregate by cnpj
    const agg = new Map<string, Row>();
    for (const r of data) {
      const cnpj = normalizeCnpj(r["Cliente"]);
      if (!cnpj) continue;
      const assunto = String(r["Assunto"] ?? "").toLowerCase();
      const desativado = String(r["Status do Cliente"] ?? "").toLowerCase() === "desativado";
      const month = detectMonth(r["Último Andamento"]);
      const matched = cnpjMap.get(cnpj);

      let row = agg.get(cnpj);
      if (!row) {
        row = {
          cnpj,
          razao_social_planilha: String(r["Cliente"] ?? "").replace(/\s*-\s*\d{14}\s*$/, ""),
          matched_client: matched,
          lanc: 0,
          conc: 0,
          desativado,
        };
        agg.set(cnpj, row);
      }
      if (desativado) row.desativado = true;
      if (assunto.includes("lançamento") || assunto.includes("lancamento")) {
        if (month > row.lanc) row.lanc = month;
      } else if (assunto.includes("concilia")) {
        if (month > row.conc) row.conc = month;
      }
    }

    const list = Array.from(agg.values()).sort((a, b) => a.razao_social_planilha.localeCompare(b.razao_social_planilha));
    setRows(list);
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const desativados = rows.filter((r) => r.desativado).length;
    const naoEncontrados = rows.filter((r) => !r.desativado && !r.matched_client).length;
    const semProgresso = rows.filter((r) => !r.desativado && r.matched_client && r.lanc === 0 && r.conc === 0).length;
    const aplicaveis = rows.filter((r) => !r.desativado && r.matched_client && (r.lanc > 0 || r.conc > 0));
    const totalUpserts = aplicaveis.reduce((acc, r) => acc + r.lanc + r.conc, 0);
    return { total, desativados, naoEncontrados, semProgresso, aplicaveis: aplicaveis.length, totalUpserts };
  }, [rows]);

  const handleConfirm = async () => {
    if (!user) return;
    const aplicaveis = rows.filter((r) => !r.desativado && r.matched_client && (r.lanc > 0 || r.conc > 0));
    if (aplicaveis.length === 0) { toast.error("Nada para importar."); return; }

    setSubmitting(true);
    try {
      const upserts: any[] = [];
      for (const r of aplicaveis) {
        const client = r.matched_client!.razao_social;
        for (let m = 1; m <= r.lanc; m++) {
          upserts.push({ client_name: client, month: String(m).padStart(2, "0"), year, demand_type: "lancamentos", status: "completed", filled_by: user.id });
        }
        for (let m = 1; m <= r.conc; m++) {
          upserts.push({ client_name: client, month: String(m).padStart(2, "0"), year, demand_type: "conciliacao_contabil", status: "completed", filled_by: user.id });
        }
      }

      const chunkSize = 500;
      for (let i = 0; i < upserts.length; i += chunkSize) {
        const chunk = upserts.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("demand_status_entries")
          .upsert(chunk, { onConflict: "client_name,month,year,demand_type" });
        if (error) throw error;
      }

      toast.success(`Importação concluída — ${aplicaveis.length} cliente(s), ${upserts.length} status atualizado(s).`);
      onImported?.();
      onOpenChange(false);
      setRows([]);
      setFileName("");
    } catch (e: any) {
      toast.error(`Erro ao importar: ${e.message || e}`);
    } finally {
      setSubmitting(false);
    }
  };

  const monthLabel = (n: number) => n === 0 ? "—" : ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][n - 1];

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setRows([]); setFileName(""); } }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar planilha do G-Click — {year}</DialogTitle>
          <DialogDescription>
            Lê a coluna "Último Andamento" e marca como <strong>Concluído</strong> os meses até o último andamento de cada cliente,
            nas categorias <strong>Lançamentos</strong> e <strong>Conciliação Contábil</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full h-20 border-2 border-dashed border-border rounded-md hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary"
            >
              <Upload className="w-5 h-5" />
              <span className="text-xs">{fileName ? `Selecionado: ${fileName}` : "Selecionar planilha .xlsx do G-Click"}</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {rows.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <div className="rounded-md border bg-card p-2">
                  <div className="text-muted-foreground">Total na planilha</div>
                  <div className="text-base font-semibold">{stats.total}</div>
                </div>
                <div className="rounded-md border bg-card p-2">
                  <div className="text-muted-foreground">Aplicáveis</div>
                  <div className="text-base font-semibold text-emerald-600">{stats.aplicaveis}</div>
                </div>
                <div className="rounded-md border bg-card p-2">
                  <div className="text-muted-foreground">Sem progresso</div>
                  <div className="text-base font-semibold">{stats.semProgresso}</div>
                </div>
                <div className="rounded-md border bg-card p-2">
                  <div className="text-muted-foreground">Não encontrados</div>
                  <div className="text-base font-semibold text-amber-600">{stats.naoEncontrados}</div>
                </div>
                <div className="rounded-md border bg-card p-2">
                  <div className="text-muted-foreground">Desativados</div>
                  <div className="text-base font-semibold text-muted-foreground">{stats.desativados}</div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Serão gravados <strong>{stats.totalUpserts}</strong> registros de status (meses concluídos).
              </div>

              <div className="border rounded-md max-h-[40vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">Cliente (planilha)</th>
                      <th className="text-left p-2 font-medium">CNPJ</th>
                      <th className="text-left p-2 font-medium">Match</th>
                      <th className="text-center p-2 font-medium">Lançamento até</th>
                      <th className="text-center p-2 font-medium">Conciliação até</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const skip = r.desativado || !r.matched_client || (r.lanc === 0 && r.conc === 0);
                      return (
                        <tr key={r.cnpj} className={skip ? "opacity-50" : ""}>
                          <td className="p-2 truncate max-w-[280px]">{r.razao_social_planilha}</td>
                          <td className="p-2 font-mono text-[10px]">{r.cnpj}</td>
                          <td className="p-2">
                            {r.desativado ? (
                              <span className="inline-flex items-center gap-1 text-muted-foreground"><X className="w-3 h-3" /> Desativado</span>
                            ) : r.matched_client ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3 h-3" /> {r.matched_client.razao_social.slice(0, 30)}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="w-3 h-3" /> Não encontrado</span>
                            )}
                          </td>
                          <td className="p-2 text-center">{monthLabel(r.lanc)}</td>
                          <td className="p-2 text-center">{monthLabel(r.conc)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={submitting || stats.aplicaveis === 0}>
            <FileSpreadsheet className="w-4 h-4 mr-1.5" />
            {submitting ? "Importando..." : `Confirmar importação (${stats.aplicaveis} cliente(s))`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

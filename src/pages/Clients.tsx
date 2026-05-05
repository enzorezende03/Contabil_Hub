import { useState, useRef } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Building2, Search, Upload, Download } from "lucide-react";
import { ClientContactsManager } from "@/components/ClientContactsManager";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const TRIBUTACAO_OPTIONS = [
  { value: "simples_nacional", label: "Simples Nacional" },
  { value: "lucro_presumido", label: "Lucro Presumido" },
  { value: "lucro_real", label: "Lucro Real" },
  { value: "isenta_imune", label: "Isenta/Imune" },
];

const UNIDADE_OPTIONS = [
  { value: "2m_contabilidade", label: "2M Contabilidade" },
  { value: "2m_saude", label: "2M Saúde" },
];

const PERFIL_OPTIONS = [
  { value: "vip", label: "VIP" },
  { value: "premium", label: "Premium" },
  { value: "standard", label: "Standard" },
  { value: "basico", label: "Básico" },
];

const PERFIL_LABELS: Record<string, string> = Object.fromEntries(
  PERFIL_OPTIONS.map((p) => [p.value, p.label])
);

const PERFIL_COLORS: Record<string, string> = {
  vip: "bg-yellow-500/15 text-yellow-600",
  premium: "bg-purple-500/15 text-purple-600",
  standard: "bg-blue-500/15 text-blue-600",
  basico: "bg-gray-500/15 text-gray-600",
};

const TRIBUTACAO_LABELS: Record<string, string> = Object.fromEntries(
  TRIBUTACAO_OPTIONS.map((t) => [t.value, t.label])
);

const UNIDADE_LABELS: Record<string, string> = Object.fromEntries(
  UNIDADE_OPTIONS.map((u) => [u.value, u.label])
);

interface ClientForm {
  cnpj: string;
  razao_social: string;
  tributacao: string;
  unidade: string;
  obrigatoriedade_ecd: boolean;
  competencia_inicio: string;
  perfil: string;
}

const emptyForm: ClientForm = {
  cnpj: "",
  razao_social: "",
  tributacao: "simples_nacional",
  unidade: "2m_contabilidade",
  obrigatoriedade_ecd: false,
  competencia_inicio: "",
  perfil: "standard",
};

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/**
 * Normaliza um valor de "Competência Início" para o formato MM/YYYY.
 * Aceita: MM/YYYY, M/YYYY, YYYY-MM, YYYY-MM-DD, YYYY/MM/DD, datas Date e seriais Excel.
 * Retorna null se não conseguir interpretar.
 */
export function normalizeCompetencia(input: unknown): string | null {
  if (input == null || input === "") return null;

  // Date object (xlsx pode entregar Date)
  if (input instanceof Date && !isNaN(input.getTime())) {
    const mm = String(input.getMonth() + 1).padStart(2, "0");
    return `${mm}/${input.getFullYear()}`;
  }

  // Serial Excel (número)
  if (typeof input === "number" && isFinite(input)) {
    // Excel epoch: 1899-12-30
    const ms = Math.round(input * 86400000) + Date.UTC(1899, 11, 30);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      return `${mm}/${d.getUTCFullYear()}`;
    }
  }

  const raw = String(input).trim();
  if (!raw) return null;

  // YYYY-MM-DD ou YYYY/MM/DD
  let m = raw.match(/^(\d{4})[-/](\d{1,2})[-/]\d{1,2}/);
  if (m) return `${m[2].padStart(2, "0")}/${m[1]}`;

  // YYYY-MM ou YYYY/MM
  m = raw.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) return `${m[2].padStart(2, "0")}/${m[1]}`;

  // MM/YYYY ou M/YYYY
  m = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mo = parseInt(m[1], 10);
    if (mo >= 1 && mo <= 12) return `${String(mo).padStart(2, "0")}/${m[2]}`;
  }

  // DD/MM/YYYY
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mo = parseInt(m[2], 10);
    if (mo >= 1 && mo <= 12) return `${String(mo).padStart(2, "0")}/${m[3]}`;
  }

  return null;
}

export default function Clients() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [filterTributacao, setFilterTributacao] = useState<string>("all");
  const [filterUnidade, setFilterUnidade] = useState<string>("all");
  const [filterPerfil, setFilterPerfil] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("razao_social");
      if (error) throw error;
      return data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: ClientForm & { id?: string }) => {
      const cnpjDigits = payload.cnpj.replace(/\D/g, "");
      if (cnpjDigits.length !== 14) throw new Error("CNPJ deve ter 14 dígitos");
      if (!payload.razao_social.trim()) throw new Error("Razão Social é obrigatória");
      if (!payload.competencia_inicio.trim()) throw new Error("Competência é obrigatória");
      const compNorm = normalizeCompetencia(payload.competencia_inicio);
      if (!compNorm) throw new Error("Competência inválida. Use o formato MM/AAAA.");

      const record = {
        cnpj: cnpjDigits,
        razao_social: payload.razao_social.trim(),
        tributacao: payload.tributacao,
        unidade: payload.unidade,
        obrigatoriedade_ecd: payload.obrigatoriedade_ecd,
        competencia_inicio: compNorm,
        perfil: payload.perfil,
        created_by: session!.user.id,
      };

      if (payload.id) {
        const { error } = await supabase
          .from("clients")
          .update(record)
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert(record);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success(editingId ? "Cliente atualizado!" : "Cliente cadastrado!");
    },
    onError: (err: any) => {
      if (err.message?.includes("duplicate")) {
        toast.error("CNPJ já cadastrado.");
      } else {
        toast.error(err.message || "Erro ao salvar cliente.");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente removido.");
    },
    onError: () => toast.error("Erro ao remover cliente."),
  });

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (client: any) => {
    setEditingId(client.id);
    setForm({
      cnpj: formatCnpj(client.cnpj),
      razao_social: client.razao_social,
      tributacao: client.tributacao,
      unidade: client.unidade || "2m_contabilidade",
      obrigatoriedade_ecd: client.obrigatoriedade_ecd || false,
      competencia_inicio: client.competencia_inicio,
      perfil: client.perfil || "standard",
    });
    setDialogOpen(true);
  };

  const TRIBUTACAO_MAP: Record<string, string> = {
    "simples nacional": "simples_nacional",
    "lucro presumido": "lucro_presumido",
    "lucro real": "lucro_real",
  };

  const UNIDADE_MAP: Record<string, string> = {
    "2m contabilidade": "2m_contabilidade",
    "2m saude": "2m_saude",
    "2m saúde": "2m_saude",
  };

  const PERFIL_MAP: Record<string, string> = {
    vip: "vip",
    premium: "premium",
    standard: "standard",
    "básico": "basico",
    basico: "basico",
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        "CNPJ": "00.000.000/0000-00",
        "Razão Social": "Empresa Exemplo LTDA",
        "Tributação": "Simples Nacional",
        "Unidade": "2M Contabilidade",
        "Perfil": "Standard",
        "Obrigatoriedade ECD": "Não",
        "Competência Início": "01/2025",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    ws["!cols"] = [
      { wch: 22 }, { wch: 35 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 20 }, { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, "modelo_importacao_clientes.xlsx");
    toast.success("Modelo baixado com sucesso!");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { raw: true });

      if (rows.length === 0) {
        toast.error("A planilha está vazia.");
        return;
      }

      const records = rows.map((row, idx) => {
        const cnpj = String(row["CNPJ"] || "").replace(/\D/g, "");
        if (cnpj.length !== 14) throw new Error(`Linha ${idx + 2}: CNPJ inválido "${row["CNPJ"]}"`);

        const razao = String(row["Razão Social"] || "").trim();
        if (!razao) throw new Error(`Linha ${idx + 2}: Razão Social vazia`);

        const compRaw = row["Competência Início"];
        if (compRaw === undefined || compRaw === null || compRaw === "") {
          throw new Error(`Linha ${idx + 2}: Competência Início vazia`);
        }
        const comp = normalizeCompetencia(compRaw);
        if (!comp) {
          throw new Error(`Linha ${idx + 2}: Competência Início inválida ("${compRaw}"). Use MM/AAAA, AAAA-MM ou AAAA-MM-DD.`);
        }

        const tribRaw = String(row["Tributação"] || "").toLowerCase().trim();
        const tributacao = TRIBUTACAO_MAP[tribRaw] || "simples_nacional";

        const uniRaw = String(row["Unidade"] || "").toLowerCase().trim();
        const unidade = UNIDADE_MAP[uniRaw] || "2m_contabilidade";

        const perfilRaw = String(row["Perfil"] || "").toLowerCase().trim();
        const perfil = PERFIL_MAP[perfilRaw] || "standard";

        const ecdRaw = String(row["Obrigatoriedade ECD"] || "").toLowerCase().trim();
        const ecd = ecdRaw === "sim" || ecdRaw === "s" || ecdRaw === "true" || ecdRaw === "1";

        return {
          cnpj,
          razao_social: razao,
          tributacao,
          unidade,
          perfil,
          obrigatoriedade_ecd: ecd,
          competencia_inicio: comp,
          created_by: session.user.id,
        };
      });

      const { error } = await supabase.from("clients").insert(records);
      if (error) {
        if (error.message?.includes("duplicate")) {
          toast.error("Alguns CNPJs já estão cadastrados.");
        } else {
          toast.error("Erro ao importar: " + error.message);
        }
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(`${records.length} cliente(s) importado(s) com sucesso!`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar planilha.");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const filtered = clients.filter((c) => {
    const searchTrim = search.trim();
    const searchDigits = searchTrim.replace(/\D/g, "");
    const matchesSearch =
      !searchTrim ||
      (c.razao_social || "").toLowerCase().includes(searchTrim.toLowerCase()) ||
      (searchDigits.length > 0 && (c.cnpj || "").includes(searchDigits));
    const matchesTrib = filterTributacao === "all" || c.tributacao === filterTributacao;
    const matchesUni = filterUnidade === "all" || c.unidade === filterUnidade;
    const matchesPerfil = filterPerfil === "all" || c.perfil === filterPerfil;
    return matchesSearch && matchesTrib && matchesUni && matchesPerfil;
  });

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cadastro de Clientes</h1>
            <p className="text-sm text-muted-foreground">Gerencie a carteira de clientes do escritório</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={downloadTemplate} className="gap-2" size="sm">
              <Download className="w-4 h-4" /> Modelo
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2" size="sm">
              <Upload className="w-4 h-4" /> Importar
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImport}
            />
            <Button onClick={openNew} className="gap-2" size="sm">
              <Plus className="w-4 h-4" /> Novo Cliente
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Clientes ({filtered.length})
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={filterTributacao} onValueChange={setFilterTributacao}>
                  <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="Tributação" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas tributações</SelectItem>
                    {TRIBUTACAO_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterUnidade} onValueChange={setFilterUnidade}>
                  <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="Unidade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas unidades</SelectItem>
                    {UNIDADE_OPTIONS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterPerfil} onValueChange={setFilterPerfil}>
                  <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Perfil" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos perfis</SelectItem>
                    {PERFIL_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou CNPJ..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhum cliente encontrado.</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                     <TableRow>
                      <TableHead>Razão Social</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Perfil</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead>Tributação</TableHead>
                      <TableHead>Responsabilidade desde</TableHead>
                      <TableHead className="w-24 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => (
                      <TableRow key={c.id} onClick={() => openEdit(c)} className="cursor-pointer">
                        <TableCell className="font-medium">{c.razao_social}</TableCell>
                        <TableCell className="font-mono text-sm">{formatCnpj(c.cnpj)}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${PERFIL_COLORS[c.perfil] || PERFIL_COLORS.standard}`}>
                            {PERFIL_LABELS[c.perfil] || c.perfil}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            c.unidade === "2m_saude" ? "bg-emerald-500/15 text-emerald-600" : "bg-blue-500/15 text-blue-600"
                          }`}>
                            {UNIDADE_LABELS[c.unidade] || c.unidade}
                          </span>
                        </TableCell>
                        <TableCell>
                          {TRIBUTACAO_LABELS[c.tributacao] || c.tributacao}
                          {c.obrigatoriedade_ecd && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-600">ECD</span>
                          )}
                        </TableCell>
                        <TableCell>{c.competencia_inicio}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Remover este cliente?")) deleteMutation.mutate(c.id);
                              }}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
            <DialogDescription>Preencha os dados do cliente</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              upsertMutation.mutate({ ...form, id: editingId ?? undefined });
            }}
          >
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input
                placeholder="00.000.000/0000-00"
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: formatCnpj(e.target.value) })}
                maxLength={18}
              />
            </div>
            <div className="space-y-2">
              <Label>Razão Social</Label>
              <Input
                placeholder="Nome da empresa"
                value={form.razao_social}
                onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Tributação</Label>
              <Select value={form.tributacao} onValueChange={(v) => setForm({ ...form, tributacao: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIBUTACAO_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(form.tributacao === "lucro_presumido" || form.tributacao === "lucro_real") && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ecd"
                  checked={form.obrigatoriedade_ecd}
                  onChange={(e) => setForm({ ...form, obrigatoriedade_ecd: e.target.checked })}
                  className="rounded border-border"
                />
                <Label htmlFor="ecd" className="cursor-pointer">Obrigatoriedade ECD</Label>
              </div>
            )}
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select value={form.unidade} onValueChange={(v) => setForm({ ...form, unidade: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIDADE_OPTIONS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Perfil do Cliente</Label>
              <Select value={form.perfil} onValueChange={(v) => setForm({ ...form, perfil: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERFIL_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responsabilidade a partir de</Label>
              <Input
                placeholder="MM/AAAA"
                value={form.competencia_inicio}
                onChange={(e) => {
                  let v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2);
                  setForm({ ...form, competencia_inicio: v });
                }}
                maxLength={7}
              />
            </div>
            {editingId && (
              <div className="pt-2 border-t">
                <ClientContactsManager clientId={editingId} />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

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
import { toast } from "sonner";
import * as XLSX from "xlsx";

const TRIBUTACAO_OPTIONS = [
  { value: "simples_nacional", label: "Simples Nacional" },
  { value: "lucro_presumido", label: "Lucro Presumido" },
  { value: "lucro_real", label: "Lucro Real" },
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

export default function Clients() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [search, setSearch] = useState("");

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

      const record = {
        cnpj: cnpjDigits,
        razao_social: payload.razao_social.trim(),
        tributacao: payload.tributacao,
        unidade: payload.unidade,
        obrigatoriedade_ecd: payload.obrigatoriedade_ecd,
        competencia_inicio: payload.competencia_inicio,
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

  const filtered = clients.filter(
    (c) =>
      c.razao_social.toLowerCase().includes(search.toLowerCase()) ||
      c.cnpj.includes(search.replace(/\D/g, ""))
  );

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cadastro de Clientes</h1>
            <p className="text-sm text-muted-foreground">Gerencie a carteira de clientes do escritório</p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Cliente
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Clientes ({filtered.length})
              </CardTitle>
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
                      <TableRow key={c.id}>
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
                        <TableCell className="text-right">
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

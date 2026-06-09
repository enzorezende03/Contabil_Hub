import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { canPerformAction } from "@/hooks/use-action-permissions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Plus, Trash2, ArrowLeft, Target } from "lucide-react";
import { toast } from "sonner";

type Meta = {
  id: string;
  indicador: string;
  unidade: string | null;
  valor_meta: number;
  tipo_meta: "maximo" | "minimo";
  vigencia_inicio: string;
  vigencia_fim: string | null;
};

const INDICADORES = [
  { value: "lancamentos_pendentes", label: "Lançamentos pendentes" },
  { value: "conciliacao_bancaria_pendente", label: "Conciliação bancária pendente" },
  { value: "conciliacao_contabil_pendente", label: "Conciliação contábil pendente" },
  { value: "fechamento_mensal_pendente", label: "Fechamento mensal pendente" },
  { value: "fechamento_anual_pendente", label: "Fechamento anual pendente" },
  { value: "revisao_pendente", label: "Revisões aguardando" },
  { value: "velocity_lancamentos", label: "Velocity — Lançamentos" },
  { value: "velocity_conciliacao_bancaria", label: "Velocity — Conc. bancária" },
  { value: "velocity_conciliacao_contabil", label: "Velocity — Conc. contábil" },
  { value: "velocity_fechamento", label: "Velocity — Fechamento" },
];

const UNIDADES = [
  { value: "all", label: "Todas as unidades" },
  { value: "2m_contabilidade", label: "2M Contabilidade" },
  { value: "2m_saude", label: "2M Saúde" },
];

const indLabel = (k: string) => INDICADORES.find((i) => i.value === k)?.label ?? k;
const uniLabel = (k: string | null) =>
  k ? UNIDADES.find((u) => u.value === k)?.label ?? k : "Todas";

export default function MetasPage() {
  const { user, profile } = useAuth();
  const canEdit = canPerformAction("configurar_metas" as any, profile?.role);

  const [metas, setMetas] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [indicador, setIndicador] = useState<string>(INDICADORES[0].value);
  const [unidade, setUnidade] = useState<string>("all");
  const [valor, setValor] = useState<string>("");
  const [tipo, setTipo] = useState<"maximo" | "minimo">("maximo");
  const [vigIni, setVigIni] = useState<string>(new Date().toISOString().slice(0, 10));
  const [vigFim, setVigFim] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("gestao_metas" as any)
      .select("*")
      .order("indicador", { ascending: true })
      .order("vigencia_inicio", { ascending: false });
    if (error) toast.error("Erro ao carregar metas: " + error.message);
    setMetas(((data || []) as unknown) as Meta[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    if (!valor || isNaN(Number(valor))) {
      toast.error("Informe um valor numérico para a meta");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("gestao_metas" as any).insert({
      indicador,
      unidade: unidade === "all" ? null : unidade,
      valor_meta: Number(valor),
      tipo_meta: tipo,
      vigencia_inicio: vigIni,
      vigencia_fim: vigFim || null,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar meta: " + error.message);
      return;
    }
    toast.success("Meta cadastrada");
    setValor("");
    setVigFim("");
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover esta meta?")) return;
    const { error } = await supabase.from("gestao_metas" as any).delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover: " + error.message);
      return;
    }
    toast.success("Meta removida");
    load();
  };

  const ativas = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return metas.filter(
      (m) => m.vigencia_inicio <= today && (!m.vigencia_fim || m.vigencia_fim >= today)
    );
  }, [metas]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button asChild size="sm" variant="ghost">
              <Link to="/configuracoes">
                <ArrowLeft className="w-4 h-4 mr-1" /> Configurações
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" /> Metas gerenciais
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Defina metas por indicador para destacar desvios no Controle Gerencial.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {ativas.length} ativa{ativas.length === 1 ? "" : "s"}
          </Badge>
        </header>

        {canEdit && (
          <Card className="p-4">
            <h2 className="font-semibold text-sm mb-3">Nova meta</h2>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-xs">Indicador</Label>
                <Select value={indicador} onValueChange={setIndicador}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INDICADORES.map((i) => (
                      <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Unidade</Label>
                <Select value={unidade} onValueChange={setUnidade}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map((u) => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Tipo</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maximo">Máximo (ideal ≤ meta)</SelectItem>
                    <SelectItem value="minimo">Mínimo (ideal ≥ meta)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Valor</Label>
                <Input type="number" min={0} value={valor} onChange={(e) => setValor(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Vigência início</Label>
                <Input type="date" value={vigIni} onChange={(e) => setVigIni(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Vigência fim (opcional)</Label>
                <Input type="date" value={vigFim} onChange={(e) => setVigFim(e.target.value)} />
              </div>

              <div className="md:col-span-6 flex justify-end">
                <Button onClick={handleAdd} disabled={saving} size="sm">
                  <Plus className="w-4 h-4 mr-1" /> Cadastrar meta
                </Button>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-sm">Metas cadastradas</h2>
          </div>
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
          ) : metas.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Nenhuma meta cadastrada ainda.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Indicador</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {metas.map((m) => {
                  const ativa = ativas.some((a) => a.id === m.id);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{indLabel(m.indicador)}</TableCell>
                      <TableCell>{uniLabel(m.unidade)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {m.tipo_meta === "maximo" ? "Máximo" : "Mínimo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{m.valor_meta}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.vigencia_inicio}
                        {m.vigencia_fim ? ` → ${m.vigencia_fim}` : " → (sem fim)"}
                      </TableCell>
                      <TableCell>
                        {ativa ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Ativa</Badge>
                        ) : (
                          <Badge variant="secondary">Inativa</Badge>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => handleDelete(m.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        {!canEdit && (
          <p className="text-xs text-muted-foreground">
            Você tem acesso apenas para visualizar metas. Para editar, peça à administração a permissão
            <span className="font-mono mx-1">configurar_metas</span>.
          </p>
        )}
      </div>
    </AppLayout>
  );
}

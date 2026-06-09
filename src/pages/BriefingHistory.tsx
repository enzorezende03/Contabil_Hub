import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { ArrowLeft, Plus, Trash2, Save, Mail } from "lucide-react";
import { toast } from "sonner";

type Draft = {
  id: string;
  iso_week: string;
  data_referencia: string;
  status: "em_revisao" | "aprovado" | "enviado" | "arquivado";
  generated_at: string;
  reviewed_at: string | null;
  approved_at: string | null;
  sent_at: string | null;
  recipients_snapshot: string[] | null;
};

const STATUS_LABEL: Record<Draft["status"], string> = {
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  enviado: "Enviado",
  arquivado: "Arquivado",
};

const STATUS_CLASSES: Record<Draft["status"], string> = {
  em_revisao: "border-amber-300 bg-amber-50 text-amber-800",
  aprovado: "border-blue-300 bg-blue-50 text-blue-800",
  enviado: "border-emerald-300 bg-emerald-50 text-emerald-800",
  arquivado: "border-muted text-muted-foreground",
};

export default function BriefingHistory() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ["briefing-drafts-history"],
    queryFn: async (): Promise<Draft[]> => {
      const { data, error } = await supabase
        .from("briefing_drafts" as any)
        .select("id, iso_week, data_referencia, status, generated_at, reviewed_at, approved_at, sent_at, recipients_snapshot")
        .order("data_referencia", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const filtered = useMemo(
    () => statusFilter === "all" ? drafts : drafts.filter((d) => d.status === statusFilter),
    [drafts, statusFilter],
  );

  // Metric: approved before Wednesday / total
  const approvalMetric = useMemo(() => {
    const finalized = drafts.filter((d) => d.status === "enviado" || d.status === "aprovado");
    if (finalized.length === 0) return null;
    const onTime = finalized.filter((d) => {
      const t = d.approved_at || d.sent_at;
      if (!t) return false;
      const ref = new Date(d.data_referencia + "T00:00:00");
      const wed = new Date(ref);
      wed.setDate(ref.getDate() + 2);
      wed.setHours(23, 59, 59, 999);
      return new Date(t) <= wed;
    });
    return Math.round((onTime.length / finalized.length) * 100);
  }, [drafts]);

  return (
    <AppLayout>
      <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Link to="/controle-gerencial" className="text-sm text-muted-foreground hover:underline flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </Link>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Histórico de briefings</h1>
              <p className="text-xs text-muted-foreground">Últimos 50 briefings semanais</p>
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="em_revisao">Em revisão</SelectItem>
              <SelectItem value="aprovado">Aprovado</SelectItem>
              <SelectItem value="enviado">Enviado</SelectItem>
              <SelectItem value="arquivado">Arquivado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Total no histórico</div>
            <div className="text-2xl font-medium">{drafts.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Aprovação no prazo (até quarta)</div>
            <div className="text-2xl font-medium">{approvalMetric === null ? "—" : `${approvalMetric}%`}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Pendentes de revisão</div>
            <div className="text-2xl font-medium text-amber-700">
              {drafts.filter((d) => d.status === "em_revisao").length}
            </div>
          </Card>
        </div>

        <RecipientsManager />

        {/* Table */}
        <Card className="p-4">
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : filtered.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
              Nenhum briefing encontrado.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Semana</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Gerado</TableHead>
                  <TableHead>Aprovado</TableHead>
                  <TableHead>Enviado</TableHead>
                  <TableHead>Destinatários</TableHead>
                  <TableHead className="text-right">Abrir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      {d.iso_week}
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(d.data_referencia + "T00:00:00").toLocaleDateString("pt-BR")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_CLASSES[d.status]}>
                        {STATUS_LABEL[d.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(d.generated_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.approved_at ? new Date(d.approved_at).toLocaleString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.sent_at ? new Date(d.sent_at).toLocaleString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.recipients_snapshot?.length ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`/controle-gerencial/briefing/${d.iso_week}`}>Abrir</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}

function RecipientsManager() {
  const queryClient = useQueryClient();
  const [list, setList] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [loaded, setLoaded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["painel-gerencial-recipients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "painel_gerencial_recipients")
        .maybeSingle();
      if (error) throw error;
      return (Array.isArray(data?.value) ? data!.value : []) as string[];
    },
  });

  useEffect(() => {
    if (data && !loaded) {
      setList(data);
      setLoaded(true);
    }
  }, [data, loaded]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("settings")
        .upsert({ key: "painel_gerencial_recipients", value: list as any }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Destinatários salvos");
      queryClient.invalidateQueries({ queryKey: ["painel-gerencial-recipients"] });
    },
    onError: (e: any) => toast.error("Erro: " + (e?.message || "")),
  });

  function add() {
    const email = newEmail.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("E-mail inválido");
      return;
    }
    if (list.includes(email)) {
      toast.error("E-mail já adicionado");
      return;
    }
    setList([...list, email]);
    setNewEmail("");
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <Mail className="w-4 h-4" /> Destinatários do briefing semanal
          </h2>
          <p className="text-xs text-muted-foreground">
            Liderança que receberá o briefing por e-mail quando aprovado.
          </p>
        </div>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="w-4 h-4" /> Salvar lista
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="email@dominio.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="h-9"
        />
        <Button size="sm" variant="outline" onClick={add}>
          <Plus className="w-4 h-4" /> Adicionar
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-16" />
      ) : list.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">
          Nenhum destinatário cadastrado. Adicione pelo menos um antes de enviar o briefing.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {list.map((email) => (
            <Badge key={email} variant="outline" className="text-xs gap-1 pr-1">
              {email}
              <button
                type="button"
                onClick={() => setList(list.filter((e) => e !== email))}
                className="ml-1 hover:bg-red-100 rounded-sm p-0.5 text-red-600"
                aria-label={`Remover ${email}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}

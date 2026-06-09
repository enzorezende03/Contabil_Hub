import { useMemo, useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, RefreshCw, Save, CheckCircle2, Download, Plus, Trash2, ArrowUp, ArrowDown, Archive } from "lucide-react";
import { toast } from "sonner";

type Severity = "info" | "atencao" | "critico";
type AlertItem = { severity: Severity; title: string; detail: string };
type FocusItem = { title: string; owner?: string };

type Draft = {
  id: string;
  iso_week: string;
  data_referencia: string;
  status: "em_revisao" | "aprovado" | "enviado" | "arquivado";
  generated_at: string;
  pptx_storage_path: string | null;
  auto_summary: string | null;
  auto_alerts: AlertItem[];
  custom_summary: string | null;
  custom_alerts: AlertItem[];
  custom_focus: FocusItem[];
  notes_internas: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
};

const SEVERITY_LABEL: Record<Severity, string> = {
  info: "Info",
  atencao: "Atenção",
  critico: "Crítico",
};

const STATUS_LABEL: Record<Draft["status"], string> = {
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  enviado: "Enviado",
  arquivado: "Arquivado",
};

export default function BriefingReview() {
  const { isoWeek = "" } = useParams<{ isoWeek: string }>();
  const queryClient = useQueryClient();

  const { data: draft, isLoading } = useQuery({
    queryKey: ["briefing-draft", isoWeek],
    queryFn: async (): Promise<Draft | null> => {
      const { data, error } = await supabase
        .from("briefing_drafts" as any)
        .select("*")
        .eq("iso_week", isoWeek)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
  });

  const [summary, setSummary] = useState("");
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [focus, setFocus] = useState<FocusItem[]>([]);
  const [notes, setNotes] = useState("");
  const [pptxUrl, setPptxUrl] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | "approve" | "archive">(null);

  useEffect(() => {
    if (!draft) return;
    setSummary(draft.custom_summary ?? draft.auto_summary ?? "");
    setAlerts(Array.isArray(draft.custom_alerts) && draft.custom_alerts.length ? draft.custom_alerts : draft.auto_alerts ?? []);
    setFocus(Array.isArray(draft.custom_focus) ? draft.custom_focus : []);
    setNotes(draft.notes_internas ?? "");
  }, [draft?.id]);

  useEffect(() => {
    let mounted = true;
    async function loadUrl() {
      if (!draft?.pptx_storage_path) return;
      const { data } = await supabase.storage
        .from("briefing-pptx")
        .createSignedUrl(draft.pptx_storage_path, 3600);
      if (mounted) setPptxUrl(data?.signedUrl ?? null);
    }
    loadUrl();
    return () => { mounted = false; };
  }, [draft?.pptx_storage_path]);

  const readOnly = useMemo(() => draft && draft.status !== "em_revisao", [draft]);

  const regenMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-weekly-briefing", {
        body: { force: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("PPTX regenerado");
      queryClient.invalidateQueries({ queryKey: ["briefing-draft", isoWeek] });
    },
    onError: (e: any) => toast.error("Falha ao regenerar: " + (e?.message || "erro")),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const { error } = await supabase
        .from("briefing_drafts" as any)
        .update({
          custom_summary: summary,
          custom_alerts: alerts as any,
          custom_focus: focus as any,
          notes_internas: notes,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", draft.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rascunho salvo");
      queryClient.invalidateQueries({ queryKey: ["briefing-draft", isoWeek] });
    },
    onError: (e: any) => toast.error("Erro ao salvar: " + (e?.message || "")),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("briefing_drafts" as any)
        .update({
          custom_summary: summary,
          custom_alerts: alerts as any,
          custom_focus: focus as any,
          notes_internas: notes,
          status: "aprovado",
          approved_at: new Date().toISOString(),
          approved_by: u.user?.id ?? null,
        })
        .eq("id", draft.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Briefing aprovado (sem envio)");
      queryClient.invalidateQueries({ queryKey: ["briefing-draft", isoWeek] });
    },
    onError: (e: any) => toast.error("Erro ao aprovar: " + (e?.message || "")),
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const { error } = await supabase
        .from("briefing_drafts" as any)
        .update({ status: "arquivado" })
        .eq("id", draft.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Briefing arquivado");
      queryClient.invalidateQueries({ queryKey: ["briefing-draft", isoWeek] });
    },
    onError: (e: any) => toast.error("Erro ao arquivar: " + (e?.message || "")),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      // Save current edits first
      await supabase
        .from("briefing_drafts" as any)
        .update({
          custom_summary: summary,
          custom_alerts: alerts as any,
          custom_focus: focus as any,
          notes_internas: notes,
        })
        .eq("id", draft.id);

      const { data, error } = await supabase.functions.invoke("send-briefing-email", {
        body: { iso_week: isoWeek },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Briefing enviado para ${data?.sent ?? "?"} destinatário(s)`);
      queryClient.invalidateQueries({ queryKey: ["briefing-draft", isoWeek] });
    },
    onError: (e: any) => toast.error("Falha no envio: " + (e?.message || "erro")),
  });

  return (
    <AppLayout>
      <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Link to="/controle-gerencial" className="text-sm text-muted-foreground hover:underline flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </Link>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Briefing semanal • {isoWeek}</h1>
              {draft && (
                <p className="text-xs text-muted-foreground">
                  Semana de {new Date(draft.data_referencia + "T00:00:00").toLocaleDateString("pt-BR")} • gerado em{" "}
                  {new Date(draft.generated_at).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
          </div>
          {draft && (
            <Badge
              variant="outline"
              className={
                draft.status === "em_revisao" ? "border-amber-300 bg-amber-50 text-amber-800"
                : draft.status === "aprovado" ? "border-blue-300 bg-blue-50 text-blue-800"
                : draft.status === "enviado" ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-muted text-muted-foreground"
              }
            >
              {STATUS_LABEL[draft.status]}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <Skeleton className="h-96" />
        ) : !draft ? (
          <Card className="p-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">Nenhum briefing gerado para {isoWeek}.</p>
            <Button onClick={() => regenMutation.mutate()} disabled={regenMutation.isPending}>
              <RefreshCw className={`w-4 h-4 ${regenMutation.isPending ? "animate-spin" : ""}`} />
              Gerar agora
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Editor */}
            <div className="lg:col-span-2 space-y-4">
              <Card className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Resumo executivo</h2>
                  {draft.auto_summary && (
                    <Button size="sm" variant="ghost" disabled={!!readOnly} onClick={() => setSummary(draft.auto_summary!)}>
                      Restaurar automático
                    </Button>
                  )}
                </div>
                <Textarea
                  rows={10}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  disabled={!!readOnly}
                />
              </Card>

              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Alertas ({alerts.length})</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!readOnly}
                    onClick={() => setAlerts([...alerts, { severity: "atencao", title: "", detail: "" }])}
                  >
                    <Plus className="w-3 h-3" /> Adicionar
                  </Button>
                </div>
                <div className="space-y-2">
                  {alerts.map((a, i) => (
                    <div key={i} className="border rounded-md p-2 space-y-2 bg-muted/20">
                      <div className="flex items-center gap-2">
                        <Select
                          value={a.severity}
                          disabled={!!readOnly}
                          onValueChange={(v) => updateAlert(i, { severity: v as Severity })}
                        >
                          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="info">Info</SelectItem>
                            <SelectItem value="atencao">Atenção</SelectItem>
                            <SelectItem value="critico">Crítico</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Título"
                          value={a.title}
                          disabled={!!readOnly}
                          onChange={(e) => updateAlert(i, { title: e.target.value })}
                          className="h-8 text-sm flex-1"
                        />
                        <Button size="icon" variant="ghost" disabled={!!readOnly || i === 0} onClick={() => moveAlert(i, -1)} className="h-7 w-7">
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" disabled={!!readOnly || i === alerts.length - 1} onClick={() => moveAlert(i, 1)} className="h-7 w-7">
                          <ArrowDown className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" disabled={!!readOnly} onClick={() => setAlerts(alerts.filter((_, x) => x !== i))} className="h-7 w-7 text-red-600">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <Textarea
                        placeholder="Detalhe"
                        rows={2}
                        value={a.detail}
                        disabled={!!readOnly}
                        onChange={(e) => updateAlert(i, { detail: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                  ))}
                  {alerts.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">Sem alertas. Adicione um acima.</p>
                  )}
                </div>
              </Card>

              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Prioridades da próxima semana</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!readOnly}
                    onClick={() => setFocus([...focus, { title: "", owner: "" }])}
                  >
                    <Plus className="w-3 h-3" /> Adicionar
                  </Button>
                </div>
                <div className="space-y-2">
                  {focus.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        placeholder="O que precisa acontecer"
                        value={f.title}
                        disabled={!!readOnly}
                        onChange={(e) => setFocus(focus.map((x, k) => k === i ? { ...x, title: e.target.value } : x))}
                        className="h-8 text-sm flex-1"
                      />
                      <Input
                        placeholder="Responsável"
                        value={f.owner || ""}
                        disabled={!!readOnly}
                        onChange={(e) => setFocus(focus.map((x, k) => k === i ? { ...x, owner: e.target.value } : x))}
                        className="h-8 text-sm w-48"
                      />
                      <Button size="icon" variant="ghost" disabled={!!readOnly} onClick={() => setFocus(focus.filter((_, k) => k !== i))} className="h-7 w-7 text-red-600">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  {focus.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">Defina os focos da próxima semana.</p>
                  )}
                </div>
              </Card>

              <Card className="p-4 space-y-2">
                <h2 className="font-semibold">Notas internas <span className="text-xs text-muted-foreground font-normal">(não vão pro PPTX)</span></h2>
                <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!!readOnly} />
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <Card className="p-4 space-y-3">
                <h2 className="font-semibold">PPTX</h2>
                {pptxUrl ? (
                  <Button asChild variant="outline" className="w-full" size="sm">
                    <a href={pptxUrl} target="_blank" rel="noreferrer">
                      <Download className="w-4 h-4" /> Baixar PPTX
                    </a>
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">PPTX ainda não disponível.</p>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  size="sm"
                  disabled={!!readOnly || regenMutation.isPending}
                  onClick={() => regenMutation.mutate()}
                >
                  <RefreshCw className={`w-4 h-4 ${regenMutation.isPending ? "animate-spin" : ""}`} />
                  Regenerar PPTX
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Regenerar usa os dados mais recentes do snapshot. As edições do resumo/alertas só serão refletidas na próxima versão do gerador.
                </p>
              </Card>

              <Card className="p-4 space-y-2">
                <h2 className="font-semibold">Ações</h2>
                {readOnly ? (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Briefing já está <strong>{STATUS_LABEL[draft.status]}</strong>.</p>
                    {draft.approved_at && <p>Aprovado em {new Date(draft.approved_at).toLocaleString("pt-BR")}.</p>}
                    {draft.sent_at && <p>Enviado em {new Date(draft.sent_at).toLocaleString("pt-BR")}.</p>}
                  </div>
                ) : (
                  <>
                    <Button className="w-full" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                      <Save className="w-4 h-4" /> Salvar rascunho
                    </Button>
                    <Button
                      className="w-full"
                      size="sm"
                      variant="secondary"
                      disabled
                      title="Disponível no PR 8"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Aprovar e enviar
                    </Button>
                    <Button
                      className="w-full"
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmAction("approve")}
                      disabled={approveMutation.isPending}
                    >
                      <CheckCircle2 className="w-4 h-4" /> Aprovar sem enviar
                    </Button>
                    <Button
                      className="w-full"
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmAction("archive")}
                      disabled={archiveMutation.isPending}
                    >
                      <Archive className="w-4 h-4" /> Arquivar
                    </Button>
                  </>
                )}
              </Card>

              <Card className="p-3">
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Severidades:{" "}
                  <span className="text-blue-700">Info</span> ·{" "}
                  <span className="text-amber-700">Atenção</span> ·{" "}
                  <span className="text-red-700">Crítico</span>
                </p>
              </Card>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "approve" ? "Aprovar briefing sem envio?" : "Arquivar briefing?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "approve"
                ? "O briefing ficará marcado como aprovado e sairá da fila de revisão. Ele não será enviado por e-mail."
                : "O briefing será arquivado e não aparecerá mais nas pendências de revisão."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmAction === "approve") approveMutation.mutate();
                else if (confirmAction === "archive") archiveMutation.mutate();
                setConfirmAction(null);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );

  function updateAlert(i: number, patch: Partial<AlertItem>) {
    setAlerts(alerts.map((a, k) => (k === i ? { ...a, ...patch } : a)));
  }
  function moveAlert(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= alerts.length) return;
    const copy = [...alerts];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setAlerts(copy);
  }
}

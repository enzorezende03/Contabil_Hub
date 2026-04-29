import { useState, useMemo, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  REVIEW_STATUS_LABEL,
  REVIEW_STATUS_BADGE,
  TIPO_DEMONSTRATIVO_LABEL,
  competenciaLabel,
  timeAgo,
  type ReviewStatus,
  type TipoDemonstrativo,
} from "@/lib/review-utils";
import { useActionPermissions, canPerformAction } from "@/hooks/use-action-permissions";
import { usePersistedFilter } from "@/hooks/use-persisted-filter";
import { Switch } from "@/components/ui/switch";
import { ReviewerPicker } from "@/components/ReviewerPicker";
import {
  FileText, ExternalLink, CheckCircle2, MessageSquarePlus, X, ArrowLeft,
  Send, Inbox, Reply, ShieldCheck, History, UserCog, Eye,
} from "lucide-react";
import { ReenviarRevisaoDialog } from "@/components/ReenviarRevisaoDialog";

const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

type Submission = {
  id: string;
  client_id: string;
  competencia: string;
  cycle_number: number;
  status: ReviewStatus;
  submitted_by: string;
  submitted_at: string;
  reviewer_id: string | null;
  review_started_at: string | null;
  reviewed_at: string | null;
  review_summary: string | null;
};

type Deliverable = {
  id: string;
  client_id: string;
  competencia: string;
  tipo_demonstrativo: TipoDemonstrativo;
  titulo: string | null;
  arquivo_path: string;
  file_size_bytes: number | null;
  versao: number;
  origem: string;
  review_submission_id: string | null;
  approved: boolean;
};

type Apontamento = {
  id: string;
  submission_id: string;
  deliverable_id: string;
  conta_referencia: string | null;
  descricao: string;
  resolved: boolean;
  created_by: string;
  created_at: string;
};

type Client = {
  id: string;
  razao_social: string;
  tributacao: string;
  unidade: string;
};

type Profile = {
  user_id: string;
  display_name: string;
  role: string;
};

export default function RevisaoPage() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const userRole = profile?.role;

  useActionPermissions(); // hydrates the cache
  const canReview = canPerformAction("revisar_demonstrativos", userRole);

  const defaultTab = canReview ? "caixa" : "devolucoes";
  const [tab, setTab] = usePersistedFilter<"caixa" | "devolucoes">("revisao", "tab", defaultTab as any);
  const [search, setSearch] = usePersistedFilter("revisao", "search", "");
  const [statusFilter, setStatusFilter] = usePersistedFilter<"all" | ReviewStatus>("revisao", "status", "all");
  const [unidadeFilter, setUnidadeFilter] = usePersistedFilter("revisao", "unidade", "all");
  const [openSubmissionId, setOpenSubmissionId] = useState<string | null>(null);

  // ---- Data ----
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, razao_social, tributacao, unidade");
      if (error) throw error;
      return data as Client[];
    },
  });

  const clientById = useMemo(() => {
    const map: Record<string, Client> = {};
    clients.forEach((c) => { map[c.id] = c; });
    return map;
  }, [clients]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, display_name, role");
      if (error) throw error;
      return data as Profile[];
    },
  });

  const profileById = useMemo(() => {
    const map: Record<string, Profile> = {};
    profiles.forEach((p) => { map[p.user_id] = p; });
    return map;
  }, [profiles]);

  const { data: submissions = [] } = useQuery({
    queryKey: ["review-submissions"],
    queryFn: async () => {
      const all: Submission[] = [];
      const pageSize = 1000;
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("review_submissions")
          .select("*")
          .order("submitted_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error || !data) break;
        all.push(...(data as Submission[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
  });

  // Realtime: refetch on any change
  useEffect(() => {
    const ch = supabase
      .channel("review-submissions-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "review_submissions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["review-submissions"] });
        queryClient.invalidateQueries({ queryKey: ["review-badge"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "review_apontamentos" }, () => {
        queryClient.invalidateQueries({ queryKey: ["review-apontamentos"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const filtered = useMemo(() => {
    let list = submissions;
    if (tab === "caixa") {
      list = list.filter((s) => s.status === "aguardando" || s.status === "em_revisao");
    } else {
      list = list.filter((s) => s.status === "devolvido" && s.submitted_by === user?.id);
    }
    if (statusFilter !== "all") list = list.filter((s) => s.status === statusFilter);
    if (unidadeFilter !== "all") {
      list = list.filter((s) => clientById[s.client_id]?.unidade === unidadeFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => {
        const c = clientById[s.client_id];
        return c?.razao_social.toLowerCase().includes(q);
      });
    }
    return list;
  }, [submissions, tab, statusFilter, unidadeFilter, search, user, clientById]);

  // ---- UI ----
  if (openSubmissionId) {
    return (
      <SubmissionDetail
        submissionId={openSubmissionId}
        onClose={() => setOpenSubmissionId(null)}
        clientById={clientById}
        profileById={profileById}
      />
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Revisão de Demonstrativos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Caixa de submissões aguardando revisão técnica e devoluções para o time operacional.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="caixa" className="flex items-center gap-1.5">
              <Inbox className="w-3.5 h-3.5" /> Caixa de revisão
            </TabsTrigger>
            <TabsTrigger value="devolucoes" className="flex items-center gap-1.5">
              <Reply className="w-3.5 h-3.5" /> Minhas devoluções
            </TabsTrigger>
          </TabsList>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Input
              placeholder="Buscar empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs w-[220px]"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-8 px-2 text-xs border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Todos status</option>
              {tab === "caixa" ? (
                <>
                  <option value="aguardando">Aguardando</option>
                  <option value="em_revisao">Em revisão</option>
                </>
              ) : (
                <option value="devolvido">Devolvido</option>
              )}
            </select>
            <select
              value={unidadeFilter}
              onChange={(e) => setUnidadeFilter(e.target.value)}
              className="h-8 px-2 text-xs border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Todas unidades</option>
              <option value="2m_contabilidade">2M Contabilidade</option>
              <option value="2m_saude">2M Saúde</option>
            </select>
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} item(ns)</span>
          </div>

          <TabsContent value="caixa" className="mt-4">
            <SubmissionGrid
              submissions={filtered}
              clientById={clientById}
              profileById={profileById}
              variant="caixa"
              onOpen={setOpenSubmissionId}
            />
          </TabsContent>
          <TabsContent value="devolucoes" className="mt-4">
            <SubmissionGrid
              submissions={filtered}
              clientById={clientById}
              profileById={profileById}
              variant="devolucoes"
              onOpen={setOpenSubmissionId}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

// =========================================================================
// Submission cards grid
// =========================================================================
function SubmissionGrid({
  submissions,
  clientById,
  profileById,
  variant,
  onOpen,
}: {
  submissions: Submission[];
  clientById: Record<string, Client>;
  profileById: Record<string, Profile>;
  variant: "caixa" | "devolucoes";
  onOpen: (id: string) => void;
}) {
  // Fetch deliverables for these submissions to display pills
  const ids = submissions.map((s) => s.id);
  const { data: deliverables = [] } = useQuery({
    queryKey: ["deliverables-by-submissions", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closing_deliverables")
        .select("id, tipo_demonstrativo, review_submission_id, versao")
        .in("review_submission_id", ids);
      if (error) throw error;
      return data as Pick<Deliverable, "id" | "tipo_demonstrativo" | "review_submission_id" | "versao">[];
    },
  });

  const deliverablesBySub = useMemo(() => {
    const map: Record<string, typeof deliverables> = {};
    deliverables.forEach((d) => {
      if (!d.review_submission_id) return;
      (map[d.review_submission_id] = map[d.review_submission_id] || []).push(d);
    });
    return map;
  }, [deliverables]);

  if (submissions.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <ShieldCheck className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">
          {variant === "caixa"
            ? "Nada para revisar no momento."
            : "Você não tem devoluções pendentes."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {submissions.map((s) => {
        const client = clientById[s.client_id];
        const submitter = profileById[s.submitted_by];
        const dels = deliverablesBySub[s.id] || [];
        const ageHours = (Date.now() - new Date(s.submitted_at).getTime()) / 3_600_000;
        const stale = ageHours > 24 && s.status === "aguardando";

        return (
          <div
            key={s.id}
            className={`rounded-lg border bg-card p-4 hover:border-primary/40 transition-colors ${
              stale ? "border-warning/40" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{client?.razao_social || "—"}</div>
                <div className="text-[11px] text-muted-foreground">
                  {competenciaLabel(s.competencia)} ·{" "}
                  {client?.tributacao === "simples_nacional"
                    ? "Simples"
                    : client?.tributacao === "lucro_presumido"
                    ? "Presumido"
                    : "Real"}{" "}
                  ·{" "}
                  {client?.unidade === "2m_saude" ? "2M Saúde" : "2M Contabilidade"}
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${REVIEW_STATUS_BADGE[s.status]}`}
              >
                {REVIEW_STATUS_LABEL[s.status]}
              </span>
            </div>

            <div className="flex flex-wrap gap-1 mt-3">
              {dels.map((d) => (
                <span
                  key={d.id}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] bg-muted text-muted-foreground"
                >
                  {TIPO_DEMONSTRATIVO_LABEL[d.tipo_demonstrativo]}
                  {d.versao > 1 && <span className="text-[9px] opacity-60">v{d.versao}</span>}
                </span>
              ))}
              {dels.length === 0 && (
                <span className="text-[10px] text-muted-foreground italic">Sem demonstrativos</span>
              )}
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <span className="text-[10px] text-muted-foreground">
                {variant === "caixa" ? "Liberado por" : "Devolvido para você"}{" "}
                <strong className="text-foreground">{submitter?.display_name || "—"}</strong>{" "}
                · {s.cycle_number}ª submissão · há {timeAgo(s.submitted_at)}
              </span>
              <Button size="sm" onClick={() => onOpen(s.id)}>
                {variant === "caixa" ? "Revisar" : "Resolver"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =========================================================================
// Detail screen
// =========================================================================
function SubmissionDetail({
  submissionId,
  onClose,
  clientById,
  profileById,
}: {
  submissionId: string;
  onClose: () => void;
  clientById: Record<string, Client>;
  profileById: Record<string, Profile>;
}) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  useActionPermissions();
  const canReview = canPerformAction("revisar_demonstrativos", profile?.role);

  const { data: submission } = useQuery({
    queryKey: ["review-submission", submissionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_submissions")
        .select("*")
        .eq("id", submissionId)
        .single();
      if (error) throw error;
      return data as Submission;
    },
  });

  const { data: deliverables = [] } = useQuery({
    queryKey: ["deliverables", submissionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closing_deliverables")
        .select("*")
        .eq("review_submission_id", submissionId)
        .order("tipo_demonstrativo");
      if (error) throw error;
      return data as Deliverable[];
    },
  });

  const { data: apontamentos = [] } = useQuery({
    queryKey: ["review-apontamentos", submissionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_apontamentos")
        .select("*")
        .eq("submission_id", submissionId)
        .order("created_at");
      if (error) throw error;
      return data as Apontamento[];
    },
  });

  const apontamentosByDeliverable = useMemo(() => {
    const map: Record<string, Apontamento[]> = {};
    apontamentos.forEach((a) => {
      (map[a.deliverable_id] = map[a.deliverable_id] || []).push(a);
    });
    return map;
  }, [apontamentos]);

  const [aptDialog, setAptDialog] = useState<Deliverable | null>(null);
  const [reviewSummary, setReviewSummary] = useState("");
  const [reenviarOpen, setReenviarOpen] = useState(false);

  // Histórico: outras submissões da mesma client+competência (versões anteriores)
  const { data: submissionHistory = [] } = useQuery({
    queryKey: ["submission-history", submission?.client_id, submission?.competencia],
    enabled: !!submission,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_submissions")
        .select("*")
        .eq("client_id", submission!.client_id)
        .eq("competencia", submission!.competencia)
        .neq("id", submissionId)
        .order("cycle_number", { ascending: false });
      if (error) throw error;
      return data as Submission[];
    },
  });


  // Take ownership of the review on first interaction by the reviewer
  const ensureReviewerAssigned = async () => {
    if (!submission || !user) return;
    if (submission.status === "aguardando") {
      await supabase
        .from("review_submissions")
        .update({
          status: "em_revisao",
          reviewer_id: user.id,
          review_started_at: new Date().toISOString(),
        })
        .eq("id", submissionId);
      queryClient.invalidateQueries({ queryKey: ["review-submission", submissionId] });
      queryClient.invalidateQueries({ queryKey: ["review-submissions"] });
    } else if (submission.status === "em_revisao" && !submission.reviewer_id) {
      await supabase.from("review_submissions").update({ reviewer_id: user.id }).eq("id", submissionId);
      queryClient.invalidateQueries({ queryKey: ["review-submission", submissionId] });
    }
  };

  useEffect(() => {
    if (canReview && submission?.status === "aguardando") {
      ensureReviewerAssigned();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission?.status]);

  const openPdf = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("closing-deliverables")
      .createSignedUrl(path, 600);
    if (error || !data) {
      toast.error("Não foi possível abrir o arquivo.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const toggleApprove = async (d: Deliverable) => {
    const next = !d.approved;
    await supabase.from("closing_deliverables").update({ approved: next }).eq("id", d.id);
    queryClient.invalidateQueries({ queryKey: ["deliverables", submissionId] });
  };

  const addApontamento = async (descricao: string, conta: string) => {
    if (!aptDialog || !user || !submission) return;
    const { error } = await supabase.from("review_apontamentos").insert({
      submission_id: submissionId,
      deliverable_id: aptDialog.id,
      descricao,
      conta_referencia: conta || null,
      created_by: user.id,
    });
    if (error) { toast.error("Erro ao registrar apontamento"); return; }
    // Mark deliverable as not approved
    if (aptDialog.approved) {
      await supabase.from("closing_deliverables").update({ approved: false }).eq("id", aptDialog.id);
    }
    setAptDialog(null);
    queryClient.invalidateQueries({ queryKey: ["review-apontamentos", submissionId] });
    queryClient.invalidateQueries({ queryKey: ["deliverables", submissionId] });
    toast.success("Apontamento registrado");
  };

  const removeApontamento = async (id: string) => {
    if (!confirm("Remover este apontamento?")) return;
    const { error } = await supabase.from("review_apontamentos").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover"); return; }
    queryClient.invalidateQueries({ queryKey: ["review-apontamentos", submissionId] });
  };

  const openApontamentos = apontamentos.filter((a) => !a.resolved);
  const allApproved = deliverables.length > 0 && deliverables.every((d) => d.approved);
  const hasApontamentos = openApontamentos.length > 0;
  const approvedCount = deliverables.filter((d) => d.approved).length;
  const withApontamentosCount = new Set(openApontamentos.map((a) => a.deliverable_id)).size;
  const pendingCount = deliverables.length - approvedCount - withApontamentosCount;

  const devolverSubmissao = async () => {
    if (!submission || !user) return;
    if (!hasApontamentos) { toast.error("Adicione ao menos um apontamento antes de devolver."); return; }
    if (!confirm("Devolver esta submissão para o time operacional?")) return;
    const { error } = await supabase
      .from("review_submissions")
      .update({
        status: "devolvido",
        reviewed_at: new Date().toISOString(),
        review_summary: reviewSummary || null,
      })
      .eq("id", submissionId);
    if (error) { toast.error("Erro ao devolver submissão"); return; }
    supabase.functions.invoke("notify-review-event", { body: { event: "returned", submission_id: submissionId } }).catch(() => {});
    toast.success("Submissão devolvida ao time");
    queryClient.invalidateQueries({ queryKey: ["review-submissions"] });
    queryClient.invalidateQueries({ queryKey: ["review-submissions-year"] });
    onClose();
  };

  const finalizarRevisao = async () => {
    if (!submission || !user) return;
    if (!allApproved || hasApontamentos) {
      toast.error("Aprove todos os demonstrativos antes de finalizar.");
      return;
    }
    if (!confirm("Aprovar e finalizar esta revisão? Todas as etapas do fechamento desta competência serão marcadas como concluídas.")) return;

    const { error: updErr } = await supabase
      .from("review_submissions")
      .update({
        status: "aprovado",
        reviewed_at: new Date().toISOString(),
        review_summary: reviewSummary || null,
      })
      .eq("id", submissionId);
    if (updErr) { toast.error("Erro ao aprovar submissão"); return; }

    // Cascade: mark all monthly demand entries for this competencia as completed
    const client = clientById[submission.client_id];
    if (client) {
      const [year, monthMM] = submission.competencia.split("-");
      const monthlyTypes = ["lancamentos", "conciliacao_bancaria", "conciliacao_contabil"];
      const closingTypes = ["fechamento", "revisao"];
      const rows: any[] = [];
      monthlyTypes.forEach((t) => {
        rows.push({
          client_name: client.razao_social,
          month: monthMM,
          year,
          demand_type: t,
          status: "completed",
          filled_by: user.id,
        });
      });
      closingTypes.forEach((t) => {
        rows.push({
          client_name: client.razao_social,
          month: "closing",
          year,
          demand_type: t,
          status: "completed",
          filled_by: user.id,
        });
      });
      await supabase
        .from("demand_status_entries")
        .upsert(rows, { onConflict: "client_name,month,year,demand_type" });
    }

    supabase.functions.invoke("notify-review-event", { body: { event: "approved", submission_id: submissionId } }).catch(() => {});
    toast.success("Revisão aprovada e fechamento finalizado");
    queryClient.invalidateQueries({ queryKey: ["review-submissions"] });
    queryClient.invalidateQueries({ queryKey: ["review-submissions-year"] });
    onClose();
  };

  if (!submission) {
    return (
      <AppLayout>
        <div className="p-6 text-sm text-muted-foreground">Carregando submissão…</div>
      </AppLayout>
    );
  }

  const client = clientById[submission.client_id];
  const submitter = profileById[submission.submitted_by];
  const reviewer = submission.reviewer_id ? profileById[submission.reviewer_id] : null;
  const isOwner = user?.id === submission.submitted_by;
  const isReviewerView = canReview && (submission.status === "aguardando" || submission.status === "em_revisao");
  const isReturnedToMe = submission.status === "devolvido" && isOwner;

  return (
    <AppLayout>
      <div className="p-6 space-y-4 max-w-5xl pb-32">
        <button onClick={onClose} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar
        </button>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{client?.razao_social || "—"}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Competência <strong className="text-foreground">{competenciaLabel(submission.competencia)}</strong>
              {" · "}Liberado por {submitter?.display_name || "—"} há {timeAgo(submission.submitted_at)}
              {" · "}
              {submission.cycle_number}ª submissão
              {reviewer && submission.status !== "aguardando" && (
                <> · Revisora: <strong className="text-foreground">{reviewer.display_name}</strong></>
              )}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${REVIEW_STATUS_BADGE[submission.status]}`}>
            {REVIEW_STATUS_LABEL[submission.status]}
          </span>
        </div>

        {/* Resumo da revisora (quando devolvido) */}
        {submission.status === "devolvido" && submission.review_summary && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <div className="text-[11px] font-semibold text-destructive mb-1">Resumo da revisora</div>
            <div className="text-xs whitespace-pre-wrap">{submission.review_summary}</div>
          </div>
        )}

        {/* Histórico de versões */}
        {submissionHistory.length > 0 && (
          <details className="rounded-md border bg-muted/20">
            <summary className="cursor-pointer text-xs px-3 py-2 flex items-center gap-2 hover:bg-muted/40 rounded-md">
              <History className="w-3.5 h-3.5 text-muted-foreground" />
              Histórico de versões ({submissionHistory.length})
            </summary>
            <div className="px-3 pb-3 space-y-1.5">
              {submissionHistory.map((h) => (
                <div key={h.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${REVIEW_STATUS_BADGE[h.status]}`}>
                    {REVIEW_STATUS_LABEL[h.status]}
                  </span>
                  <span>#{h.cycle_number} · {profileById[h.submitted_by]?.display_name || "—"}</span>
                  <span className="ml-auto">há {timeAgo(h.submitted_at)}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Deliverables */}
        <div className="space-y-2">
          {deliverables.map((d) => {
            const apts = apontamentosByDeliverable[d.id] || [];
            const openApts = apts.filter((a) => !a.resolved);
            const hasOpen = openApts.length > 0;
            return (
              <div
                key={d.id}
                className={`rounded-md border p-3 ${hasOpen ? "border-destructive" : d.approved ? "border-success/50" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {d.titulo || `${TIPO_DEMONSTRATIVO_LABEL[d.tipo_demonstrativo]} v${d.versao}`}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {TIPO_DEMONSTRATIVO_LABEL[d.tipo_demonstrativo]} · v{d.versao} · {d.origem === "unico_sci" ? "UNICO SCI" : d.origem}
                      {d.file_size_bytes ? ` · ${(d.file_size_bytes / 1024).toFixed(0)} KB` : ""}
                    </div>
                  </div>

                  <button
                    onClick={() => openPdf(d.arquivo_path)}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" /> Abrir
                  </button>

                  {isReviewerView && (
                    <>
                      <button
                        onClick={() => toggleApprove(d)}
                        className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                          d.approved ? "bg-success/15 text-success" : "border hover:bg-muted"
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" /> {d.approved ? "Aprovado" : "Aprovar"}
                      </button>
                      <button
                        onClick={() => setAptDialog(d)}
                        className="text-xs px-2 py-1 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center gap-1"
                      >
                        <MessageSquarePlus className="w-3 h-3" /> Apontar
                      </button>
                    </>
                  )}
                </div>

                {apts.length > 0 && (
                  <div className="mt-2 rounded-md bg-destructive/10 p-2 space-y-1.5">
                    {apts.map((a) => (
                      <div key={a.id} className="flex items-start gap-2 text-xs">
                        {a.conta_referencia && (
                          <span className="font-mono text-[10px] bg-foreground/5 px-1.5 py-0.5 rounded">
                            {a.conta_referencia}
                          </span>
                        )}
                        <span className={`flex-1 ${a.resolved ? "line-through text-muted-foreground" : ""}`}>
                          {a.descricao}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          {profileById[a.created_by]?.display_name?.split(" ")[0] || "—"} · {timeAgo(a.created_at)}
                        </span>
                        {(a.created_by === user?.id || isReturnedToMe) && (
                          <button onClick={() => removeApontamento(a.id)} className="text-muted-foreground hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isReviewerView && (
          <div className="space-y-1.5">
            <Label className="text-xs">Resumo geral da revisão (opcional)</Label>
            <Textarea
              value={reviewSummary}
              onChange={(e) => setReviewSummary(e.target.value)}
              placeholder="Comentário adicional para o time operacional..."
              rows={2}
              className="text-sm"
            />
          </div>
        )}
      </div>

      {/* Sticky footer for reviewer */}
      {isReviewerView && (
        <div className="fixed bottom-0 left-0 right-0 ml-60 border-t bg-card px-6 py-3 flex items-center justify-between shadow-lg">
          <div className="text-xs text-muted-foreground">
            <span className="text-success font-medium">{approvedCount} aprovados</span>
            {" · "}
            <span className="text-destructive font-medium">{withApontamentosCount} com apontamentos</span>
            {" · "}
            <span>{pendingCount} pendentes</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              onClick={devolverSubmissao}
              disabled={!hasApontamentos}
              size="sm"
            >
              <Send className="w-3.5 h-3.5 mr-1" /> Devolver para o time
            </Button>
            <Button
              onClick={finalizarRevisao}
              disabled={!allApproved || hasApontamentos}
              size="sm"
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Finalizar revisão
            </Button>
          </div>
        </div>
      )}

      {/* Sticky footer for submitter (devolução) */}
      {isReturnedToMe && (
        <div className="fixed bottom-0 left-0 right-0 ml-60 border-t bg-card px-6 py-3 flex items-center justify-between shadow-lg">
          <div className="text-xs text-muted-foreground">
            <span className="text-destructive font-medium">{openApontamentos.length}</span>{" "}
            apontamento(s) aberto(s) para corrigir.
          </div>
          <Button
            onClick={() => setReenviarOpen(true)}
            size="sm"
          >
            <Reply className="w-3.5 h-3.5 mr-1" /> Reenviar com correções
          </Button>
        </div>
      )}

      <ApontamentoDialog
        deliverable={aptDialog}
        onCancel={() => setAptDialog(null)}
        onConfirm={addApontamento}
      />

      {client && (
        <ReenviarRevisaoDialog
          open={reenviarOpen}
          onOpenChange={setReenviarOpen}
          previousSubmissionId={submissionId}
          clientId={submission.client_id}
          clientName={client.razao_social}
          competencia={submission.competencia}
          tributacao={client.tributacao}
          apontamentosAnteriores={openApontamentos.map((a) => ({
            descricao: a.descricao,
            conta_referencia: a.conta_referencia,
          }))}
          onSubmitted={onClose}
        />
      )}
    </AppLayout>
  );
}

// =========================================================================
// Apontamento dialog
// =========================================================================
function ApontamentoDialog({
  deliverable,
  onCancel,
  onConfirm,
}: {
  deliverable: Deliverable | null;
  onCancel: () => void;
  onConfirm: (descricao: string, conta: string) => Promise<void>;
}) {
  const [descricao, setDescricao] = useState("");
  const [conta, setConta] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (deliverable) { setDescricao(""); setConta(""); }
  }, [deliverable]);

  if (!deliverable) return null;

  const submit = async () => {
    if (!descricao.trim()) { toast.error("Descreva o apontamento"); return; }
    setSaving(true);
    await onConfirm(descricao.trim(), conta.trim());
    setSaving(false);
  };

  return (
    <Dialog open={!!deliverable} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo apontamento</DialogTitle>
          <DialogDescription>
            {TIPO_DEMONSTRATIVO_LABEL[deliverable.tipo_demonstrativo]} · v{deliverable.versao}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Conta de referência (opcional)</Label>
            <Input
              value={conta}
              onChange={(e) => setConta(e.target.value)}
              placeholder="ex: 31010001"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição do apontamento</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              placeholder="O que precisa ser ajustado neste demonstrativo?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !descricao.trim()}>
            {saving ? "Salvando..." : "Registrar apontamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

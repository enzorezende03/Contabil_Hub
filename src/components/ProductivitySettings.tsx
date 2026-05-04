import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Pencil, Save, X, RefreshCw, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionPermissions, canPerformAction } from "@/hooks/use-action-permissions";

const TRIBS = [
  { value: "simples_nacional", label: "Simples Nacional" },
  { value: "lucro_presumido", label: "Lucro Presumido" },
  { value: "lucro_real", label: "Lucro Real" },
];
const PERFIS = ["standard", "premium", "vip"];

type ClientMult = Record<string, Record<string, number>>;
type Weights = { esforco: number; qualidade: number; prazo: number };
type CapCfg = { jornada_minutos: number; overhead_coef: number; warmup_qualidade_until: string };
type ComplexityMult = { baixa: number; media: number; alta: number };

export default function ProductivitySettings() {
  const { user, isAdmin } = useAuth();
  useActionPermissions();
  const canEdit = isAdmin || canPerformAction("configurar_produtividade", undefined);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recalcing, setRecalcing] = useState(false);

  const [clientMult, setClientMult] = useState<ClientMult>({});
  const [complexityMult, setComplexityMult] = useState<ComplexityMult>({ baixa: 1, media: 1.5, alta: 2 });
  const [weights, setWeights] = useState<Weights>({ esforco: 0.5, qualidade: 0.3, prazo: 0.2 });
  const [capCfg, setCapCfg] = useState<CapCfg>({
    jornada_minutos: 480, overhead_coef: 0.8, warmup_qualidade_until: "",
  });

  const [draft, setDraft] = useState<any>({});

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", [
        "productivity_client_multipliers",
        "productivity_complexity_multipliers",
        "productivity_score_weights",
        "productivity_capacity_config",
      ]);
    if (!data) return;
    for (const r of data) {
      if (r.key === "productivity_client_multipliers") setClientMult(r.value as any);
      if (r.key === "productivity_complexity_multipliers") setComplexityMult(r.value as any);
      if (r.key === "productivity_score_weights") setWeights(r.value as any);
      if (r.key === "productivity_capacity_config") setCapCfg(r.value as any);
    }
  };

  const startEdit = () => {
    setDraft({
      clientMult: JSON.parse(JSON.stringify(clientMult)),
      complexityMult: { ...complexityMult },
      weights: { ...weights },
      capCfg: { ...capCfg },
    });
    setEditing(true);
  };

  const save = async () => {
    const sum = (draft.weights.esforco || 0) + (draft.weights.qualidade || 0) + (draft.weights.prazo || 0);
    if (Math.abs(sum - 1) > 0.001) {
      return toast.error(`Soma dos pesos deve ser 1.0 (atual: ${sum.toFixed(2)})`);
    }
    setSaving(true);
    const upserts = [
      { key: "productivity_client_multipliers", value: draft.clientMult },
      { key: "productivity_complexity_multipliers", value: draft.complexityMult },
      { key: "productivity_score_weights", value: draft.weights },
      { key: "productivity_capacity_config", value: draft.capCfg },
    ];
    const results = await Promise.all(
      upserts.map((u) =>
        supabase.from("settings").upsert(
          { key: u.key, value: u.value, updated_by: user?.id },
          { onConflict: "key" },
        ),
      ),
    );
    setSaving(false);
    if (results.some((r) => r.error)) return toast.error("Erro ao salvar");
    setClientMult(draft.clientMult);
    setComplexityMult(draft.complexityMult);
    setWeights(draft.weights);
    setCapCfg(draft.capCfg);
    setEditing(false);
    toast.success("Configurações salvas!");
  };

  const recalc = async () => {
    setRecalcing(true);
    try {
      const { data, error } = await supabase.functions.invoke("compute-productivity-snapshots", { body: {} });
      if (error) throw error;
      toast.success(`Recalculado: ${(data as any)?.snapshots_written ?? 0} snapshots`);
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setRecalcing(false);
    }
  };

  const cur = editing ? draft : { clientMult, complexityMult, weights, capCfg };
  const wSum = (cur.weights.esforco || 0) + (cur.weights.qualidade || 0) + (cur.weights.prazo || 0);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Produtividade</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={recalc} disabled={recalcing}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${recalcing ? "animate-spin" : ""}`} />
            Recalcular tudo
          </Button>
          {canEdit && !editing && (
            <button onClick={startEdit} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
          )}
          {editing && (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50">
                <Save className="w-3.5 h-3.5" /> Salvar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pesos */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Pesos da fórmula composta</h4>
        <div className="grid grid-cols-3 gap-3">
          {(["esforco", "qualidade", "prazo"] as const).map((k) => (
            <div key={k} className="rounded-md border p-2">
              <p className="text-[10px] text-muted-foreground capitalize">{k}</p>
              {editing ? (
                <input
                  type="number" step="0.05" min={0} max={1}
                  value={draft.weights[k]}
                  onChange={(e) => setDraft({ ...draft, weights: { ...draft.weights, [k]: Number(e.target.value) } })}
                  className="w-full mt-1 h-7 text-sm border rounded px-2 bg-background"
                />
              ) : (
                <p className="text-lg font-semibold">{(weights[k] * 100).toFixed(0)}%</p>
              )}
            </div>
          ))}
        </div>
        {editing && (
          <p className={`text-[11px] mt-1 ${Math.abs(wSum - 1) > 0.001 ? "text-destructive" : "text-muted-foreground"}`}>
            Soma: {wSum.toFixed(2)} (deve ser 1.00)
          </p>
        )}
      </div>

      {/* Complexidade */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Multiplicadores de complexidade</h4>
        <div className="grid grid-cols-3 gap-3">
          {(["baixa", "media", "alta"] as const).map((k) => (
            <div key={k} className="rounded-md border p-2">
              <p className="text-[10px] text-muted-foreground capitalize">{k}</p>
              {editing ? (
                <input
                  type="number" step="0.1" min={0}
                  value={draft.complexityMult[k]}
                  onChange={(e) => setDraft({ ...draft, complexityMult: { ...draft.complexityMult, [k]: Number(e.target.value) } })}
                  className="w-full mt-1 h-7 text-sm border rounded px-2 bg-background"
                />
              ) : (
                <p className="text-lg font-semibold">×{complexityMult[k]}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Cliente: matriz tributação × perfil */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Multiplicadores de cliente (tributação × perfil)</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 py-1.5 text-left">Tributação</th>
                {PERFIS.map((p) => <th key={p} className="px-2 py-1.5 text-center capitalize">{p}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y">
              {TRIBS.map((t) => (
                <tr key={t.value}>
                  <td className="px-2 py-1.5 font-medium">{t.label}</td>
                  {PERFIS.map((p) => (
                    <td key={p} className="px-2 py-1.5 text-center">
                      {editing ? (
                        <input
                          type="number" step="0.1" min={0}
                          value={draft.clientMult?.[t.value]?.[p] ?? 1}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            const nm = JSON.parse(JSON.stringify(draft.clientMult || {}));
                            nm[t.value] = nm[t.value] || {};
                            nm[t.value][p] = v;
                            setDraft({ ...draft, clientMult: nm });
                          }}
                          className="w-16 h-7 text-center text-sm border rounded bg-background"
                        />
                      ) : (
                        <span className="font-semibold">×{clientMult?.[t.value]?.[p] ?? "—"}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Capacidade */}
      <div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Capacidade & warm-up</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border p-2">
            <p className="text-[10px] text-muted-foreground">Jornada (min/dia)</p>
            {editing ? (
              <input
                type="number" min={60} max={720}
                value={draft.capCfg.jornada_minutos}
                onChange={(e) => setDraft({ ...draft, capCfg: { ...draft.capCfg, jornada_minutos: Number(e.target.value) } })}
                className="w-full mt-1 h-7 text-sm border rounded px-2 bg-background"
              />
            ) : <p className="text-lg font-semibold">{capCfg.jornada_minutos}</p>}
          </div>
          <div className="rounded-md border p-2">
            <p className="text-[10px] text-muted-foreground">Overhead (0-1)</p>
            {editing ? (
              <input
                type="number" step="0.05" min={0.1} max={1}
                value={draft.capCfg.overhead_coef}
                onChange={(e) => setDraft({ ...draft, capCfg: { ...draft.capCfg, overhead_coef: Number(e.target.value) } })}
                className="w-full mt-1 h-7 text-sm border rounded px-2 bg-background"
              />
            ) : <p className="text-lg font-semibold">{capCfg.overhead_coef}</p>}
          </div>
          <div className="rounded-md border p-2">
            <p className="text-[10px] text-muted-foreground">Warm-up qualidade até</p>
            {editing ? (
              <input
                type="date"
                value={draft.capCfg.warmup_qualidade_until || ""}
                onChange={(e) => setDraft({ ...draft, capCfg: { ...draft.capCfg, warmup_qualidade_until: e.target.value } })}
                className="w-full mt-1 h-7 text-sm border rounded px-2 bg-background"
              />
            ) : <p className="text-sm font-semibold">{capCfg.warmup_qualidade_until || "—"}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

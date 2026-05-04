// Edge function: compute-productivity-snapshots
// Calcula snapshots mensais de produtividade. Pode ser chamada via cron diário
// ou sob demanda com { user_id?, ano?, mes?, force?: true }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ClientMult = Record<string, Record<string, number>>;
type ComplexityMult = Record<string, number>;
type Weights = { esforco: number; qualidade: number; prazo: number };
type CapCfg = {
  jornada_minutos: number;
  overhead_coef: number;
  warmup_qualidade_until: string | null;
};
type TaskWeights = { type: string; weight: number }[];

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function startOfMonth(ano: number, mes: number) {
  return new Date(Date.UTC(ano, mes - 1, 1));
}
function startOfNextMonth(ano: number, mes: number) {
  return new Date(Date.UTC(ano, mes, 1));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    let body: any = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { body = {}; }
    }

    // Determinar períodos: padrão = mês corrente + mês anterior
    const now = new Date();
    const periods: { ano: number; mes: number }[] = [];
    if (body.ano && body.mes) {
      periods.push({ ano: Number(body.ano), mes: Number(body.mes) });
    } else {
      const cur = { ano: now.getUTCFullYear(), mes: now.getUTCMonth() + 1 };
      const prev = cur.mes === 1
        ? { ano: cur.ano - 1, mes: 12 }
        : { ano: cur.ano, mes: cur.mes - 1 };
      periods.push(cur, prev);
    }

    // Carregar settings
    const { data: settingsRows } = await sb
      .from("settings")
      .select("key, value")
      .in("key", [
        "productivity_client_multipliers",
        "productivity_complexity_multipliers",
        "productivity_score_weights",
        "productivity_capacity_config",
        "demand_weights",
      ]);
    const sget = (k: string) =>
      settingsRows?.find((r: any) => r.key === k)?.value;

    const clientMult: ClientMult = sget("productivity_client_multipliers") || {};
    const complexityMult: ComplexityMult =
      sget("productivity_complexity_multipliers") || { baixa: 1, media: 1.5, alta: 2 };
    const baseWeights: Weights =
      sget("productivity_score_weights") || { esforco: 0.5, qualidade: 0.3, prazo: 0.2 };
    const capCfg: CapCfg = sget("productivity_capacity_config") || {
      jornada_minutos: 480,
      overhead_coef: 0.8,
      warmup_qualidade_until: null,
    };
    const taskWeights: TaskWeights = (sget("demand_weights") || []) as TaskWeights;
    const weightOf = (t: string) =>
      taskWeights.find((w) => w.type === t)?.weight ?? 1;

    // Warm-up qualidade
    const warmupUntil = capCfg.warmup_qualidade_until
      ? new Date(capCfg.warmup_qualidade_until + "T23:59:59Z")
      : null;
    const inWarmup = !!(warmupUntil && now < warmupUntil);
    const weights: Weights = inWarmup
      ? { esforco: 0.7, qualidade: 0, prazo: 0.3 }
      : baseWeights;

    // Profiles ativos
    let userIds: string[] = [];
    if (body.user_id) {
      userIds = [body.user_id];
    } else {
      const { data: profs } = await sb.from("profiles").select("user_id");
      userIds = (profs || []).map((p: any) => p.user_id);
    }

    // Carregar clientes uma vez (matriz tributação/perfil)
    const { data: clientsRows } = await sb
      .from("clients")
      .select("id, razao_social, tributacao, perfil");
    const clientByRazao = new Map<string, any>();
    const clientById = new Map<string, any>();
    for (const c of clientsRows || []) {
      clientByRazao.set(c.razao_social, c);
      clientById.set(c.id, c);
    }
    const clientFactor = (trib?: string, perfil?: string) => {
      const t = trib || "simples_nacional";
      const p = perfil || "standard";
      return clientMult?.[t]?.[p] ?? 1;
    };

    let totalSnaps = 0;
    const errors: any[] = [];

    for (const period of periods) {
      const { ano, mes } = period;
      const monthStart = startOfMonth(ano, mes).toISOString();
      const monthEnd = startOfNextMonth(ano, mes).toISOString();

      // Dias úteis via função SQL
      const { data: bdRows } = await sb.rpc("business_days_in_month", {
        p_ano: ano,
        p_mes: mes,
      });
      const businessDays = Number(bdRows ?? 0);

      // Pré-fetch ausências do mês inteiro (para todos os user_ids)
      const periodStart = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const lastDay = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
      const periodEndDate = `${ano}-${String(mes).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const { data: availRows } = await sb
        .from("team_availability")
        .select("user_id, data_inicio, data_fim, horas_dia")
        .lte("data_inicio", periodEndDate)
        .gte("data_fim", periodStart);

      // Pré-fetch demands concluídas no mês
      const { data: demandsRows } = await sb
        .from("demands")
        .select("id, assignee, types, complexity, client, completed_at, internal_deadline")
        .eq("status", "completed")
        .gte("completed_at", monthStart)
        .lt("completed_at", monthEnd);

      // Pré-fetch demand_status_entries do mês competência
      const { data: dseRows } = await sb
        .from("demand_status_entries")
        .select("filled_by, demand_type, status, client_name, year, month, updated_at")
        .eq("status", "completed")
        .eq("year", String(ano))
        .eq("month", String(mes).padStart(2, "0"));

      // Pré-fetch revisões finalizadas no mês
      const { data: revRows } = await sb
        .from("review_submissions")
        .select("id, reviewer_id, submitted_by, client_id, status, cycle_number, reviewed_at")
        .in("status", ["aprovado", "devolvido"])
        .gte("reviewed_at", monthStart)
        .lt("reviewed_at", monthEnd);

      // Plannings auxiliares para complexidade de células
      const { data: planRows } = await sb
        .from("plannings")
        .select("client, types, internal_deadline");

      for (const userId of userIds) {
        try {
          // ---- Effort ----
          let effort = 0;
          let tasksCount = 0;
          let onTime = 0;
          const sampleTasks: any[] = [];

          // demands do user
          for (const d of (demandsRows || []).filter((x: any) => x.assignee === userId)) {
            const cli = clientByRazao.get(d.client);
            const cm = clientFactor(cli?.tributacao, cli?.perfil);
            const xm = complexityMult[d.complexity || "media"] ?? 1.5;
            const tipos: string[] = Array.isArray(d.types) ? d.types : [];
            const wsum = tipos.reduce((s, t) => s + weightOf(t), 0) || 1;
            const pts = wsum * xm * cm;
            effort += pts;
            tasksCount += 1;
            const dl = d.internal_deadline ? new Date(d.internal_deadline) : null;
            const cdone = d.completed_at ? new Date(d.completed_at) : null;
            const okPrazo = dl && cdone ? cdone <= new Date(dl.toISOString().slice(0, 10) + "T23:59:59Z") : true;
            if (okPrazo) onTime += 1;
            if (sampleTasks.length < 50) {
              sampleTasks.push({
                origem: "demand",
                cliente: d.client,
                tipos,
                complexidade: d.complexity,
                tributacao: cli?.tributacao,
                perfil: cli?.perfil,
                multiplicador_complexidade: xm,
                multiplicador_cliente: cm,
                pontos: Number(pts.toFixed(2)),
                no_prazo: okPrazo,
                concluida_em: d.completed_at,
              });
            }
          }

          // demand_status_entries (células de fechamento)
          for (const e of (dseRows || []).filter((x: any) => x.filled_by === userId)) {
            const cli = clientByRazao.get(e.client_name);
            const cm = clientFactor(cli?.tributacao, cli?.perfil);
            // Complexidade: tentar planning correspondente
            let cmplx: string = "media";
            const plan = (planRows || []).find(
              (p: any) =>
                p.client === e.client_name &&
                Array.isArray(p.types) &&
                p.types.includes(e.demand_type),
            );
            const cmplxMult = complexityMult[cmplx] ?? 1.5;
            const w = weightOf(e.demand_type);
            const pts = w * cmplxMult * cm;
            effort += pts;
            tasksCount += 1;
            // Prazo: planning ou último dia do mês seguinte à competência
            let dlISO: string | null = plan?.internal_deadline || null;
            if (!dlISO) {
              const yy = Number(e.year), mm = Number(e.month);
              const next = mm === 12 ? { y: yy + 1, m: 1 } : { y: yy, m: mm + 1 };
              const last = new Date(Date.UTC(next.y, next.m, 0));
              dlISO = last.toISOString().slice(0, 10);
            }
            const completedAt = new Date(e.updated_at);
            const okPrazo = completedAt <= new Date(dlISO + "T23:59:59Z");
            if (okPrazo) onTime += 1;
            if (sampleTasks.length < 50) {
              sampleTasks.push({
                origem: "fechamento",
                cliente: e.client_name,
                tipos: [e.demand_type],
                competencia: `${e.month}/${e.year}`,
                complexidade: cmplx,
                tributacao: cli?.tributacao,
                perfil: cli?.perfil,
                multiplicador_complexidade: cmplxMult,
                multiplicador_cliente: cm,
                pontos: Number(pts.toFixed(2)),
                no_prazo: okPrazo,
                concluida_em: e.updated_at,
              });
            }
          }

          // Revisões: contam como esforço para reviewer
          for (const r of (revRows || []).filter((x: any) => x.reviewer_id === userId)) {
            const cli = clientById.get(r.client_id);
            const cm = clientFactor(cli?.tributacao, cli?.perfil);
            const xm = complexityMult["media"] ?? 1.5;
            const w = weightOf("revisao");
            const pts = w * xm * cm;
            effort += pts;
            tasksCount += 1;
            onTime += 1; // revisões não têm prazo interno aqui — consideradas no prazo
            if (sampleTasks.length < 50) {
              sampleTasks.push({
                origem: "revisao",
                cliente: cli?.razao_social,
                tipos: ["revisao"],
                complexidade: "media",
                tributacao: cli?.tributacao,
                perfil: cli?.perfil,
                multiplicador_complexidade: xm,
                multiplicador_cliente: cm,
                pontos: Number(pts.toFixed(2)),
                no_prazo: true,
                concluida_em: r.reviewed_at,
              });
            }
          }

          // ---- Quality (submissões do user como submitted_by) ----
          const userSubs = (revRows || []).filter((x: any) => x.submitted_by === userId);
          const subsTotal = userSubs.length;
          const approvedFirst = userSubs.filter(
            (x: any) => x.status === "aprovado" && x.cycle_number === 1,
          ).length;
          const qualityPct = subsTotal > 0 ? (approvedFirst / subsTotal) * 100 : null;

          // ---- Capacity ----
          const userAvail = (availRows || []).filter((a: any) => a.user_id === userId);
          let absentMinutes = 0;
          for (const a of userAvail) {
            const ds = new Date(a.data_inicio + "T00:00:00Z");
            const de = new Date(a.data_fim + "T00:00:00Z");
            const ms = new Date(`${periodStart}T00:00:00Z`);
            const me = new Date(`${periodEndDate}T00:00:00Z`);
            const start = ds < ms ? ms : ds;
            const end = de > me ? me : de;
            // contar dias úteis no intervalo
            for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
              const dow = d.getUTCDay();
              if (dow >= 1 && dow <= 5) {
                absentMinutes += a.horas_dia || capCfg.jornada_minutos;
              }
            }
          }
          const capacity = Math.max(
            0,
            Math.round(businessDays * capCfg.jornada_minutos * capCfg.overhead_coef) -
              absentMinutes,
          );

          const effortPct = capacity > 0 ? Math.min(150, (effort / capacity) * 100) : 0;
          const timelinessPct = tasksCount > 0 ? (onTime / tasksCount) * 100 : 0;

          // Composite (rebalance se em warmup ou sem qualidade)
          let w = weights;
          if (qualityPct === null && !inWarmup) {
            const sum = w.esforco + w.prazo;
            w = { esforco: w.esforco / sum, qualidade: 0, prazo: w.prazo / sum };
          }
          const composite =
            effortPct * w.esforco +
            (qualityPct ?? 0) * w.qualidade +
            timelinessPct * w.prazo;

          // Upsert
          const { error: upErr } = await sb
            .from("productivity_snapshots")
            .upsert(
              {
                user_id: userId,
                ano,
                mes,
                effort_points: Number(effort.toFixed(2)),
                capacity_minutes: capacity,
                effort_score_pct: Number(effortPct.toFixed(2)),
                quality_score_pct: qualityPct === null ? null : Number(qualityPct.toFixed(2)),
                timeliness_score_pct: Number(timelinessPct.toFixed(2)),
                composite_score: Number(composite.toFixed(2)),
                tasks_completed_count: tasksCount,
                tasks_on_time_count: onTime,
                submissions_approved_first: approvedFirst,
                submissions_total: subsTotal,
                details: {
                  business_days: businessDays,
                  absent_minutes: absentMinutes,
                  warmup_active: inWarmup,
                  weights_applied: w,
                  sample_tasks: sampleTasks,
                },
                calculated_at: new Date().toISOString(),
              },
              { onConflict: "user_id,ano,mes" },
            );
          if (upErr) errors.push({ userId, ano, mes, error: upErr.message });
          else totalSnaps += 1;
        } catch (e) {
          errors.push({ userId, ano, mes, error: String(e) });
        }
      }
    }

    return ok({
      ok: true,
      snapshots_written: totalSnaps,
      periods,
      warmup_active: inWarmup,
      errors,
    });
  } catch (e) {
    console.error(e);
    return ok({ ok: false, error: String(e) }, 500);
  }
});

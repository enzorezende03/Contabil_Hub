// Painel Gerencial — generate-weekly-briefing
// Runs Mondays 06:05 BRT. Computes deltas vs last week, infers alerts,
// generates a 10-slide PPTX with pptxgenjs, uploads to briefing-pptx,
// and UPSERTs a briefing_drafts row in status 'em_revisao'.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import pptxgen from "npm:pptxgenjs@3.12.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const NAVY = "3D5A80";
const TEAL = "5B9EA6";
const DARK = "1F2937";
const MUTED = "6B7280";
const RED = "DC2626";
const AMBER = "D97706";

type Snap = {
  snapshot_date: string;
  iso_week: string;
  indicador: string;
  unidade: string | null;
  tributacao: string | null;
  valor: number;
};

const INDICATORS: { key: string; label: string }[] = [
  { key: "lancamentos_pendentes", label: "Lançamentos pendentes" },
  { key: "conciliacao_bancaria_pendente", label: "Conciliação bancária" },
  { key: "conciliacao_contabil_pendente", label: "Conciliação contábil" },
  { key: "fechamento_mensal_pendente", label: "Fechamento mensal" },
  { key: "fechamento_anual_pendente", label: "Fechamento anual" },
  { key: "revisao_pendente", label: "Revisões aguardando" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let force = url.searchParams.get("force") === "true";
    if (req.method === "POST") {
      try {
        const b = await req.json();
        if (typeof b?.force === "boolean") force = b.force;
      } catch (_) { /* */ }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Determine current ISO week (Monday-based, same calc as SQL date_trunc('week'))
    const today = new Date();
    const dow = today.getUTCDay(); // 0..6 (Sun..Sat)
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + diffToMonday));
    const snapshotDate = monday.toISOString().slice(0, 10);
    const isoWeek = getIsoWeekLabel(monday);

    // Skip if a non-em_revisao draft already exists and not force
    const { data: existing } = await supabase
      .from("briefing_drafts")
      .select("id, status")
      .eq("iso_week", isoWeek)
      .maybeSingle();
    if (existing && existing.status !== "em_revisao" && !force) {
      return json({ ok: true, skipped: true, reason: `Briefing já está em status '${existing.status}'`, iso_week: isoWeek });
    }

    // Fetch totals (rows with unidade IS NULL AND tributacao IS NULL = global totals)
    const { data: snaps, error: snapErr } = await supabase
      .from("backlog_snapshots")
      .select("*")
      .is("unidade", null)
      .is("tributacao", null)
      .order("snapshot_date", { ascending: true });
    if (snapErr) throw snapErr;
    const rows = (snaps || []) as Snap[];

    // Build per-indicator series
    const series = new Map<string, Snap[]>();
    for (const r of rows) {
      if (!series.has(r.indicador)) series.set(r.indicador, []);
      series.get(r.indicador)!.push(r);
    }

    const summaryLines: string[] = [];
    const alerts: { severity: "info" | "atencao" | "critico"; title: string; detail: string }[] = [];
    const kpiTable: { label: string; current: number; delta: number | null; arrow: string }[] = [];

    for (const ind of INDICATORS) {
      const s = series.get(ind.key) || [];
      const cur = s.find((x) => x.snapshot_date === snapshotDate)?.valor ?? s[s.length - 1]?.valor ?? 0;
      const prev = s[s.length - 2]?.valor ?? null;
      const delta = prev === null ? null : cur - prev;
      const arrow = delta === null ? "—" : delta > 0 ? "▲" : delta < 0 ? "▼" : "→";
      kpiTable.push({ label: ind.label, current: cur, delta, arrow });

      // Alert rule: 4 weeks of growth in backlog indicators
      const last4 = s.slice(-4).map((x) => x.valor);
      if (last4.length === 4 && ind.key !== "revisao_pendente") {
        const growing = last4.every((v, i) => i === 0 || v >= last4[i - 1]);
        const realGrowth = last4[3] > last4[0];
        if (growing && realGrowth) {
          alerts.push({
            severity: "critico",
            title: `${ind.label} — backlog em alta`,
            detail: `Cresceu 4 semanas seguidas: ${last4.join(" → ")}.`,
          });
        }
      }

      if (delta !== null && delta > 0) {
        summaryLines.push(`${ind.label}: ${cur} (${arrow} +${delta} vs. semana anterior)`);
      } else if (delta !== null && delta < 0) {
        summaryLines.push(`${ind.label}: ${cur} (${arrow} ${delta} vs. semana anterior)`);
      } else {
        summaryLines.push(`${ind.label}: ${cur}`);
      }
    }

    const autoSummary =
      `Resumo da semana ${isoWeek} (snapshot ${snapshotDate}):\n\n` +
      summaryLines.map((l) => "• " + l).join("\n");

    if (alerts.length === 0) {
      alerts.push({
        severity: "info",
        title: "Sem alertas críticos automáticos",
        detail: "Nenhum indicador cresceu 4 semanas seguidas. Revisar manualmente.",
      });
    }

    // Generate PPTX
    const pptx = new pptxgen();
    pptx.layout = "LAYOUT_WIDE";
    pptx.title = `Briefing semanal ${isoWeek}`;

    // Slide 1 — capa
    const s1 = pptx.addSlide();
    s1.background = { color: NAVY };
    s1.addText("Briefing semanal", { x: 0.5, y: 2.2, w: 12, h: 0.8, fontSize: 36, color: "FFFFFF", bold: true, fontFace: "Calibri" });
    s1.addText(isoWeek, { x: 0.5, y: 3.1, w: 12, h: 0.6, fontSize: 28, color: TEAL, fontFace: "Calibri" });
    s1.addText(`Snapshot ${snapshotDate}`, { x: 0.5, y: 3.8, w: 12, h: 0.4, fontSize: 16, color: "CADCFC", fontFace: "Calibri" });

    // Slide 2 — KPIs principais
    const s2 = pptx.addSlide();
    titleBar(s2, "Indicadores da semana");
    const tableRows: any[] = [
      [
        { text: "Indicador", options: { bold: true, fill: NAVY, color: "FFFFFF" } },
        { text: "Atual", options: { bold: true, fill: NAVY, color: "FFFFFF", align: "right" } },
        { text: "Variação", options: { bold: true, fill: NAVY, color: "FFFFFF", align: "right" } },
      ],
      ...kpiTable.map((k) => [
        { text: k.label },
        { text: String(k.current), options: { align: "right", bold: true } },
        {
          text: k.delta === null ? "—" : `${k.arrow} ${k.delta > 0 ? "+" : ""}${k.delta}`,
          options: { align: "right", color: k.delta && k.delta > 0 ? RED : k.delta && k.delta < 0 ? "059669" : MUTED },
        },
      ]),
    ];
    s2.addTable(tableRows, { x: 0.6, y: 1.2, w: 12.1, fontSize: 16, fontFace: "Calibri", border: { type: "solid", color: "E5E7EB", pt: 0.5 } });

    // Slide 3 — Resumo executivo
    const s3 = pptx.addSlide();
    titleBar(s3, "Resumo executivo");
    s3.addText(autoSummary, { x: 0.6, y: 1.2, w: 12.1, h: 5.5, fontSize: 16, color: DARK, fontFace: "Calibri", valign: "top" });

    // Slide 4 — Alertas
    const s4 = pptx.addSlide();
    titleBar(s4, "Alertas e pontos de atenção");
    let y = 1.2;
    for (const a of alerts.slice(0, 6)) {
      const color = a.severity === "critico" ? RED : a.severity === "atencao" ? AMBER : TEAL;
      s4.addShape("rect", { x: 0.6, y, w: 0.15, h: 0.9, fill: { color } });
      s4.addText(a.title, { x: 0.9, y, w: 11.8, h: 0.4, fontSize: 18, bold: true, color: DARK, fontFace: "Calibri" });
      s4.addText(a.detail, { x: 0.9, y: y + 0.4, w: 11.8, h: 0.5, fontSize: 13, color: MUTED, fontFace: "Calibri" });
      y += 1.05;
    }

    // Slide 5 — Próximos focos (placeholder, editado pela liderança)
    const s5 = pptx.addSlide();
    titleBar(s5, "Prioridades da próxima semana");
    s5.addText("Editar na tela de revisão do briefing.", {
      x: 0.6, y: 1.2, w: 12.1, h: 0.6, fontSize: 16, italic: true, color: MUTED, fontFace: "Calibri",
    });

    // Slides 6-9 — Detalhe por indicador (top 4 backlog)
    const detailKeys = ["lancamentos_pendentes", "conciliacao_bancaria_pendente", "conciliacao_contabil_pendente", "fechamento_mensal_pendente"];
    for (const key of detailKeys) {
      const ind = INDICATORS.find((i) => i.key === key)!;
      const slide = pptx.addSlide();
      titleBar(slide, ind.label);
      const s = series.get(key) || [];
      const last8 = s.slice(-8);
      if (last8.length >= 2) {
        const chartData = [{
          name: ind.label,
          labels: last8.map((r) => r.snapshot_date.slice(5)),
          values: last8.map((r) => r.valor),
        }];
        slide.addChart("line", chartData, {
          x: 0.6, y: 1.2, w: 12.1, h: 5.5,
          chartColors: [NAVY],
          showLegend: false,
          catAxisLabelFontSize: 12,
          valAxisLabelFontSize: 12,
          lineSize: 3,
        });
      } else {
        slide.addText("Histórico ainda em construção (menos de 2 semanas).", {
          x: 0.6, y: 3, w: 12.1, h: 0.6, fontSize: 16, italic: true, color: MUTED, fontFace: "Calibri",
        });
      }
    }

    // Slide 10 — Encerramento
    const s10 = pptx.addSlide();
    s10.background = { color: NAVY };
    s10.addText("Obrigado", { x: 0.5, y: 2.5, w: 12, h: 0.8, fontSize: 40, bold: true, color: "FFFFFF", fontFace: "Calibri" });
    s10.addText("2M Grupo • Controle gerencial", { x: 0.5, y: 3.4, w: 12, h: 0.4, fontSize: 18, color: TEAL, fontFace: "Calibri" });

    const buf = (await pptx.write({ outputType: "uint8array" })) as Uint8Array;

    const storagePath = `${isoWeek}.pptx`;
    const { error: upErr } = await supabase.storage
      .from("briefing-pptx")
      .upload(storagePath, buf, {
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        upsert: true,
      });
    if (upErr) throw upErr;

    // UPSERT briefing draft
    const payload = {
      iso_week: isoWeek,
      data_referencia: snapshotDate,
      status: "em_revisao",
      generated_at: new Date().toISOString(),
      pptx_storage_path: storagePath,
      auto_summary: autoSummary,
      auto_alerts: alerts,
      custom_summary: existing ? undefined : autoSummary,
      custom_alerts: existing ? undefined : alerts,
      custom_focus: existing ? undefined : [],
    };
    // strip undefined
    const cleaned = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined));

    const { error: upsertErr } = await supabase
      .from("briefing_drafts")
      .upsert(cleaned, { onConflict: "iso_week" });
    if (upsertErr) throw upsertErr;

    return json({ ok: true, iso_week: isoWeek, snapshot_date: snapshotDate, alerts: alerts.length, storage_path: storagePath });
  } catch (err) {
    console.error("[generate-weekly-briefing]", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function titleBar(slide: any, title: string) {
  slide.background = { color: "FFFFFF" };
  slide.addShape("rect", { x: 0, y: 0, w: 13.333, h: 0.8, fill: { color: NAVY } });
  slide.addText(title, { x: 0.5, y: 0.1, w: 12, h: 0.6, fontSize: 22, bold: true, color: "FFFFFF", fontFace: "Calibri" });
}

function getIsoWeekLabel(d: Date) {
  // ISO 8601: week starts Monday; year is year containing Thursday
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

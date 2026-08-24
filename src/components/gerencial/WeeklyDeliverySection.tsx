import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  BarChart,
  Bar,
  Line,
  ComposedChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";

type WeekRow = {
  week_start: string;
  iso_week: string;
  origem: "demands" | "plannings";
  solicitadas: number;
  entregues: number;
  entregues_no_prazo: number;
};

type LateRow = {
  origem: "demands" | "plannings";
  id: string;
  client_name: string;
  types: string[] | null;
  responsavel: string | null;
  internal_deadline: string;
  dias_atraso: number;
};

type Payload = {
  weeks: WeekRow[];
  late: LateRow[];
  open: Record<string, number>;
  computed_at: string;
};

const ORIGEM_LABEL: Record<string, string> = {
  demands: "Solicitações de clientes",
  plannings: "Planejamento",
};

const TYPE_LABELS: Record<string, string> = {
  lancamentos: "Lançamentos",
  conciliacao_bancaria: "Conc. bancária",
  conciliacao_contabil: "Conc. contábil",
  fechamento: "Fechamento",
  revisao: "Revisão",
  outros: "Outros",
};

function fmtWeekLabel(iso: string) {
  return iso.replace(/^\d{4}-/, "");
}

function pct(part: number, total: number) {
  if (!total) return null;
  return Math.round((part / total) * 100);
}

function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null || value === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="w-3 h-3" /> igual
      </span>
    );
  }
  const positiveIsGood = invert ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        positiveIsGood ? "text-status-completed" : "text-status-late"
      }`}
    >
      <Icon className="w-3 h-3" />
      {value > 0 ? "+" : ""}
      {value} vs. sem. anterior
    </span>
  );
}

function MiniKpi({
  label,
  value,
  hint,
  delta,
  invertDelta,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  delta?: number | null;
  invertDelta?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p
        className={`text-2xl font-semibold tracking-tight mt-0.5 ${
          tone === "danger" ? "text-status-late" : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      {delta !== undefined && (
        <div className="mt-1">
          <Delta value={delta ?? null} invert={invertDelta} />
        </div>
      )}
    </div>
  );
}

export default function WeeklyDeliverySection({
  unidade,
  tributacao,
}: {
  unidade: string;
  tributacao: string;
}) {
  const [weekOffset, setWeekOffset] = useState("0"); // 0 = semana atual

  const { data, isLoading } = useQuery({
    queryKey: ["weekly-delivery", unidade, tributacao],
    queryFn: async (): Promise<Payload> => {
      const { data, error } = await supabase.rpc("weekly_delivery_overview" as any, {
        p_weeks: 12,
        p_unidade: unidade === "all" ? null : unidade,
        p_tributacao: tributacao === "all" ? null : tributacao,
      });
      if (error) throw error;
      return data as Payload;
    },
  });

  const weeks = useMemo(() => {
    const list = [...(data?.weeks || [])];
    list.sort((a, b) => a.week_start.localeCompare(b.week_start));
    return list;
  }, [data]);

  const weekStarts = useMemo(
    () => Array.from(new Set(weeks.map((w) => w.week_start))).sort(),
    [weeks],
  );

  const selectedIdx = weekStarts.length - 1 - Number(weekOffset);
  const selectedStart = weekStarts[selectedIdx];
  const prevStart = weekStarts[selectedIdx - 1];

  const rowFor = (start: string | undefined, origem: string) =>
    weeks.find((w) => w.week_start === start && w.origem === origem);

  const chartData = useMemo(
    () =>
      weekStarts.map((start) => {
        const d = rowFor(start, "demands");
        const p = rowFor(start, "plannings");
        const entregues = (d?.entregues ?? 0) + (p?.entregues ?? 0);
        const noPrazo = (d?.entregues_no_prazo ?? 0) + (p?.entregues_no_prazo ?? 0);
        const iso = d?.iso_week || p?.iso_week || start;
        return {
          week: fmtWeekLabel(iso),
          sol_demands: d?.solicitadas ?? 0,
          sol_plannings: p?.solicitadas ?? 0,
          entregues,
          pct_prazo: pct(noPrazo, entregues) ?? 0,
        };
      }),
    [weekStarts, weeks],
  );

  const lateByOrigem = (origem: string) =>
    (data?.late || []).filter((l) => l.origem === origem);

  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const sheet = weekStarts.flatMap((start) =>
      (["demands", "plannings"] as const).map((origem) => {
        const r = rowFor(start, origem);
        return {
          Semana: r?.iso_week || start,
          Início: new Date(start).toLocaleDateString("pt-BR"),
          Base: ORIGEM_LABEL[origem],
          Solicitadas: r?.solicitadas ?? 0,
          Entregues: r?.entregues ?? 0,
          "Entregues no prazo": r?.entregues_no_prazo ?? 0,
          "% no prazo": pct(r?.entregues_no_prazo ?? 0, r?.entregues ?? 0) ?? "",
          Saldo: (r?.solicitadas ?? 0) - (r?.entregues ?? 0),
        };
      }),
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Semanal");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        (data?.late || []).map((l) => ({
          Base: ORIGEM_LABEL[l.origem],
          Empresa: l.client_name,
          Tipos: (l.types || []).map((t) => TYPE_LABELS[t] || t).join(", "),
          Responsável: l.responsavel || "—",
          "Prazo interno": new Date(l.internal_deadline).toLocaleDateString("pt-BR"),
          "Dias de atraso": l.dias_atraso,
        })),
      ),
      "Em atraso",
    );
    XLSX.writeFile(wb, `entregas_semanais_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (isLoading) {
    return (
      <Card className="p-4 space-y-3">
        <Skeleton className="h-6 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-semibold">Entregas da semana</h2>
          <p className="text-xs text-muted-foreground">
            Solicitado × entregue × cumprimento do prazo interno
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={weekOffset} onValueChange={setWeekOffset}>
            <SelectTrigger className="w-[210px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weekStarts
                .slice()
                .reverse()
                .map((start, i) => {
                  const iso =
                    rowFor(start, "demands")?.iso_week ||
                    rowFor(start, "plannings")?.iso_week ||
                    start;
                  return (
                    <SelectItem key={start} value={String(i)}>
                      {i === 0 ? "Semana atual" : i === 1 ? "Semana anterior" : iso} ·{" "}
                      {new Date(start).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </SelectItem>
                  );
                })}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4" /> Exportar Excel
          </Button>
        </div>
      </div>

      {(["demands", "plannings"] as const).map((origem) => {
        const cur = rowFor(selectedStart, origem);
        const prev = rowFor(prevStart, origem);
        const entregues = cur?.entregues ?? 0;
        const noPrazo = cur?.entregues_no_prazo ?? 0;
        const pctPrazo = pct(noPrazo, entregues);
        const prevPct = pct(prev?.entregues_no_prazo ?? 0, prev?.entregues ?? 0);
        const late = lateByOrigem(origem);
        const saldo = (cur?.solicitadas ?? 0) - entregues;
        return (
          <div key={origem} className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{ORIGEM_LABEL[origem]}</h3>
              <Badge variant="secondary" className="text-xs">
                {data?.open?.[origem] ?? 0} em aberto
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <MiniKpi
                label="Solicitadas"
                value={cur?.solicitadas ?? 0}
                delta={prev ? (cur?.solicitadas ?? 0) - (prev.solicitadas ?? 0) : null}
                invertDelta
              />
              <MiniKpi
                label="Entregues"
                value={entregues}
                delta={prev ? entregues - (prev.entregues ?? 0) : null}
              />
              <MiniKpi
                label="% no prazo"
                value={pctPrazo === null ? "—" : `${pctPrazo}%`}
                hint={`${noPrazo} de ${entregues} no prazo interno`}
                delta={pctPrazo !== null && prevPct !== null ? pctPrazo - prevPct : null}
              />
              <MiniKpi
                label="Saldo da semana"
                value={saldo > 0 ? `+${saldo}` : saldo}
                hint="solicitadas − entregues"
                tone={saldo > 0 ? "danger" : "default"}
              />
              <MiniKpi
                label="Em atraso hoje"
                value={late.length}
                hint="prazo interno vencido"
                tone={late.length > 0 ? "danger" : "default"}
              />
            </div>
          </div>
        );
      })}

      <div className="h-72">
        <ResponsiveContainer>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tick={{ fontSize: 12 }}
              unit="%"
            />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              yAxisId="left"
              dataKey="sol_demands"
              stackId="sol"
              name="Solicitadas (clientes)"
              fill="hsl(var(--primary))"
            />
            <Bar
              yAxisId="left"
              dataKey="sol_plannings"
              stackId="sol"
              name="Solicitadas (planejamento)"
              fill="hsl(var(--accent))"
            />
            <Bar
              yAxisId="left"
              dataKey="entregues"
              name="Entregues"
              fill="hsl(var(--muted-foreground))"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="pct_prazo"
              name="% no prazo"
              stroke="hsl(var(--destructive))"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">
          Em atraso agora ({data?.late?.length ?? 0})
        </h3>
        {(data?.late?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma demanda com prazo interno vencido. 🎉
          </p>
        ) : (
          <div className="overflow-x-auto max-h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Base</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Tipos</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Prazo interno</TableHead>
                  <TableHead className="text-right">Atraso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.late || []).slice(0, 50).map((l) => (
                  <TableRow key={`${l.origem}-${l.id}`}>
                    <TableCell>
                      <Link
                        to={l.origem === "demands" ? "/demandas" : "/planejamento"}
                        className="text-primary hover:underline text-xs"
                      >
                        {ORIGEM_LABEL[l.origem]}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">{l.client_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(l.types || []).map((t) => TYPE_LABELS[t] || t).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-xs">{l.responsavel || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {new Date(l.internal_deadline).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="destructive">{l.dias_atraso}d</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Card>
  );
}

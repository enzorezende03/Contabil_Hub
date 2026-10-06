import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientPortfolio } from "@/hooks/use-client-portfolio";
import { useTeamMembers } from "@/hooks/use-team-members";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Briefcase, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

type Row = { client: string; assignee: string; status: string; internal_deadline: string; origem: string };

export default function PortfolioSection() {
  const { clients } = useClientPortfolio();
  const { members } = useTeamMembers({ excludeCoordenacao: true });
  const { members: all } = useTeamMembers();
  const [openOwner, setOpenOwner] = useState<string | null>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["portfolio-rows"],
    queryFn: async (): Promise<Row[]> => {
      const [d, p] = await Promise.all([
        supabase.from("demands").select("client, assignee, status, internal_deadline"),
        supabase.from("plannings").select("client, assignee, status, internal_deadline"),
      ]);
      return [
        ...(d.data || []).map((r: any) => ({ ...r, origem: "Solicitação" })),
        ...(p.data || []).map((r: any) => ({ ...r, origem: "Planejamento" })),
      ];
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const activeClients = clients.filter((c) => !c.data_fim_contrato || c.data_fim_contrato >= today);
  const semDono = activeClients.filter((c) => !c.carteira_responsavel_id).length;

  const stats = useMemo(() => {
    const ownerByName = new Map(activeClients.map((c) => [c.razao_social.trim().toLowerCase(), c.carteira_responsavel_id]));
    return members.map((m) => {
      const empresas = activeClients.filter((c) => c.carteira_responsavel_id === m.id);
      const mine = rows.filter((r) => ownerByName.get((r.client || "").trim().toLowerCase()) === m.id);
      const done = mine.filter((r) => r.status === "completed").length;
      const open = mine.length - done;
      const late = mine.filter((r) => r.status !== "completed" && r.internal_deadline < today).length;
      const outros = mine.filter((r) => r.assignee !== m.id).length;
      return { m, empresas, mine, done, open, late, outros, pct: mine.length ? Math.round((done / mine.length) * 100) : 0 };
    }).filter((s) => s.empresas.length > 0 || s.mine.length > 0);
  }, [members, activeClients, rows, today]);

  const sel = stats.find((s) => s.m.id === openOwner);
  const nm = (id: string) => all.find((x) => x.id === id)?.name || "—";

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2"><Briefcase className="w-4 h-4" />Carteiras</h2>
        {semDono > 0 && (
          <Link to="/minhas-empresas" className="text-xs flex items-center gap-1 text-warning hover:underline">
            <AlertTriangle className="w-3.5 h-3.5" />{semDono} empresa(s) sem responsável
          </Link>
        )}
      </div>
      {stats.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma carteira atribuída ainda. Defina responsáveis em Clientes ou Minhas empresas.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {stats.map((s) => (
            <button key={s.m.id} onClick={() => setOpenOwner(s.m.id)} className="text-left rounded-lg border p-3 hover:bg-muted/40 transition">
              <div className="font-medium text-sm">{s.m.name}</div>
              <div className="text-xs text-muted-foreground mb-2">{s.empresas.length} empresa(s)</div>
              <div className="h-1.5 rounded bg-muted overflow-hidden mb-2"><div className="h-full bg-primary" style={{ width: `${s.pct}%` }} /></div>
              <div className="grid grid-cols-2 gap-x-2 text-[11px]">
                <span>{s.pct}% concluído</span>
                <span>{s.open} em aberto</span>
                <span className={s.late ? "text-destructive font-medium" : ""}>{s.late} atrasada(s)</span>
                <span className="text-muted-foreground">{s.outros} por outra pessoa</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!sel} onOpenChange={(o) => !o && setOpenOwner(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Carteira de {sel?.m.name}</DialogTitle></DialogHeader>
          {sel && (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-1.5">Empresa</th><th>Origem</th><th>Situação</th><th>Prazo</th><th>Executor</th>
              </tr></thead>
              <tbody>
                {sel.mine.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-muted-foreground">Sem demandas registradas.</td></tr>}
                {sel.mine.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1.5 pr-2">{r.client}</td>
                    <td>{r.origem}</td>
                    <td>{r.status === "completed" ? "Concluída" : r.internal_deadline < today ? "Atrasada" : "Em aberto"}</td>
                    <td>{r.internal_deadline ? new Date(r.internal_deadline + "T00:00").toLocaleDateString("pt-BR") : "—"}</td>
                    <td className={r.assignee !== sel.m.id ? "text-warning font-medium" : ""}>{nm(r.assignee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

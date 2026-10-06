import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useClientPortfolio } from "@/hooks/use-client-portfolio";
import { useTeamMembers } from "@/hooks/use-team-members";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ClientNotes } from "@/components/ClientNotes";
import { toast } from "sonner";
import { Briefcase, Search, ChevronRight } from "lucide-react";

const TRIB: Record<string, string> = { simples_nacional: "Simples Nacional", lucro_presumido: "Lucro Presumido", lucro_real: "Lucro Real", isenta_imune: "Isenta/Imune" };
const UNI: Record<string, string> = { "2m_contabilidade": "2M Contabilidade", "2m_saude": "2M Saúde" };

export default function MinhasEmpresas() {
  const { user, profile, isAdmin } = useAuth();
  const canManage = isAdmin || profile?.role === "coordenacao";
  const { clients, refetch } = useClientPortfolio();
  const { members: operational } = useTeamMembers({ excludeCoordenacao: true });
  const [owner, setOwner] = useState<string>(canManage ? "all" : "");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const viewOwner = canManage ? owner : user?.id || "";

  const { data: openDemands = {} } = useQuery({
    queryKey: ["portfolio-open-demands"],
    queryFn: async () => {
      const [d, p] = await Promise.all([
        supabase.from("demands").select("client, status"),
        supabase.from("plannings").select("client, status"),
      ]);
      const map: Record<string, number> = {};
      [...(d.data || []), ...(p.data || [])].forEach((r: any) => {
        if (r.status === "completed") return;
        const k = (r.client || "").trim().toLowerCase();
        map[k] = (map[k] || 0) + 1;
      });
      return map;
    },
  });

  const list = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return clients
      .filter((c) => !c.data_fim_contrato || c.data_fim_contrato >= today)
      .filter((c) => viewOwner === "all" ? true : viewOwner === "none" ? !c.carteira_responsavel_id : c.carteira_responsavel_id === viewOwner)
      .filter((c) => !search.trim() || c.razao_social.toLowerCase().includes(search.trim().toLowerCase()));
  }, [clients, viewOwner, search]);

  const name = (id: string | null) => operational.find((m) => m.id === id)?.name || "Sem responsável";
  const open = clients.find((c) => c.id === openId);

  const reassign = async (clientId: string, newOwner: string) => {
    const { error } = await supabase.from("clients").update({ carteira_responsavel_id: newOwner || null } as any).eq("id", clientId);
    if (error) return toast.error("Erro ao alterar carteira: " + error.message);
    toast.success("Carteira atualizada."); refetch();
  };

  const sel = "h-9 px-3 text-sm border rounded-md bg-card";

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Briefcase className="w-5 h-5" />{canManage ? "Carteiras de empresas" : "Minhas empresas"}</h1>
            <p className="text-sm text-muted-foreground">{list.length} empresa(s){canManage && viewOwner !== "all" ? ` · ${viewOwner === "none" ? "sem responsável" : name(viewOwner)}` : ""}</p>
          </div>
          <div className="flex gap-2 items-center">
            {canManage && (
              <select className={sel} value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="all">Todas as carteiras</option>
                <option value="none">Sem responsável</option>
                {operational.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
            <div className="relative w-60">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar empresa..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        <Card className="divide-y">
          {list.length === 0 && <p className="p-6 text-sm text-center text-muted-foreground">Nenhuma empresa nesta carteira.</p>}
          {list.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer" onClick={() => setOpenId(c.id)}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.razao_social}</div>
                <div className="text-[11px] text-muted-foreground">{TRIB[c.tributacao] || c.tributacao} · {UNI[c.unidade] || c.unidade}</div>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded bg-muted">{openDemands[c.razao_social.trim().toLowerCase()] || 0} em aberto</span>
              {canManage && (
                <select className="h-8 px-2 text-xs border rounded-md bg-card w-44" value={c.carteira_responsavel_id || ""}
                  onClick={(e) => e.stopPropagation()} onChange={(e) => reassign(c.id, e.target.value)}>
                  <option value="">Sem responsável</option>
                  {operational.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          ))}
        </Card>
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {open && (
            <>
              <SheetHeader><SheetTitle>{open.razao_social}</SheetTitle></SheetHeader>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Carteira: {name(open.carteira_responsavel_id)}</p>
              <h3 className="text-sm font-semibold mb-2">Notas do fechamento</h3>
              <ClientNotes clientId={open.id} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ActionPermissions = {
  edit_dates: string[];
  liberar_para_revisao: string[];
  revisar_demonstrativos: string[];
  cancelar_submissao: string[];
  supervisionar_revisao: string[];
  gerenciar_pendencias: string[];
  supervisionar_pendencias: string[];
  configurar_integracoes: string[];
  ver_todas_demandas: string[];
  ver_toda_equipe: string[];
  ver_propria_produtividade: string[];
  ver_produtividade_equipe: string[];
  configurar_produtividade: string[];
  gerenciar_ausencias_equipe: string[];
  ver_carga_equipe: string[];
  ver_painel_gerencial?: string[];
  revisar_briefing_semanal?: string[];
  configurar_metas?: string[];
  editar_fim_contrato?: string[];
};

const DEFAULTS: ActionPermissions = {
  edit_dates: ["coordenacao"],
  liberar_para_revisao: ["coordenacao", "analista", "assistente"],
  revisar_demonstrativos: ["coordenacao"],
  cancelar_submissao: ["coordenacao"],
  supervisionar_revisao: ["coordenacao"],
  gerenciar_pendencias: ["coordenacao", "analista", "assistente"],
  supervisionar_pendencias: ["coordenacao"],
  configurar_integracoes: ["coordenacao"],
  ver_todas_demandas: ["coordenacao", "analista"],
  ver_toda_equipe: ["coordenacao", "analista"],
  ver_propria_produtividade: ["coordenacao", "analista", "assistente", "estagiario"],
  ver_produtividade_equipe: ["coordenacao"],
  configurar_produtividade: ["coordenacao"],
  gerenciar_ausencias_equipe: ["coordenacao"],
  ver_carga_equipe: ["coordenacao"],
  ver_painel_gerencial: ["coordenacao"],
  revisar_briefing_semanal: ["coordenacao"],
  configurar_metas: ["coordenacao"],
  editar_fim_contrato: ["coordenacao"],
};

let cachedPerms: ActionPermissions = { ...DEFAULTS };

export function getActionPermissions(): ActionPermissions {
  return cachedPerms;
}

export function setActionPermissions(perms: Partial<ActionPermissions> | Record<string, string[]>) {
  cachedPerms = { ...cachedPerms, ...(perms as Partial<ActionPermissions>) };
}

export function canPerformAction(action: keyof ActionPermissions, role: string | undefined): boolean {
  if (!role) return false;
  return cachedPerms[action]?.includes(role) ?? false;
}

export function useActionPermissions() {
  const [perms, setPerms] = useState<ActionPermissions>(cachedPerms);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "action_permissions")
        .maybeSingle();
      if (data?.value) {
        const val = { ...DEFAULTS, ...(data.value as unknown as ActionPermissions) };
        setActionPermissions(val);
        setPerms(val);
      }
    };
    load();
  }, []);

  return perms;
}

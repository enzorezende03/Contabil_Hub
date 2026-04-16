import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ActionPermissions = {
  edit_dates: string[]; // roles allowed to edit dates
};

const DEFAULTS: ActionPermissions = {
  edit_dates: ["coordenacao"],
};

let cachedPerms: ActionPermissions = { ...DEFAULTS };

export function getActionPermissions(): ActionPermissions {
  return cachedPerms;
}

export function setActionPermissions(perms: Partial<ActionPermissions>) {
  cachedPerms = { ...cachedPerms, ...perms };
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
        const val = data.value as unknown as ActionPermissions;
        setActionPermissions(val);
        setPerms(val);
      }
    };
    load();
  }, []);

  return perms;
}

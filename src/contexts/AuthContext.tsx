import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setRolePermissions, setCustomRoles } from "@/lib/permissions";
import { setActionPermissions } from "@/hooks/use-action-permissions";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: { display_name: string; role: string } | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ display_name: string; role: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => {
          fetchProfile(session.user.id);
          fetchRole(session.user.id);
        }, 0);
      } else {
        setProfile(null);
        setIsAdmin(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await Promise.all([
          fetchProfile(session.user.id),
          fetchRole(session.user.id),
          loadPermissions(),
        ]);
      }
      setLoading(false);
    });


    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, role")
      .eq("user_id", userId)
      .single();
    if (data) setProfile(data);
  };

  const fetchRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    setIsAdmin(!!data);
  };

  const loadPermissions = async () => {
    const { data } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["role_permissions", "action_permissions", "custom_roles"]);
    if (data) {
      const roleRow = data.find((r) => r.key === "role_permissions");
      const actionRow = data.find((r) => r.key === "action_permissions");
      const customRow = data.find((r) => r.key === "custom_roles");
      if (roleRow?.value) setRolePermissions(roleRow.value as Record<string, string[]>);
      if (actionRow?.value) setActionPermissions(actionRow.value as Record<string, string[]>);
      if (customRow?.value) setCustomRoles(customRow.value as { value: string; label: string }[]);
    }
  };

  const signOut = async () => {
    sessionStorage.removeItem("competencias_year_confirmed");
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, isAdmin, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

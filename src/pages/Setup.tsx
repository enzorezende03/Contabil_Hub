import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function SetupPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.functions.invoke("bootstrap-admin", {
      body: { email: "ana.braga@2mgrupo.com.br", password },
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Erro ao criar administrador");
    } else {
      toast.success("Conta de administrador criada! Faça login.");
      navigate("/login");
    }
    setLoading(false);
  };

  const inputClass = "w-full h-10 px-3 text-sm border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Configuração Inicial</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Criar conta de administrador para<br />
            <strong>ana.braga@2mgrupo.com.br</strong>
          </p>
        </div>

        <form onSubmit={handleSetup} className="space-y-4 rounded-lg border bg-card p-6">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Defina sua senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              required
              minLength={6}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Criando..." : "Criar conta de administrador"}
          </button>
        </form>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import logo2m from "@/assets/logo-2m-grupo.png";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { session } = useAuth();

  useEffect(() => {
    if (session) navigate("/competencias");
  }, [session, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("Email ou senha incorretos");
    } else {
      navigate("/competencias");
    }
    setLoading(false);
  };

  const inputClass = "w-full h-10 px-3 text-sm border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center flex flex-col items-center gap-3">
          <img src={logo2m} alt="Contábil Hub" className="w-64 h-32 object-contain brightness-0 opacity-80" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Contábil Hub</h1>
            <p className="text-sm text-muted-foreground mt-1">Acesse sua conta</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-card p-6">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Aguarde..." : "Entrar"}
          </button>
        </form>

        <p className="text-center text-[11px] text-muted-foreground">
          Acesso exclusivo para colaboradores. Solicite uma conta ao administrador.
        </p>
      </div>
    </div>
  );
}


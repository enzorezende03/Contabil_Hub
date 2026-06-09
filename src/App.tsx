import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { canAccessPage, type AppPage } from "@/lib/permissions";
import Index from "./pages/Index.tsx";
import Demands from "./pages/Demands.tsx";
import Team from "./pages/Team.tsx";

import Competencias from "./pages/Competencias.tsx";
import Revisao from "./pages/Revisao.tsx";
import Alerts from "./pages/Alerts.tsx";

import SettingsPage from "./pages/SettingsPage.tsx";
import Users from "./pages/Users.tsx";
import Login from "./pages/Login.tsx";

import Clients from "./pages/Clients.tsx";
import Planejamento from "./pages/Planejamento.tsx";
import Pendencias from "./pages/Pendencias.tsx";
import Ausencias from "./pages/Ausencias.tsx";
import ControleGerencial from "./pages/ControleGerencial.tsx";
import BriefingReview from "./pages/BriefingReview.tsx";
import BriefingHistory from "./pages/BriefingHistory.tsx";
import MetasPage from "./pages/MetasPage.tsx";
import NotFound from "./pages/NotFound.tsx";
import PendencyPortal from "./pages/PendencyPortal.tsx";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RoleRoute({ children, page }: { children: React.ReactNode; page: AppPage }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  if (!canAccessPage(profile?.role, page)) return <Navigate to="/" replace />;
  return <>{children}</>;
}


const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    
    <Route path="/p/:token" element={<PendencyPortal />} />
    <Route path="/" element={<ProtectedRoute><Navigate to="/competencias" replace /></ProtectedRoute>} />
    <Route path="/demandas" element={<RoleRoute page="/demandas"><Demands /></RoleRoute>} />
    <Route path="/planejamento" element={<RoleRoute page="/planejamento"><Planejamento /></RoleRoute>} />
    <Route path="/equipe" element={<RoleRoute page="/equipe"><Team /></RoleRoute>} />
    <Route path="/competencias" element={<RoleRoute page="/competencias"><Competencias /></RoleRoute>} />
    <Route path="/revisao" element={<RoleRoute page="/revisao"><Revisao /></RoleRoute>} />
    <Route path="/pendencias" element={<RoleRoute page="/pendencias"><Pendencias /></RoleRoute>} />
    <Route path="/alertas" element={<RoleRoute page="/alertas"><Alerts /></RoleRoute>} />
    <Route path="/ausencias" element={<RoleRoute page="/ausencias"><Ausencias /></RoleRoute>} />
    <Route path="/configuracoes" element={<RoleRoute page="/configuracoes"><SettingsPage /></RoleRoute>} />
    <Route path="/configuracoes/metas" element={<RoleRoute page="/configuracoes"><MetasPage /></RoleRoute>} />
    <Route path="/usuarios" element={<RoleRoute page="/usuarios"><Users /></RoleRoute>} />
    <Route path="/clientes" element={<RoleRoute page="/clientes"><Clients /></RoleRoute>} />
    <Route path="/controle-gerencial" element={<RoleRoute page="/controle-gerencial"><ControleGerencial /></RoleRoute>} />
    <Route path="/controle-gerencial/briefing/:isoWeek" element={<RoleRoute page="/controle-gerencial"><BriefingReview /></RoleRoute>} />
    <Route path="/controle-gerencial/briefings" element={<RoleRoute page="/controle-gerencial"><BriefingHistory /></RoleRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

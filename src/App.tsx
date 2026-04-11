import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Index from "./pages/Index.tsx";
import Demands from "./pages/Demands.tsx";
import Team from "./pages/Team.tsx";

import Competencias from "./pages/Competencias.tsx";
import Alerts from "./pages/Alerts.tsx";

import SettingsPage from "./pages/SettingsPage.tsx";
import Users from "./pages/Users.tsx";
import Login from "./pages/Login.tsx";
import Setup from "./pages/Setup.tsx";
import Clients from "./pages/Clients.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/setup" element={<Setup />} />
    <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
    <Route path="/demandas" element={<ProtectedRoute><Demands /></ProtectedRoute>} />
    <Route path="/equipe" element={<ProtectedRoute><Team /></ProtectedRoute>} />
    
    <Route path="/competencias" element={<ProtectedRoute><Competencias /></ProtectedRoute>} />
    <Route path="/alertas" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
    
      <Route path="/configuracoes" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/usuarios" element={<ProtectedRoute><Users /></ProtectedRoute>} />
      <Route path="/clientes" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
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

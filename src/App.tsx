import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Demands from "./pages/Demands.tsx";
import Team from "./pages/Team.tsx";
import Legacy from "./pages/Legacy.tsx";
import Competencias from "./pages/Competencias.tsx";
import Alerts from "./pages/Alerts.tsx";
import Reports from "./pages/Reports.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/demandas" element={<Demands />} />
          <Route path="/equipe" element={<Team />} />
          <Route path="/antigas" element={<Legacy />} />
          <Route path="/competencias" element={<Competencias />} />
          <Route path="/alertas" element={<Alerts />} />
          <Route path="/relatorios" element={<Reports />} />
          <Route path="/configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";

// Electron loads the app via file:// where BrowserRouter can't match "/" → 404.
// Use HashRouter in that case; keep BrowserRouter for the web build.
const isFileProtocol = typeof window !== "undefined" && window.location.protocol === "file:";
const Router = isFileProtocol ? HashRouter : BrowserRouter;
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { CommandPaletteProvider } from "@/components/CommandPalette";
import Index from "./pages/Index.tsx";
import AuthPage from "./pages/Auth.tsx";
import NotFound from "./pages/NotFound.tsx";
import Schedules from "./pages/Schedules.tsx";
import Activity from "./pages/Activity.tsx";

import Memories from "./pages/Memories.tsx";
import Landing from "./pages/Landing.tsx";
import { useAuth } from "@/hooks/useAuth";

/** Route "/" — Landing for guests, chat (Index) for signed-in users. */
function Root() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Index /> : <Landing />;
}
import { OnboardingTour } from "./components/chat/OnboardingTour";
import { OculoIntro } from "./components/OculoIntro";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Router>
          <AuthProvider>
            <CommandPaletteProvider>
              <Routes>
                <Route path="/" element={<Root />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/schedules" element={<Schedules />} />
                <Route path="/activity" element={<Activity />} />
                
                <Route path="/memories" element={<Memories />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </CommandPaletteProvider>
            <OnboardingTour />
            <OculoIntro />
          </AuthProvider>
        </Router>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

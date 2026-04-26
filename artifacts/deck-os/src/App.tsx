import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import { VisualModeProvider } from "@/contexts/VisualMode";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import { Onboarding, isInitialized, applyColor, getStoredColor } from "@/components/Onboarding";
import { StartScreen } from "@/components/StartScreen";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/Dashboard";
import AiControl from "@/pages/AiControl";
import AiPersonality from "@/pages/AiPersonality";
import PluginManager from "@/pages/PluginManager";
import PluginStore from "@/pages/PluginStore";
import MemorySystem from "@/pages/MemorySystem";
import DeviceControl from "@/pages/DeviceControl";
import CommandConsole from "@/pages/CommandConsole";
import MapView from "@/pages/MapView";
import RoutinesPage from "@/pages/RoutinesPage";
import BriefingsPage from "@/pages/BriefingsPage";
import SettingsPage from "@/pages/Settings";

applyColor(getStoredColor());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/ai" component={AiControl} />
        <Route path="/ai/personality" component={AiPersonality} />
        <Route path="/plugins" component={PluginManager} />
        <Route path="/plugins/store" component={PluginStore} />
        <Route path="/memory" component={MemorySystem} />
        <Route path="/devices" component={DeviceControl} />
        <Route path="/commands" component={CommandConsole} />
        <Route path="/map" component={MapView} />
        <Route path="/routines" component={RoutinesPage} />
        <Route path="/briefings" component={BriefingsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  const [started, setStarted] = useState(() => sessionStorage.getItem("deckos_session") === "1");
  const [initialized, setInitialized] = useState(() => isInitialized());

  function handleStart() {
    sessionStorage.setItem("deckos_session", "1");
    setStarted(true);
  }

  return (
    <VisualModeProvider>
      <WebSocketProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            {!started ? (
              <StartScreen onStart={handleStart} />
            ) : !initialized ? (
              <Onboarding onComplete={() => setInitialized(true)} />
            ) : (
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
            )}
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </WebSocketProvider>
    </VisualModeProvider>
  );
}

export default App;

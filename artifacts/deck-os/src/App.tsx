import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import { VisualModeProvider } from "@/contexts/VisualMode";
import { Onboarding, isInitialized, applyColor, getStoredColor } from "@/components/Onboarding";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/Dashboard";
import AiControl from "@/pages/AiControl";
import PluginManager from "@/pages/PluginManager";
import MemorySystem from "@/pages/MemorySystem";
import DeviceControl from "@/pages/DeviceControl";
import CommandConsole from "@/pages/CommandConsole";
import CognitiveModel from "@/pages/CognitiveModel";
import GoalManager from "@/pages/GoalManager";
import FeedbackLoop from "@/pages/FeedbackLoop";
import AutonomousLayer from "@/pages/AutonomousLayer";
import CognitivePulse from "@/pages/CognitivePulse";

// Apply stored color immediately before any render
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
        <Route path="/plugins" component={PluginManager} />
        <Route path="/memory" component={MemorySystem} />
        <Route path="/cognitive" component={CognitiveModel} />
        <Route path="/goals" component={GoalManager} />
        <Route path="/feedback" component={FeedbackLoop} />
        <Route path="/autonomous" component={AutonomousLayer} />
        <Route path="/devices" component={DeviceControl} />
        <Route path="/commands" component={CommandConsole} />
        <Route path="/pulse" component={CognitivePulse} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  const [initialized, setInitialized] = useState(() => isInitialized());

  return (
    <VisualModeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {!initialized ? (
            <Onboarding onComplete={() => setInitialized(true)} />
          ) : (
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          )}
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </VisualModeProvider>
  );
}

export default App;

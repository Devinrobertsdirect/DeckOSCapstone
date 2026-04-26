import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/Dashboard";
import AiControl from "@/pages/AiControl";
import PluginManager from "@/pages/PluginManager";
import MemorySystem from "@/pages/MemorySystem";
import DeviceControl from "@/pages/DeviceControl";
import CommandConsole from "@/pages/CommandConsole";
import CognitiveModel from "@/pages/CognitiveModel";

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
        <Route path="/devices" component={DeviceControl} />
        <Route path="/commands" component={CommandConsole} />
        <Route path="/cognitive" component={CognitiveModel} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

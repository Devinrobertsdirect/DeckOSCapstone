import { createContext, useContext, useState, useEffect } from "react";

export type VisualMode = "minimal" | "standard" | "cinematic";

type VisualModeCtx = { mode: VisualMode; setMode: (m: VisualMode) => void };

const VisualModeContext = createContext<VisualModeCtx>({
  mode: "standard",
  setMode: () => {},
});

export function VisualModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<VisualMode>(() => {
    try {
      return (localStorage.getItem("deckos_visual_mode") as VisualMode) ?? "standard";
    } catch {
      return "standard";
    }
  });

  const setMode = (m: VisualMode) => {
    setModeState(m);
    try { localStorage.setItem("deckos_visual_mode", m); } catch {}
    document.documentElement.setAttribute("data-visual-mode", m);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-visual-mode", mode);
  }, []);

  return (
    <VisualModeContext.Provider value={{ mode, setMode }}>
      {children}
    </VisualModeContext.Provider>
  );
}

export function useVisualMode() {
  return useContext(VisualModeContext);
}

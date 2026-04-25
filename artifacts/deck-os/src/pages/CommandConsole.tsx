import { useState, useRef, useEffect } from "react";
import {
  useGetCommandHistory, getGetCommandHistoryQueryKey,
  useListCommands, getListCommandsQueryKey,
  useDispatchCommand,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TerminalSquare, CheckCircle2, XCircle, Brain, Zap, Loader2, ChevronRight } from "lucide-react";

export default function CommandConsole() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [liveOutput, setLiveOutput] = useState<Array<{ input: string; output: string; success: boolean; ms: number; plugin: string | null; aiAssisted: boolean }>>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: cmdHistory } = useGetCommandHistory({ limit: 50 }, { query: { queryKey: getGetCommandHistoryQueryKey({ limit: 50 }), refetchInterval: 5000 } });
  const { data: commands } = useListCommands({ query: { queryKey: getListCommandsQueryKey() } });
  const dispatch = useDispatchCommand();

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [liveOutput]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const cmd = input;
    setHistory((prev) => [cmd, ...prev].slice(0, 50));
    setHistoryIdx(-1);
    setInput("");
    dispatch.mutate({ data: { input: cmd, mode: "auto" } }, {
      onSuccess: (res) => {
        setLiveOutput((prev) => [...prev, {
          input: cmd,
          output: res.output,
          success: res.success,
          ms: res.executionTimeMs,
          plugin: res.plugin ?? null,
          aiAssisted: res.aiAssisted,
        }].slice(-100));
        qc.invalidateQueries({ queryKey: getGetCommandHistoryQueryKey({ limit: 50 }) });
      },
      onError: () => {
        setLiveOutput((prev) => [...prev, { input: cmd, output: "ERROR: Command dispatch failed", success: false, ms: 0, plugin: null, aiAssisted: false }]);
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(idx);
      setInput(history[idx] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(idx);
      setInput(idx === -1 ? "" : (history[idx] ?? ""));
    }
  };

  const pastCommands = cmdHistory?.history ?? [];

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center gap-2 font-mono text-xs text-primary/60 uppercase tracking-widest">
        <TerminalSquare className="w-4 h-4 text-primary" />
        <span>COMMAND.CONSOLE // SKILL ROUTER // DECK OS TERMINAL</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        {/* Main terminal */}
        <div className="col-span-3 flex flex-col gap-4 min-h-0">
          <Card className="flex-1 bg-card/40 border-primary/20 rounded-none flex flex-col min-h-0">
            <CardHeader className="border-b border-primary/20 p-3 flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#22ff44] animate-pulse" />
                <CardTitle className="font-mono text-xs text-primary">DECK OS TERMINAL v9.4.2</CardTitle>
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {liveOutput.length + pastCommands.length} COMMANDS TOTAL
              </div>
            </CardHeader>
            <div ref={outputRef} className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-3 min-h-0">
              <div className="text-primary/40">
                DECK OS initialized. Type &quot;help&quot; to list available commands. Use UP/DOWN to navigate history.
              </div>
              <div className="text-primary/40">---</div>

              {liveOutput.map((entry, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[#ffaa00]">&gt;</span>
                    <span className="text-primary">{entry.input}</span>
                  </div>
                  <div className={`pl-4 whitespace-pre-wrap ${entry.success ? "text-primary/80" : "text-[#ff3333]"}`}>
                    {entry.output}
                  </div>
                  <div className="pl-4 flex items-center gap-3 text-primary/30">
                    {entry.success ? <CheckCircle2 className="w-3 h-3 text-[#22ff44]" /> : <XCircle className="w-3 h-3 text-[#ff3333]" />}
                    <span>{entry.ms}ms</span>
                    {entry.plugin && <span>PLUGIN: {entry.plugin}</span>}
                    {entry.aiAssisted && (
                      <span className="flex items-center gap-1 text-[#cc44ff]"><Brain className="w-3 h-3" /> AI-ASSISTED</span>
                    )}
                    {!entry.aiAssisted && (
                      <span className="flex items-center gap-1 text-[#22ff44]"><Zap className="w-3 h-3" /> DIRECT</span>
                    )}
                  </div>
                </div>
              ))}

              {dispatch.isPending && (
                <div className="flex items-center gap-2 text-primary/60">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-[#ffaa00]">Processing command...</span>
                </div>
              )}
            </div>
            <form onSubmit={handleSubmit} className="border-t border-primary/30 p-4 flex items-center gap-2 bg-background/50">
              <span className="text-[#ffaa00] font-mono text-sm font-bold">&gt;_</span>
              <Input
                data-testid="terminal-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="font-mono border-none bg-transparent focus-visible:ring-0 text-primary px-0 flex-1"
                placeholder="Enter command..."
                autoFocus
              />
              <button
                type="submit"
                data-testid="terminal-submit"
                disabled={dispatch.isPending}
                className="border border-primary/40 px-4 py-1.5 font-mono text-xs text-primary hover:bg-primary/10 transition-all disabled:opacity-50 flex items-center gap-1"
              >
                {dispatch.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
                EXEC
              </button>
            </form>
          </Card>
        </div>

        {/* Side panel: command reference + history */}
        <div className="flex flex-col gap-4 min-h-0">
          <Card className="bg-card/40 border-primary/20 rounded-none">
            <CardHeader className="border-b border-primary/20 p-3">
              <CardTitle className="font-mono text-xs text-primary">CMD.REFERENCE</CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1">
              {(commands?.commands ?? []).map((cmd) => (
                <button
                  key={cmd.id}
                  data-testid={`cmd-ref-${cmd.id}`}
                  onClick={() => setInput(cmd.syntax)}
                  className="w-full text-left font-mono text-xs p-1.5 hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all"
                >
                  <div className="text-primary/80">{cmd.name}</div>
                  <div className="text-primary/40">{cmd.description}</div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card/40 border-primary/20 rounded-none flex-1 min-h-0 flex flex-col">
            <CardHeader className="border-b border-primary/20 p-3">
              <CardTitle className="font-mono text-xs text-primary">CMD.HISTORY</CardTitle>
            </CardHeader>
            <div className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0">
              {pastCommands.map((h) => (
                <button
                  key={h.id}
                  data-testid={`history-${h.id}`}
                  onClick={() => setInput(h.input)}
                  className="w-full text-left font-mono text-xs p-1.5 hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all"
                >
                  <div className="flex items-center gap-2">
                    {h.success ? <CheckCircle2 className="w-3 h-3 text-[#22ff44] flex-shrink-0" /> : <XCircle className="w-3 h-3 text-[#ff3333] flex-shrink-0" />}
                    <span className="text-primary/80 truncate">{h.input}</span>
                  </div>
                  <div className="text-primary/30 pl-5">{h.executionTimeMs}ms // {new Date(h.timestamp).toLocaleTimeString()}</div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

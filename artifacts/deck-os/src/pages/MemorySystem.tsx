import { useState } from "react";
import {
  useGetShortTermMemory, getGetShortTermMemoryQueryKey,
  useGetLongTermMemory, getGetLongTermMemoryQueryKey,
  useStoreShortTermMemory,
  useStoreLongTermMemory,
  useDeleteMemoryEntry,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { HardDrive, Search, Plus, Trash2, Clock, Database, Loader2 } from "lucide-react";

export default function MemorySystem() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"short" | "long">("short");
  const [newContent, setNewContent] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const qc = useQueryClient();

  const { data: shortMem } = useGetShortTermMemory({ query: { queryKey: getGetShortTermMemoryQueryKey(), refetchInterval: 10000 } });
  const { data: longMem } = useGetLongTermMemory(
    { query: searchQuery, limit: 50 },
    { query: { queryKey: getGetLongTermMemoryQueryKey({ query: searchQuery }), refetchInterval: 10000 } }
  );

  const storeShort = useStoreShortTermMemory();
  const storeLong = useStoreLongTermMemory();
  const deleteEntry = useDeleteMemoryEntry();

  const handleStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    const keywords = newKeywords.split(",").map((k) => k.trim()).filter(Boolean);
    const payload = { content: newContent, keywords, source: "user_input" };
    if (activeTab === "short") {
      storeShort.mutate({ data: { ...payload, ttlSeconds: 3600 } }, {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetShortTermMemoryQueryKey() });
          setNewContent(""); setNewKeywords("");
        },
      });
    } else {
      storeLong.mutate({ data: payload }, {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetLongTermMemoryQueryKey({ query: searchQuery }) });
          setNewContent(""); setNewKeywords("");
        },
      });
    }
  };

  const handleDelete = (id: string) => {
    deleteEntry.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetLongTermMemoryQueryKey({ query: searchQuery }) });
      },
    });
  };

  const entries = activeTab === "short" ? shortMem?.entries ?? [] : longMem?.entries ?? [];
  const filteredEntries = searchQuery && activeTab === "short"
    ? entries.filter((e) => e.content.toLowerCase().includes(searchQuery.toLowerCase()) || e.keywords.some((k) => k.toLowerCase().includes(searchQuery.toLowerCase())))
    : entries;

  function timeRemaining(expiresAt: string | null): string {
    if (!expiresAt) return "PERMANENT";
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return "EXPIRED";
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center gap-2 font-mono text-xs text-primary/60 uppercase tracking-widest">
        <HardDrive className="w-4 h-4 text-primary" />
        <span>MEMORY.BANK // SESSION + PERSISTENT STORAGE</span>
      </div>

      <div className="flex gap-4 items-center">
        <div className="flex border border-primary/20">
          <button
            data-testid="tab-short"
            onClick={() => setActiveTab("short")}
            className={`font-mono text-xs px-4 py-2 flex items-center gap-2 transition-all
              ${activeTab === "short" ? "bg-primary/10 text-primary border-r border-primary/20" : "text-primary/50 border-r border-primary/20 hover:text-primary/80"}`}
          >
            <Clock className="w-3 h-3" /> SHORT-TERM
          </button>
          <button
            data-testid="tab-long"
            onClick={() => setActiveTab("long")}
            className={`font-mono text-xs px-4 py-2 flex items-center gap-2 transition-all
              ${activeTab === "long" ? "bg-primary/10 text-primary" : "text-primary/50 hover:text-primary/80"}`}
          >
            <Database className="w-3 h-3" /> LONG-TERM
          </button>
        </div>
        <div className="flex-1 flex items-center border border-primary/20 bg-card/40 px-3">
          <Search className="w-3 h-3 text-primary/40 mr-2" />
          <Input
            data-testid="memory-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-none bg-transparent focus-visible:ring-0 font-mono text-sm text-primary px-0 h-8"
            placeholder="Search keywords or content..."
          />
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {filteredEntries.length} ENTRIES
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="col-span-2 overflow-y-auto space-y-2">
          {filteredEntries.length === 0 && (
            <div className="font-mono text-xs text-primary/40 p-4 border border-primary/10 text-center">
              // NO MEMORY ENTRIES IN {activeTab === "short" ? "SESSION" : "PERSISTENT"} STORE
            </div>
          )}
          {filteredEntries.map((entry) => (
            <div key={entry.id} data-testid={`memory-entry-${entry.id}`} className="border border-primary/20 bg-card/40 p-4 font-mono text-xs group">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  {entry.type === "short_term" ? <Clock className="w-3 h-3 text-[#ffaa00]" /> : <Database className="w-3 h-3 text-[#00d4ff]" />}
                  <span className="text-primary/40">SRC: {entry.source}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`${entry.type === "short_term" ? "text-[#ffaa00]" : "text-[#00d4ff]"}`}>
                    {entry.type === "short_term" ? `TTL: ${timeRemaining(entry.expiresAt ?? null)}` : "PERSISTENT"}
                  </span>
                  {entry.type === "long_term" && (
                    <button
                      data-testid={`delete-memory-${entry.id}`}
                      onClick={() => handleDelete(entry.id)}
                      className="opacity-0 group-hover:opacity-100 text-[#ff3333]/60 hover:text-[#ff3333] transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="text-primary/90 mb-2">{entry.content}</div>
              <div className="flex flex-wrap gap-1">
                {entry.keywords.map((kw) => (
                  <span key={kw} className="border border-primary/20 px-1.5 py-0.5 text-primary/50">{kw}</span>
                ))}
              </div>
              <div className="text-primary/30 mt-2">{new Date(entry.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>

        <Card className="bg-card/40 border-primary/20 rounded-none flex flex-col">
          <CardHeader className="border-b border-primary/20 p-4">
            <CardTitle className="font-mono text-sm text-primary">STORE.NEW.ENTRY</CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex flex-col gap-4">
            <form onSubmit={handleStore} className="flex flex-col gap-3">
              <div>
                <label className="font-mono text-xs text-primary/40 block mb-1">CONTENT</label>
                <textarea
                  data-testid="memory-content"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full bg-background/50 border border-primary/20 font-mono text-xs text-primary p-2 resize-none focus:outline-none focus:border-primary h-24"
                  placeholder="Memory content..."
                />
              </div>
              <div>
                <label className="font-mono text-xs text-primary/40 block mb-1">KEYWORDS (comma-separated)</label>
                <Input
                  data-testid="memory-keywords"
                  value={newKeywords}
                  onChange={(e) => setNewKeywords(e.target.value)}
                  className="border-primary/20 bg-background/50 font-mono text-xs text-primary"
                  placeholder="network, error, system..."
                />
              </div>
              <div className="font-mono text-xs text-primary/40 border border-primary/10 p-2 bg-background/30">
                TYPE: {activeTab === "short" ? "SESSION (1h TTL)" : "PERSISTENT"}
              </div>
              <button
                type="submit"
                data-testid="memory-store"
                disabled={storeShort.isPending || storeLong.isPending || !newContent.trim()}
                className="border border-primary/40 p-2 font-mono text-xs text-primary hover:bg-primary/10 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {(storeShort.isPending || storeLong.isPending) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                STORE IN {activeTab === "short" ? "SESSION" : "PERSISTENT"}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

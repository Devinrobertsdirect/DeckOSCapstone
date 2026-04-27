import { Router } from "express";
import { logger } from "../lib/logger.js";
import { getConfig } from "../lib/app-config.js";
import { bus } from "../lib/bus.js";

const router = Router();

const OPENCLAW_PORT = 18789;
const CLAWHUB_API   = "https://clawhub.ai/api/v1";

// ── Connectivity helpers ───────────────────────────────────────────────────

async function isOpenClawRunning(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 2_000);
    const res = await fetch(`http://localhost:${OPENCLAW_PORT}/health`, {
      signal: ctrl.signal,
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function getOpenClawModel(): Promise<string> {
  try {
    return (await getConfig("OPENCLAW_MODEL")) ?? process.env["OPENCLAW_MODEL"] ?? "gemma3:9b";
  } catch {
    return process.env["OPENCLAW_MODEL"] ?? "gemma3:9b";
  }
}

// ── GET /api/openclaw/status ───────────────────────────────────────────────

router.get("/openclaw/status", async (_req, res) => {
  const [running, model] = await Promise.all([isOpenClawRunning(), getOpenClawModel()]);
  res.json({
    running,
    gateway: `http://localhost:${OPENCLAW_PORT}`,
    model,
    port: OPENCLAW_PORT,
    wslNote: "OpenClaw requires WSL2 on Windows. Run: ollama launch openclaw",
    docsUrl: "https://docs.openclaw.ai",
    clawHubUrl: "https://clawhub.ai",
  });
});

// ── POST /api/openclaw/chat ────────────────────────────────────────────────
// Proxies a message to the OpenClaw gateway (which routes to Ollama locally).

router.post("/openclaw/chat", async (req, res) => {
  const { message, sessionId, stream = false } = req.body as {
    message: string;
    sessionId?: string;
    stream?: boolean;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const running = await isOpenClawRunning();
  if (!running) {
    res.status(503).json({
      error: "OpenClaw gateway is not running",
      fix: "Run in WSL2: ollama launch openclaw",
      docsUrl: "https://docs.openclaw.ai/windows",
    });
    return;
  }

  const model   = await getOpenClawModel();
  const sid     = sessionId?.trim() || `deck-os-${Date.now()}`;
  const startMs = Date.now();

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 60_000);

    // OpenClaw gateway follows Ollama's /api/chat format
    const ollamaBody = {
      model,
      messages: [{ role: "user", content: message }],
      stream: false,
    };

    const response = await fetch(`http://localhost:${OPENCLAW_PORT}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ollamaBody),
      signal: ctrl.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenClaw gateway responded with HTTP ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const reply =
      (data["message"] as Record<string, string> | undefined)?.["content"] ??
      (data["response"] as string | undefined) ??
      "";

    const latencyMs = Date.now() - startMs;

    bus.emit({
      source: "openclaw",
      target: null,
      type: "ai.chat.response",
      payload: { response: reply, sessionId: sid, modelUsed: model, latencyMs },
    });

    res.json({ response: reply, sessionId: sid, modelUsed: model, latencyMs });
  } catch (err) {
    logger.error({ err }, "OpenClaw chat proxy error");
    res.status(502).json({
      error: `OpenClaw error: ${err instanceof Error ? err.message : "Unknown error"}`,
    });
  }
});

// ── GET /api/openclaw/skills ───────────────────────────────────────────────
// Returns ClawHub skills. Tries the live API first, falls back to curated list.

router.get("/openclaw/skills", async (req, res) => {
  const q        = ((req.query["q"] as string) ?? "").toLowerCase();
  const category = (req.query["category"] as string) ?? "";
  const limit    = Math.min(Number(req.query["limit"] ?? 50), 200);

  try {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    params.set("limit", String(limit));

    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5_000);

    const apiRes = await fetch(`${CLAWHUB_API}/skills?${params}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": "DeckOS/1.0" },
    });

    if (apiRes.ok) {
      const raw = await apiRes.json() as Record<string, unknown>;
      // Normalize ClawHub API format (items|data|skills) → skills
      const skills = (raw["skills"] ?? raw["items"] ?? raw["data"] ?? []) as ClawSkill[];
      if (Array.isArray(skills) && skills.length > 0) {
        res.json({ skills, total: skills.length, source: "clawhub" });
        return;
      }
      // Empty response from API — fall through to curated
    }
  } catch {
    // fall through to curated list
  }

  const all     = CURATED_SKILLS;
  const matched = all.filter((s) => {
    const qOk  = !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.tags.some((t) => t.includes(q));
    const cOk  = !category || s.category === category;
    return qOk && cOk;
  });

  res.json({ skills: matched.slice(0, limit), total: matched.length, source: "curated" });
});

// ── GET /api/openclaw/skills/categories ───────────────────────────────────

router.get("/openclaw/skills/categories", (_req, res) => {
  const cats = [...new Set(CURATED_SKILLS.map((s) => s.category))].sort();
  res.json({ categories: cats });
});

// ── POST /api/openclaw/skills/install ─────────────────────────────────────
// Returns the installation command — actual execution happens in WSL.

router.post("/openclaw/skills/install", (req, res) => {
  const { slug } = req.body as { slug?: string };

  if (!slug || !/^[\w-]+\/[\w-]+$/.test(slug)) {
    res.status(400).json({ error: "Invalid skill slug (expected: author/skill-name)" });
    return;
  }

  const [author, name] = slug.split("/");
  res.json({
    slug,
    installCommand: `clawhub install ${slug}`,
    manualPath: `~/.openclaw/skills/${author}/${name}/`,
    instructions: [
      "Option A — ClawHub CLI (inside WSL):",
      `  clawhub install ${slug}`,
      "",
      "Option B — paste the GitHub URL directly into your OpenClaw chat:",
      `  https://github.com/openclaw/skills/tree/main/skills/${slug}`,
      "",
      "Option C — manual copy:",
      `  Copy skill folder into ~/.openclaw/skills/${author}/${name}/`,
    ].join("\n"),
    clawHubUrl: `https://clawhub.ai/${slug}`,
  });
});

// ── Curated skill catalog (offline fallback) ───────────────────────────────

const CURATED_SKILLS = [
  // Productivity
  { slug: "github/github",         name: "GitHub",         author: "github",         category: "productivity",  description: "Manage repos, issues, PRs, branches, and code reviews from your assistant.", installCount: 14200, tags: ["git", "code", "devops", "github"] },
  { slug: "google/gmail",          name: "Gmail",          author: "google",          category: "productivity",  description: "Read, compose, search, and send emails through Gmail.", installCount: 8900, tags: ["email", "google", "gmail"] },
  { slug: "notion/notion",         name: "Notion",         author: "notion",          category: "productivity",  description: "Read and write Notion pages, databases, and blocks with natural language.", installCount: 7400, tags: ["notes", "docs", "notion", "productivity"] },
  { slug: "jira/jira",             name: "Jira",           author: "jira",            category: "productivity",  description: "Create, update, and track Jira tickets, sprints, and epics.", installCount: 5100, tags: ["jira", "project-management", "agile"] },
  { slug: "linear/linear",         name: "Linear",         author: "linear",          category: "productivity",  description: "Manage Linear issues, cycles, projects, and teams.", installCount: 4300, tags: ["linear", "issues", "project"] },
  { slug: "todoist/todoist",       name: "Todoist",        author: "todoist",         category: "productivity",  description: "Manage tasks, projects, and reminders in Todoist.", installCount: 3800, tags: ["tasks", "todo", "productivity"] },
  { slug: "calendar/google",       name: "Google Calendar",author: "google",          category: "productivity",  description: "Create and query Google Calendar events, check free/busy slots.", installCount: 6100, tags: ["calendar", "scheduling", "google"] },
  { slug: "nevo-david/postiz",     name: "Postiz",         author: "nevo-david",      category: "productivity",  description: "Schedule and publish social media content across all major platforms.", installCount: 3600, tags: ["social", "scheduling", "marketing"] },

  // Communication
  { slug: "steipete/slack",        name: "Slack",          author: "steipete",        category: "communication", description: "Send messages, manage channels, and search Slack workspaces.", installCount: 9800, tags: ["slack", "messaging", "team"] },
  { slug: "discord/discord",       name: "Discord",        author: "discord",         category: "communication", description: "Send messages to Discord channels and read server activity.", installCount: 7100, tags: ["discord", "messaging", "gaming"] },
  { slug: "telegram/telegram",     name: "Telegram",       author: "telegram",        category: "communication", description: "Send and receive Telegram messages through your assistant.", installCount: 5900, tags: ["telegram", "messaging"] },
  { slug: "gmail/compose",         name: "Email Compose",  author: "gmail",           category: "communication", description: "Draft and send rich-text emails with AI-generated content.", installCount: 4200, tags: ["email", "compose", "gmail"] },

  // Development / DevOps
  { slug: "docker/docker",         name: "Docker",         author: "docker",          category: "devops",        description: "Manage containers, images, networks, and volumes with natural language.", installCount: 6700, tags: ["docker", "containers", "devops"] },
  { slug: "kubernetes/k8s",        name: "Kubernetes",     author: "kubernetes",      category: "devops",        description: "Query pods, deployments, services, and cluster health.", installCount: 3900, tags: ["kubernetes", "k8s", "devops", "cloud"] },
  { slug: "git/local",             name: "Local Git",      author: "git",             category: "devops",        description: "Run git operations on local repositories — commit, push, diff, log.", installCount: 8400, tags: ["git", "version-control", "local"] },
  { slug: "npm/npm",               name: "NPM / pnpm",     author: "npm",             category: "devops",        description: "Manage node packages, run scripts, and audit dependencies.", installCount: 5200, tags: ["npm", "pnpm", "node", "packages"] },
  { slug: "vercel/vercel",         name: "Vercel",         author: "vercel",          category: "devops",        description: "Deploy and manage Vercel projects, view build logs and domains.", installCount: 4100, tags: ["vercel", "deploy", "hosting"] },

  // Data / Research
  { slug: "postgres/database",     name: "PostgreSQL",     author: "postgres",        category: "data",          description: "Run natural-language queries against PostgreSQL databases.", installCount: 6500, tags: ["sql", "database", "postgres"] },
  { slug: "web/search",            name: "Web Search",     author: "web",             category: "research",      description: "Search the web and retrieve up-to-date information in real time.", installCount: 11000, tags: ["search", "web", "research", "browse"] },
  { slug: "arxiv/arxiv",           name: "arXiv",          author: "arxiv",           category: "research",      description: "Search and summarize research papers from arXiv.", installCount: 2900, tags: ["research", "papers", "science", "arxiv"] },
  { slug: "wikipedia/wiki",        name: "Wikipedia",      author: "wikipedia",       category: "research",      description: "Fetch and summarize Wikipedia articles on any topic.", installCount: 7200, tags: ["wikipedia", "knowledge", "research"] },

  // System / Local
  { slug: "filesystem/local",      name: "Local Files",    author: "filesystem",      category: "system",        description: "Read, write, list, and manage files and directories on your machine.", installCount: 12100, tags: ["files", "local", "filesystem", "system"] },
  { slug: "shell/execute",         name: "Shell Execute",  author: "shell",           category: "system",        description: "Run shell commands and scripts locally (requires confirmation).", installCount: 9300, tags: ["shell", "bash", "terminal", "system"] },
  { slug: "browser/puppeteer",     name: "Browser Control",author: "browser",         category: "system",        description: "Automate web browsers — scrape, fill forms, take screenshots.", installCount: 4800, tags: ["browser", "puppeteer", "automation", "scrape"] },

  // AI / Agents
  { slug: "ollama/ollama",         name: "Ollama Control", author: "ollama",          category: "ai",            description: "Manage Ollama models, pull new models, and monitor local inference.", installCount: 8700, tags: ["ollama", "models", "llm", "local-ai"] },
  { slug: "openai/gpt",            name: "OpenAI GPT",     author: "openai",          category: "ai",            description: "Route prompts to OpenAI models with tool-calling support.", installCount: 6900, tags: ["openai", "gpt", "cloud-ai"] },
  { slug: "memory/vector",         name: "Vector Memory",  author: "memory",          category: "ai",            description: "Semantic search and retrieval across your personal memory store.", installCount: 5100, tags: ["memory", "vectors", "embeddings", "rag"] },

  // Media / Content
  { slug: "youtube/summarize",     name: "YouTube Summarizer", author: "youtube",    category: "media",          description: "Download transcripts and generate summaries of YouTube videos.", installCount: 4600, tags: ["youtube", "video", "summarize", "media"] },
  { slug: "image/generate",        name: "Image Generate", author: "image",           category: "media",          description: "Generate images with Stable Diffusion or DALL-E from text prompts.", installCount: 5800, tags: ["image", "generation", "stable-diffusion", "dalle"] },
  { slug: "pdf/reader",            name: "PDF Reader",     author: "pdf",             category: "media",          description: "Extract and summarize text from PDF files.", installCount: 7100, tags: ["pdf", "documents", "extract", "read"] },

  // Homelab / Self-Hosted Infrastructure
  { slug: "home-assistant/hass",   name: "Home Assistant", author: "home-assistant",  category: "homelab",        description: "Control smart home devices, automations, scenes, and sensors via Home Assistant.", installCount: 9200, tags: ["home-assistant", "smart-home", "iot", "automation", "jarvis"] },
  { slug: "proxmox/proxmox",       name: "Proxmox VE",     author: "proxmox",         category: "homelab",        description: "Manage VMs, LXC containers, storage, and node health on Proxmox Virtual Environment.", installCount: 3100, tags: ["proxmox", "vm", "virtualization", "homelab", "server"] },
  { slug: "plex/plex",             name: "Plex",           author: "plex",            category: "homelab",        description: "Browse your Plex library, control playback, and manage media from your assistant.", installCount: 4400, tags: ["plex", "media", "streaming", "homelab"] },
  { slug: "jellyfin/jellyfin",     name: "Jellyfin",       author: "jellyfin",        category: "homelab",        description: "Self-hosted media control — browse libraries, manage users, and control playback.", installCount: 3700, tags: ["jellyfin", "media", "self-hosted", "homelab"] },
  { slug: "tailscale/tailscale",   name: "Tailscale",      author: "tailscale",       category: "homelab",        description: "View mesh network peers, check VPN status, and manage Tailscale devices.", installCount: 5600, tags: ["tailscale", "vpn", "networking", "mesh", "homelab"] },

  // Security
  { slug: "bitwarden/bitwarden",   name: "Bitwarden",      author: "bitwarden",       category: "security",       description: "Look up passwords and secure notes from your Bitwarden vault (read-only by default).", installCount: 4900, tags: ["bitwarden", "passwords", "secrets", "security", "vault"] },

  // Notifications
  { slug: "ntfy/ntfy",             name: "ntfy",           author: "ntfy",            category: "system",         description: "Push notifications to your phone or desktop via ntfy — trigger from any AI action.", installCount: 3300, tags: ["ntfy", "notifications", "push", "alerts", "self-hosted"] },

  // Knowledge Management
  { slug: "obsidian/obsidian",     name: "Obsidian",       author: "obsidian",        category: "productivity",   description: "Read, write, and search notes in your Obsidian vault. Integrates with Memory Bank.", installCount: 6100, tags: ["obsidian", "notes", "knowledge", "markdown", "vault"] },
];

export default router;

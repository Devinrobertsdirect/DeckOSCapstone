import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { execSync, spawn } from "child_process";
import { EventEmitter } from "events";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import os from "os";

const router: IRouter = Router();

const LOOPBACK = new Set(["::1", "127.0.0.1", "::ffff:127.0.0.1"]);
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/;

const ADMIN_TOKEN: string = process.env.ADMIN_SECRET ?? crypto.randomBytes(32).toString("hex");

type LogEntry = { line: string; stderr?: boolean };
type JobResult = { success: boolean; version?: string; error?: string; code?: number | null };
type Job = { status: "running" | "done"; log: LogEntry[]; result: JobResult | null };

let currentJob: Job | null = null;
const jobEmitter = new EventEmitter();
jobEmitter.setMaxListeners(50);

function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const token = (req.headers["x-admin-token"] as string | undefined)
    ?? req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token || token !== ADMIN_TOKEN) {
    res.status(401).json({ error: "Invalid or missing admin token. Fetch it from GET /api/admin/token." });
    return;
  }
  next();
}

function getVersion(): string {
  try {
    const v = execSync("git describe --tags --always 2>/dev/null", { encoding: "utf8" }).trim();
    if (!v) throw new Error("empty");
    return v.startsWith("v") ? v : `v${v}`;
  } catch {
    try {
      const pkgPath = path.resolve(process.cwd(), "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
      const v = pkg.version ?? "unknown";
      return v.startsWith("v") ? v : `v${v}`;
    } catch {
      return "unknown";
    }
  }
}

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, "");
}

type ScriptSpec = { cmd: string; args: string[] };

function findUpdateScript(flags: string[]): ScriptSpec | null {
  const isWindows = os.platform() === "win32";
  const candidateDirs = [
    process.cwd(),
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), ".."),
    path.resolve(__dirname, "../../../../"),
    path.resolve(__dirname, "../../../../../"),
  ];
  for (const dir of candidateDirs) {
    if (isWindows) {
      const ps1 = path.join(dir, "update.ps1");
      if (fs.existsSync(ps1)) {
        return { cmd: "powershell", args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ps1, ...flags] };
      }
    }
    const sh = path.join(dir, "update.sh");
    if (fs.existsSync(sh)) {
      return { cmd: "bash", args: [sh, ...flags] };
    }
  }
  return null;
}

router.get("/admin/token", (req: Request, res: Response) => {
  const socketIp = req.socket?.remoteAddress ?? req.ip ?? "";
  const origin = req.headers.origin;
  const isLoopback = LOOPBACK.has(socketIp);
  const isLocalOrigin = !origin || LOCAL_ORIGIN_RE.test(origin);

  if (!isLoopback && !isLocalOrigin) {
    res.removeHeader("Access-Control-Allow-Origin");
    res.status(403).json({ error: "Token exchange only accessible from localhost" });
    return;
  }
  res.json({ token: ADMIN_TOKEN });
});

router.get("/admin/version", (_req, res) => {
  res.json({ version: getVersion() });
});

router.post("/admin/update", requireAdminToken, (req, res) => {
  if (currentJob?.status === "running") {
    res.status(409).json({ error: "An update is already in progress. Connect to /api/admin/update/stream to watch it." });
    return;
  }

  const useDocker = (req.body as { docker?: boolean })?.docker === true;
  const flags = ["--no-pull"];
  if (useDocker) flags.push("--docker");

  const spec = findUpdateScript(flags);
  if (!spec) {
    res.status(503).json({ error: "update.sh / update.ps1 not found — only available in a local installation." });
    return;
  }

  currentJob = { status: "running", log: [], result: null };
  jobEmitter.emit("reset");

  const child = spawn(spec.cmd, spec.args, {
    env: { ...process.env, TERM: "dumb" },
  });

  const pushLog = (entry: LogEntry) => {
    currentJob!.log.push(entry);
    jobEmitter.emit("log", entry);
  };

  child.stdout.on("data", (chunk: Buffer) => {
    for (const line of stripAnsi(chunk.toString()).split("\n")) {
      if (line.trim()) pushLog({ line });
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    for (const line of stripAnsi(chunk.toString()).split("\n")) {
      if (line.trim()) pushLog({ line, stderr: true });
    }
  });

  child.on("close", (code) => {
    const version = getVersion();
    const result: JobResult = code === 0
      ? { success: true, version }
      : { success: false, code, version };
    currentJob!.status = "done";
    currentJob!.result = result;
    jobEmitter.emit("done", result);
  });

  child.on("error", (err) => {
    const result: JobResult = { success: false, error: err.message, version: getVersion() };
    currentJob!.status = "done";
    currentJob!.result = result;
    jobEmitter.emit("done", result);
  });

  res.status(202).json({ status: "started", streamUrl: "/api/admin/update/stream" });
});

router.get("/admin/update/stream", requireAdminToken, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (type: string, payload: Record<string, unknown>) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  };

  if (!currentJob) {
    send("idle", { message: "No update in progress." });
    res.end();
    return;
  }

  send("start", { message: "Update in progress..." });
  for (const entry of currentJob.log) {
    send("log", entry as unknown as Record<string, unknown>);
  }

  if (currentJob.status === "done") {
    send("done", currentJob.result as unknown as Record<string, unknown>);
    res.end();
    return;
  }

  const onLog = (entry: LogEntry) => send("log", entry as unknown as Record<string, unknown>);
  const onDone = (result: JobResult) => {
    send("done", result as unknown as Record<string, unknown>);
    res.end();
  };

  jobEmitter.on("log", onLog);
  jobEmitter.once("done", onDone);

  req.on("close", () => {
    jobEmitter.off("log", onLog);
    jobEmitter.off("done", onDone);
  });
});

export default router;

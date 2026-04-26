import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { execSync, spawn } from "child_process";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/;

function requireLocalOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && !LOCAL_ORIGIN_RE.test(origin)) {
    res.removeHeader("Access-Control-Allow-Origin");
    res.removeHeader("Access-Control-Allow-Credentials");
    res.status(403).json({ error: "Admin endpoints are only accessible from localhost" });
    return;
  }
  next();
}

let updateInProgress = false;

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

function findUpdateScript(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "update.sh"),
    path.resolve(process.cwd(), "../..", "update.sh"),
    path.resolve(process.cwd(), "..", "update.sh"),
    path.resolve(__dirname, "../../../../update.sh"),
    path.resolve(__dirname, "../../../../../update.sh"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

router.get("/admin/version", requireLocalOrigin, (_req, res) => {
  const version = getVersion();
  res.json({ version });
});

router.post("/admin/update", requireLocalOrigin, (req, res) => {
  if (updateInProgress) {
    res.status(409).json({ error: "An update is already in progress — wait for it to finish before starting another." });
    return;
  }

  const useDocker = (req.body as { docker?: boolean }).docker === true;

  const scriptPath = findUpdateScript();
  if (!scriptPath) {
    res.status(503).json({ error: "update.sh not found — this endpoint is only available in a local bare-metal or Docker installation." });
    return;
  }

  updateInProgress = true;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (type: string, payload: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  };

  send("start", { message: "Starting update..." });

  const args = ["--no-pull"];
  if (useDocker) args.push("--docker");

  const scriptDir = path.dirname(scriptPath);
  const child = spawn("bash", [scriptPath, ...args], {
    cwd: scriptDir,
    env: { ...process.env, TERM: "dumb" },
  });

  child.stdout.on("data", (chunk: Buffer) => {
    const lines = stripAnsi(chunk.toString()).split("\n");
    for (const line of lines) {
      if (line.trim()) send("log", { line });
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    const lines = stripAnsi(chunk.toString()).split("\n");
    for (const line of lines) {
      if (line.trim()) send("log", { line, stderr: true });
    }
  });

  const finish = () => {
    updateInProgress = false;
  };

  child.on("close", (code) => {
    finish();
    const version = getVersion();
    if (code === 0) {
      send("done", { success: true, version });
    } else {
      send("done", { success: false, code, version });
    }
    res.end();
  });

  child.on("error", (err) => {
    finish();
    send("done", { success: false, error: err.message, version: getVersion() });
    res.end();
  });

  req.on("close", () => {
    finish();
    child.kill();
  });
});

export default router;

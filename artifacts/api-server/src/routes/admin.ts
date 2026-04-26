import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { execSync, spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

const router: IRouter = Router();

const LOOPBACK = new Set(["::1", "127.0.0.1", "::ffff:127.0.0.1"]);

function requireLoopback(req: Request, res: Response, next: NextFunction): void {
  const ip = req.socket?.remoteAddress ?? req.ip ?? "";
  if (!LOOPBACK.has(ip)) {
    res.status(403).json({
      error: "This admin command requires a local connection. In Docker mode, run: bash update.sh --docker",
      dockerHint: true,
    });
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

router.get("/admin/version", (_req, res) => {
  const version = getVersion();
  res.json({ version });
});

router.post("/admin/update", requireLoopback, (req, res) => {
  if (updateInProgress) {
    res.status(409).json({ error: "An update is already in progress — wait for it to finish before starting another." });
    return;
  }

  const useDocker = (req.body as { docker?: boolean })?.docker === true;

  const flags = ["--no-pull"];
  if (useDocker) flags.push("--docker");

  const spec = findUpdateScript(flags);
  if (!spec) {
    res.status(503).json({ error: "update.sh / update.ps1 not found — this endpoint is only available in a local bare-metal or Docker installation." });
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

  const child = spawn(spec.cmd, spec.args, {
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

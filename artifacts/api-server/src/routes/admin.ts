import { Router, type IRouter } from "express";
import { execSync, spawn } from "child_process";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

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

router.get("/admin/version", (_req, res) => {
  const version = getVersion();
  res.json({ version });
});

router.post("/admin/update", (req, res) => {
  const useDocker = (req.body as { docker?: boolean }).docker === true;

  const scriptPath = findUpdateScript();
  if (!scriptPath) {
    res.status(503).json({ error: "update.sh not found — cannot run update from this environment" });
    return;
  }

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
      if (line.trim()) send("log", { line: line });
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    const lines = stripAnsi(chunk.toString()).split("\n");
    for (const line of lines) {
      if (line.trim()) send("log", { line: line, stderr: true });
    }
  });

  child.on("close", (code) => {
    const version = getVersion();
    if (code === 0) {
      send("done", { success: true, version });
    } else {
      send("done", { success: false, code, version });
    }
    res.end();
  });

  child.on("error", (err) => {
    send("done", { success: false, error: err.message, version: getVersion() });
    res.end();
  });

  req.on("close", () => {
    child.kill();
  });
});

export default router;

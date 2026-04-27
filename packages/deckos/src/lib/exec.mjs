import { execSync, spawnSync } from 'node:child_process';

export function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: 'pipe',
      ...opts,
    }).trim();
  } catch (err) {
    if (opts.throws !== false) throw err;
    return null;
  }
}

export function runInherit(cmd, cwd) {
  const result = spawnSync('sh', ['-c', cmd], {
    cwd,
    stdio: 'inherit',
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (exit ${result.status}): ${cmd}`);
  }
}

export function runInheritWin(cmd, cwd) {
  const result = spawnSync('cmd', ['/c', cmd], {
    cwd,
    stdio: 'inherit',
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (exit ${result.status}): ${cmd}`);
  }
}

export function sh(cmd, cwd) {
  const isWin = process.platform === 'win32';
  return isWin ? runInheritWin(cmd, cwd) : runInherit(cmd, cwd);
}

export function openBrowser(url) {
  const p = process.platform;
  const cmd = p === 'darwin' ? `open "${url}"`
            : p === 'win32'  ? `start "" "${url}"`
            : `xdg-open "${url}" 2>/dev/null || true`;
  try { execSync(cmd, { stdio: 'ignore' }); } catch { /* best effort */ }
}

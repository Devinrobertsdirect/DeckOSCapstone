---
name: Deploy promote-step failures
description: Diagnosing Autoscale publishes that fail after "Creating Autoscale service" — which paths health probes actually hit, and where the real error text lives.
---

# Autoscale promote-step failures

**Rule:** The deployment health layer probes the **bare service path prefix** (e.g. `GET /api`) and the container root `/` — not only the path configured in `[services.production.health.startup]`. Every one of those surfaces must return 2xx from the API container, or the promote step fails even though the configured health endpoint is perfectly healthy.

**Why:** Publishes failed six times in a row with build logs ending at `Creating Autoscale service` (~60s later, no error line) while `/api/healthz` returned 200 everywhere. The deployer's own log — visible only in the user's Publishing pane, absent from the build-log API — showed `healthcheck failed error=healthcheck /api returned status 500`. An earlier app version passed only because an SPA catch-all served index.html (200) on every path; the rewritten app 404'd bare `/api` and `/`, and explicit 200 routes on both were required.

**How to apply:**
- When a build log's last line is `Creating Autoscale service` (success logs continue with `upsertCloudRunService completed`), it's a container readiness failure, not a build failure.
- Curl every probe surface locally against the production bundle: `/`, the bare path prefix (`/api`), and the configured startup path — all must be 2xx. A scrubbed-env boot test (`env -i` with only NODE_ENV/PORT/secrets/DATABASE_URL) proves or rules out env issues.
- Runtime logs of *failed* promote attempts are not fetchable via the deployment-logs API; ask the user for the error text in the Publishing pane — the deployer's `System` lines there name the exact probed path and status.
- Secondary checklist: stale `artifact.toml` paths after directory restructures (publicDir, run args), and remember publish reads the **committed** git tree — fixes must be committed before the build starts.

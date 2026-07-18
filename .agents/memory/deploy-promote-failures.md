---
name: Deploy promote-step failures
description: How to diagnose publishes that fail after a successful build phase, and the two root causes seen in this project
---

# Deploy promote-step failures

Build logs ending at "Creating Autoscale service" with status `failed` = promote-step (health check) failure, NOT a build problem. The build compiled fine; the deployed service never became healthy.

**Root causes found in this project:**

1. **Stale paths in artifact.toml production configs after directory restructures.** When packages moved `artifacts/` → `interfaces/` + `core/`, three production settings kept old paths: web artifacts' `publicDir` (static server served an empty dir) and the API server's `production.run` args (node binary path didn't exist, process exited instantly, `/api/healthz` never answered). After any restructure, audit every `.replit-artifact/artifact.toml` `[services.production]` section for path literals.

2. **Publish reads the committed git tree, not the working tree.** A publish clicked before a fix is committed still runs the old config. When a "fixed" build fails identically, compare the build's `timeCreated` against `git log --format=%cI` — the fix may have landed after the build started.

**How to verify before suggesting republish:** run the production command locally (e.g. `NODE_ENV=production PORT=9999 node <dist entry>`) and curl the health path from `[services.production.health.startup]` — it must return 200 quickly.

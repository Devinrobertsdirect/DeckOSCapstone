---
name: Artifact re-registration after GitHub import
description: How to recover a pnpm-workspace project whose artifacts/*/.replit-artifact/artifact.toml files exist on disk but aren't registered with Replit's runtime (listArtifacts empty, WorkflowsRestart says workflow doesn't exist).
---

# Artifact re-registration after GitHub import

When a Replit pnpm-workspace project (multiple `artifacts/*` packages, each with a `.replit-artifact/artifact.toml`) is imported/re-imported from a plain GitHub repo, the on-disk `artifact.toml` files survive but the platform-side registration (workflows, `listArtifacts()`, routing) does not. Symptoms: `listArtifacts()` returns `[]`, `WorkflowsRestart` fails with "doesn't exist in config", `.replit` has no `[[workflows.workflow]]` entries even though `[[ports]]` mappings matching the artifacts are present.

`createArtifact()` can't fix this — it refuses because `artifacts/<slug>/` already exists (`ARTIFACT_DIR_EXISTS`).

**Fix:** call `verifyAndReplaceArtifactToml({ tempFilePath, artifactTomlPath })` once, writing back the *same* (or lightly touched) content of an existing `.replit-artifact/artifact.toml` to a sibling temp file. This call has the side effect of re-scanning and re-registering **all** artifacts in the project (not just the one you targeted) — workflows for every artifact get (re)created automatically as an `<automatic_updates>` event.

**Why:** the registration index is rebuilt from a full artifact scan triggered by this validated-write path; it isn't scoped to the single file you pass in.

**How to apply:** if you hit this state, don't try to hand-roll `configureWorkflow` calls per service (that bypasses proxy/env injection). Instead do one `verifyAndReplaceArtifactToml` round-trip on any single artifact's toml, then use `WorkflowsRestart` with the now-real managed workflow names (`artifacts/<slug>: <service>`).

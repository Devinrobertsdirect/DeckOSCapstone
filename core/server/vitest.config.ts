import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    pool: "forks",
    // Resolve workspace packages via their TypeScript source so tests run
    // without a prior build step.
    alias: {
      "@workspace/event-bus": new URL(
        "../../core/lib/event-bus/src/index.ts",
        import.meta.url,
      ).pathname,
      "@workspace/db": new URL(
        "../../core/lib/db/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
});

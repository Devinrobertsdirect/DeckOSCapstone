import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Do NOT throw at import time when DATABASE_URL is missing: this module is
// loaded before the HTTP server binds its port, so an import-time throw
// crash-loops production containers with zero diagnostics (the deployment
// revision dies before listening). Instead, log loudly and let queries fail
// at runtime — the server stays up and /api/healthz reports db:false.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  // eslint-disable-next-line no-console
  console.error(
    "[db] DATABASE_URL is not set — database queries will fail until it is provided. " +
      "Did you forget to provision or link a database?",
  );
}

/**
 * pg v8 treats sslmode=prefer/require/verify-ca as aliases for verify-full
 * (full certificate + hostname verification) and emits a security warning.
 * pg v9 will switch those modes to weaker libpq semantics. Pinning
 * verify-full explicitly preserves today's working behavior across the
 * upgrade and silences the warning.
 */
function pinSslMode(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    // Explicit libpq-compat mode opts into libpq semantics where these
    // sslmode values are intentionally weaker — leave such URLs untouched.
    if (url.searchParams.get("uselibpqcompat") === "true") {
      return connectionString;
    }
    const mode = url.searchParams.get("sslmode");
    if (mode === "prefer" || mode === "require" || mode === "verify-ca") {
      url.searchParams.set("sslmode", "verify-full");
      return url.toString();
    }
    return connectionString;
  } catch {
    // Non-URL connection string formats: pass through untouched.
    return connectionString;
  }
}

export const pool = new Pool({
  connectionString: connectionString ? pinSslMode(connectionString) : undefined,
});
export const db = drizzle(pool, { schema });

export * from "./schema";

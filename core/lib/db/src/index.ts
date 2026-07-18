import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
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
  connectionString: pinSslMode(process.env.DATABASE_URL),
});
export const db = drizzle(pool, { schema });

export * from "./schema";

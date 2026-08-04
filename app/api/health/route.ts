import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

// This endpoint makes a live network call and must never be statically
// cached at build time — see app/dashboard/page.tsx for the same pattern
// and why (createSupabaseServerClient() can throw before cookies() fires
// the dynamic-rendering signal Next.js needs).
export const dynamic = "force-dynamic";

const NONEXISTENT_TABLE = "__health_check_no_such_table__";

// Postgres/PostgREST codes meaning "we reached a live, authenticated
// database and it correctly reported no such table" — i.e. connected.
// Anything else (network failure, timeout, invalid API key) means the
// connection itself is broken, not just that the table is missing.
const UNDEFINED_TABLE_CODES = new Set(["42P01", "PGRST205", "PGRST116"]);

function response(
  status: "ok" | "error",
  database: "connected" | "unreachable" | "misconfigured",
  httpStatus: number,
) {
  return NextResponse.json(
    { status, database, timestamp: new Date().toISOString() },
    { status: httpStatus },
  );
}

/**
 * Health check for the Supabase connection, built on the same
 * RLS-respecting client (lib/supabase/server.ts) every real tenant-scoped
 * route uses — not the service-role client, since this only needs to
 * prove the app's actual request path can reach the database, not bypass
 * RLS. Never returns secret values, raw provider error messages, or
 * stack traces — only a small, fixed set of status strings. Proves
 * connectivity without needing any application table to exist: querying
 * a deliberately nonexistent table and getting a real "relation does not
 * exist" response back proves a live round trip to Postgres.
 */
export async function GET() {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return response("error", "misconfigured", 503);
  }

  try {
    const { error } = await supabase.from(NONEXISTENT_TABLE).select("*").limit(1);

    if (!error || (error.code && UNDEFINED_TABLE_CODES.has(error.code))) {
      return response("ok", "connected", 200);
    }

    return response("error", "unreachable", 503);
  } catch {
    return response("error", "unreachable", 503);
  }
}

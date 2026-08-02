import { NextResponse } from "next/server";
import { getClientEnv } from "@/lib/env";
import { getSupabaseClient } from "@/lib/supabase/client";

// Always dynamic — this endpoint makes a live network call and must never
// be statically cached at build time.
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
 * Health check for the Supabase connection. Never returns secret values,
 * raw provider error messages, or stack traces — only a small, fixed set
 * of status strings. Proves connectivity without needing any application
 * table to exist yet (none do — schema work is M1.5): querying a
 * deliberately nonexistent table and getting a real "relation does not
 * exist" response back proves a live round trip to Postgres.
 */
export async function GET() {
  try {
    getClientEnv();
  } catch {
    return response("error", "misconfigured", 503);
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from(NONEXISTENT_TABLE).select("*").limit(1);

    if (!error || (error.code && UNDEFINED_TABLE_CODES.has(error.code))) {
      return response("ok", "connected", 200);
    }

    return response("error", "unreachable", 503);
  } catch {
    return response("error", "unreachable", 503);
  }
}

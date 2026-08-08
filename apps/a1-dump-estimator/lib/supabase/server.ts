import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./env";
import { ProviderNotConfiguredError } from "@/lib/providers/errors";

/**
 * The RLS-respecting Supabase client for Server Components, Route
 * Handlers, and Server Actions — carries the caller's own session cookies,
 * so every query goes through the RLS policies in
 * supabase/migrations/00000000000004_auth_and_rls.sql exactly like a
 * request from the browser would. Every repository in lib/repository/ that
 * touches business_id-scoped data uses this, never a cached/service-role
 * client, so a bug in application code can't bypass tenant isolation.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  if (!isSupabaseConfigured()) {
    throw new ProviderNotConfiguredError("Supabase", [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render, which can't set
            // cookies — safe to ignore as long as middleware.ts refreshes
            // the session, per the documented @supabase/ssr App Router
            // pattern this mirrors from the root repo's lib/supabase/server.ts.
          }
        },
      },
    },
  );
}

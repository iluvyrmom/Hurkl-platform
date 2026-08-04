import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getClientEnv } from "../env";

/**
 * The RLS-respecting Supabase client for Server Components, Route
 * Handlers, and Server Actions. Uses the publishable ("anon") key plus
 * the caller's own session — every query goes through the RLS policies
 * in supabase/migrations/, exactly like a request from the browser
 * would. This is the client every normal, tenant-scoped code path uses.
 *
 * Never use this for the dedicated HURKL-admin path — see
 * lib/supabase/admin.ts for that, and SECURITY.md §1.
 */
export async function createSupabaseServerClient() {
  const env = getClientEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
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
            // Called from a Server Component that can't set cookies (e.g. a
            // page render, not a Route Handler/Server Action) — safe to
            // ignore as long as middleware refreshes the session, per the
            // documented @supabase/ssr pattern for the Next.js App Router.
          }
        },
      },
    },
  );
}

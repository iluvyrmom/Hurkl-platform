import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on every request and redirects
 * unauthenticated users to /sign-in once Supabase is configured. Named
 * `proxy.ts` (not `middleware.ts`) to match the convention this Next.js
 * version (16.2.12) uses — see the root repo's own `proxy.ts` for the same
 * pattern.
 *
 * This is a UX convenience only — NOT the security boundary. The actual
 * boundary is Postgres RLS (supabase/migrations/00000000000004_auth_and_rls.sql)
 * plus lib/auth/business.ts's server-side membership check. A bug here
 * could at worst show the wrong page; it can never grant access to another
 * business's data, because RLS enforces that at the database layer
 * regardless of what this file does.
 *
 * Known gap: there is currently no public, no-login customer-facing quote
 * view — /quote/[id] requires a signed-in business member, same as every
 * other page. A shareable customer link (SMS/email delivery) needs its own
 * deliberate, reviewed design (e.g. an unguessable token + a narrowly
 * scoped RLS policy) rather than an ad hoc public-read policy on
 * `estimates`, and is not built yet.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Supabase isn't configured — mock/dev mode, let requests through.
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path === "/sign-in";
  const isApiRoute = path.startsWith("/api/");

  if (!user && !isAuthPage && !isApiRoute) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

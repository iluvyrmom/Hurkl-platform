import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getClientEnv } from "./lib/env";

/**
 * Refreshes the Supabase session cookie on every request, and redirects
 * unauthenticated users away from protected pages / signed-in users
 * away from the sign-in/sign-up pages.
 *
 * This is a UX convenience only — NOT the security boundary. The
 * actual boundary is Postgres RLS (supabase/migrations/) plus each API
 * route's own server-side auth/permission checks (lib/auth/session.ts,
 * lib/auth/roles.ts). A bug here could at worst show the wrong page; it
 * can never grant access to another tenant's data, because RLS enforces
 * that at the database layer regardless of what this file does.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = getClientEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    // Supabase isn't configured yet — let requests through unchanged;
    // pages/routes fail fast on their own (lib/supabase/server.ts).
    return response;
  }

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
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
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path === "/sign-in" || path === "/sign-up";
  const isPublicPage = path === "/" || isAuthPage;
  const isApiRoute = path.startsWith("/api/");

  if (!user && !isPublicPage && !isApiRoute) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

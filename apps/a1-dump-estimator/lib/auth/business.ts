import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_BUSINESS } from "@/lib/config/business";
import type { BusinessMembership } from "@/lib/domain/auth";

/**
 * Shared server-side "who is this, and which business do they belong to"
 * helper — every page/action that needs a business_id calls this rather
 * than each re-deriving it slightly differently, mirroring the pattern
 * hurkl-platform's own lib/auth/session.ts already uses for Mason.
 *
 * In mock/dev mode (no Supabase configured), this always returns the one
 * seeded business — there is no real auth to check. Once Supabase is
 * configured, it requires a real authenticated session with a
 * business_members row; RLS enforces the same boundary at the database
 * layer independently, so this is defense-in-depth, not the only gate.
 */

export class UnauthorizedError extends Error {
  constructor(message = "Sign in required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class NoBusinessMembershipError extends Error {
  constructor(message = "This account is not attached to a business yet") {
    super(message);
    this.name = "NoBusinessMembershipError";
  }
}

/** Best-effort lookup — null if not signed in, or signed in with no business membership. Used where a soft check is enough (e.g. middleware redirects). */
export async function getCurrentMembership(): Promise<BusinessMembership | null> {
  if (!isSupabaseConfigured()) {
    return { businessId: DEFAULT_BUSINESS.id, userId: "dev-mode", role: "owner" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("business_members")
    .select("business_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return { businessId: data.business_id, userId: user.id, role: data.role };
}

/** Strict version — distinguishes "not signed in" from "signed in, no business" so callers can show the right message. */
export async function requireMembership(): Promise<BusinessMembership> {
  if (!isSupabaseConfigured()) {
    return { businessId: DEFAULT_BUSINESS.id, userId: "dev-mode", role: "owner" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError();

  const { data } = await supabase
    .from("business_members")
    .select("business_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!data) throw new NoBusinessMembershipError();

  return { businessId: data.business_id, userId: user.id, role: data.role };
}

export async function requireCurrentBusinessId(): Promise<string> {
  const membership = await requireMembership();
  return membership.businessId;
}

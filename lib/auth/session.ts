import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { UserRole } from "./roles";

/**
 * Shared server-side auth/profile helpers. Every API route that needs
 * "who is this, and what company do they belong to" uses these, rather
 * than each route re-deriving it slightly differently — see
 * app/api/customers/route.ts and app/api/companies/route.ts.
 */

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class NoCompanyError extends Error {
  constructor(message = "This account is not attached to a company yet") {
    super(message);
    this.name = "NoCompanyError";
  }
}

export interface AuthedProfile {
  companyId: string;
  role: UserRole;
}

export async function requireAuthedUser(supabase: SupabaseClient): Promise<User> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new UnauthorizedError();
  }
  return user;
}

/**
 * RLS on public.profiles already scopes this select to the caller's
 * own row (see supabase/migrations/00000000000001_tenant_foundation.sql)
 * — this can never return another user's profile.
 */
export async function requireCompanyProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<AuthedProfile> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", userId)
    .single();

  if (error || !profile || !profile.company_id) {
    throw new NoCompanyError();
  }

  return { companyId: profile.company_id, role: profile.role };
}

/**
 * Convenience for routes that require BOTH an authenticated user AND a
 * company — the common case (e.g. the customers endpoint).
 */
export async function requireAuthedProfile(
  supabase: SupabaseClient,
): Promise<{ user: User; profile: AuthedProfile }> {
  const user = await requireAuthedUser(supabase);
  const profile = await requireCompanyProfile(supabase, user.id);
  return { user, profile };
}

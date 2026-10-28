import type { SupabaseClient } from "@supabase/supabase-js";

export type CompanyAccess =
  | { kind: "signed_out" }
  | { kind: "no_company"; isAdmin: boolean }
  | { kind: "ok"; userId: string; isAdmin: boolean; companyId: string; slug: string | null };

/**
 * Work out which company the signed-in person may see, using their own
 * (RLS-scoped) session. Everyone except a hurkl_admin is always their own
 * company — the `requestedSlug` is ignored for them. A hurkl_admin has no
 * company of their own and picks one by its website slug.
 */
export async function resolveCompanyAccess(
  supabase: SupabaseClient,
  requestedSlug: string | undefined,
): Promise<CompanyAccess> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "signed_out" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "hurkl_admin";
  let companyId: string | null = profile?.company_id ?? null;
  let slug: string | null = null;

  if (isAdmin && requestedSlug) {
    const { data: picked } = await supabase
      .from("companies")
      .select("id, website_slug")
      .eq("website_slug", requestedSlug)
      .maybeSingle();
    if (picked) {
      companyId = picked.id;
      slug = picked.website_slug;
    }
  }

  if (!companyId) return { kind: "no_company", isAdmin };
  return { kind: "ok", userId: user.id, isAdmin, companyId, slug };
}

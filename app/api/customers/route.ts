import { NextResponse } from "next/server";
import { recordAuditLogEntry } from "../../../lib/audit/log";
import { authErrorResponse } from "../../../lib/auth/http-errors";
import { assertPermission } from "../../../lib/auth/roles";
import { requireAuthedProfile } from "../../../lib/auth/session";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

/**
 * The first real, end-to-end vertical slice: an authenticated request
 * goes through the real RLS-respecting Supabase client, a real
 * permission check, and lands in the real audit log — the same path
 * every future Mason skill route will follow. See Skill 1 (Customer
 * Intake) in the founder's master prompt.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * to be configured (.env.local) and a real signed-in user with a
 * public.profiles row (see app/api/companies/route.ts for how that row
 * gets created) — until then this fails fast with a clear error.
 */

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    await requireAuthedProfile(supabase);

    // No .eq("company_id", ...) needed or wanted here — RLS already
    // guarantees this only ever returns the caller's own company's
    // rows (see lib/db/tenant-isolation.integration.test.ts).
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, email, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ customers: data });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

interface CreateCustomerBody {
  name?: string;
  phone?: string;
  email?: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { profile } = await requireAuthedProfile(supabase);
    assertPermission(profile, "edit_customer_data");

    const body = (await request.json()) as CreateCustomerBody;
    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    // company_id always comes from the caller's own profile, never from
    // request input — RLS would reject a forged value anyway (see the
    // tenant-isolation integration tests), but there's no reason to
    // trust client input for it in the first place.
    const { data, error } = await supabase
      .from("customers")
      .insert({
        company_id: profile.companyId,
        name: body.name.trim(),
        phone: body.phone ?? null,
        email: body.email ?? null,
      })
      .select("id, name, phone, email, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await recordAuditLogEntry(supabase, {
      companyId: profile.companyId,
      action: "customer_created",
      autonomyTier: "tier_1_automatic",
      policyReference: "customer_intake",
      subjectType: "customer",
      subjectId: data.id,
    });

    return NextResponse.json({ customer: data }, { status: 201 });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

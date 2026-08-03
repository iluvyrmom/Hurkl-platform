import { NextResponse } from "next/server";
import { authErrorResponse } from "../../../lib/auth/http-errors";
import { requireAuthedUser } from "../../../lib/auth/session";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

/**
 * Company onboarding. The only thing this route does is validate input
 * shape and call the atomic create_company_and_assign_owner Postgres
 * function (supabase/migrations/00000000000003_company_onboarding.sql)
 * — that function, not this route, is what actually enforces "never
 * leave behind a company without an owner, or a profile with no
 * company," including under concurrent/duplicate submissions. See
 * lib/db/company-onboarding.integration.test.ts.
 */

interface CreateCompanyBody {
  companyName?: string;
  ownerName?: string;
  businessPhone?: string;
  businessEmail?: string;
  industry?: string;
  timezone?: string;
}

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    await requireAuthedUser(supabase);

    const body = (await request.json()) as CreateCompanyBody;

    const companyName = body.companyName?.trim();
    const ownerName = body.ownerName?.trim();

    if (!companyName) {
      return validationError("companyName is required");
    }
    if (companyName.length > 200) {
      return validationError("companyName is too long");
    }
    if (!ownerName) {
      return validationError("ownerName is required");
    }
    if (ownerName.length > 200) {
      return validationError("ownerName is too long");
    }

    const { data: companyId, error } = await supabase.rpc("create_company_and_assign_owner", {
      p_company_name: companyName,
      p_owner_name: ownerName,
      p_business_phone: body.businessPhone?.trim() || null,
      p_business_email: body.businessEmail?.trim() || null,
      p_industry: body.industry?.trim() || null,
      p_timezone: body.timezone?.trim() || null,
    });

    if (error) {
      // The function's own messages are already clear and non-sensitive
      // (see the migration) — safe to surface directly rather than a
      // generic "internal error."
      if (/already belongs to a company/i.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (/required/i.test(error.message)) {
        return validationError(error.message);
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ companyId }, { status: 201 });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

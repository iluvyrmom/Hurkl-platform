import { NextResponse } from "next/server";
import { authErrorResponse } from "../../../lib/auth/http-errors";
import { requireAuthedProfile } from "../../../lib/auth/session";
import { RateLimiter } from "../../../lib/http/rate-limit";
import { LeadValidationError, submitLead, type LeadSubmission } from "../../../lib/leads/leads";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

// Depends on live per-request state (client IP, database writes) —
// never statically cached, same reasoning as app/api/health/route.ts.
export const dynamic = "force-dynamic";

// 5 submissions per 10 minutes per IP — generous enough for a real
// prospective customer (who might retry after a typo) while bounding
// obvious abuse. See lib/http/rate-limit.ts for this limiter's caveats.
const leadRateLimiter = new RateLimiter(5, 10 * 60 * 1000);

interface CreateLeadBody {
  companySlug?: string;
  name?: string;
  phone?: string;
  email?: string;
  pickupAddress?: string;
  destinationAddress?: string;
  moveDate?: string;
  preferredTime?: string;
  propertyType?: string;
  accessNotes?: string;
  inventoryNotes?: string;
  specialItems?: string;
  packingNeeds?: string;
  notes?: string;
}

function clientIp(request: Request): string {
  // Netlify (and most proxies) set x-forwarded-for as "client, proxy1, proxy2...".
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-nf-client-connection-ip") ?? "unknown";
}

/**
 * Owner/staff view of their own company's leads — authenticated,
 * RLS-scoped (leads_select_own_company), for the dashboard's leads
 * panel. Unrelated to the public POST below beyond sharing a table.
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    await requireAuthedProfile(supabase);

    const { data, error } = await supabase
      .from("leads")
      .select(
        "id, name, phone, email, pickup_address, destination_address, move_date, status, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ leads: data });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

/**
 * Public, unauthenticated lead intake — the front door of A-1's (and
 * any future tenant's) revenue pipeline. See
 * lib/leads/leads.ts#submitLead and the submit_lead() Postgres
 * function it calls for the real validation/authorization boundary;
 * this route only adds rate limiting and HTTP-shape concerns.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!leadRateLimiter.allow(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later, or call us directly." },
      { status: 429 },
    );
  }

  let body: CreateLeadBody;
  try {
    body = (await request.json()) as CreateLeadBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.companySlug) {
    return NextResponse.json({ error: "companySlug is required" }, { status: 400 });
  }
  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const submission: LeadSubmission = {
    companySlug: body.companySlug,
    name: body.name,
    phone: body.phone,
    email: body.email,
    pickupAddress: body.pickupAddress,
    destinationAddress: body.destinationAddress,
    moveDate: body.moveDate,
    preferredTime: body.preferredTime,
    propertyType: body.propertyType,
    accessNotes: body.accessNotes,
    inventoryNotes: body.inventoryNotes,
    specialItems: body.specialItems,
    packingNeeds: body.packingNeeds,
    notes: body.notes,
    source: "website",
  };

  try {
    const supabase = await createSupabaseServerClient();
    const leadId = await submitLead(supabase, submission);
    return NextResponse.json({ leadId }, { status: 201 });
  } catch (error) {
    if (error instanceof LeadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // Never surface raw DB/internal error text to an anonymous caller.
    console.error("Lead submission failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Something went wrong. Please call us directly." },
      { status: 500 },
    );
  }
}

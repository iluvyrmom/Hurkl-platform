import { NextResponse } from "next/server";
import { getServerEnv } from "../../../../../lib/env";
import { RateLimiter } from "../../../../../lib/http/rate-limit";
import { LeadValidationError, submitLead, type LeadSubmission } from "../../../../../lib/leads/leads";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

// Depends on live per-request state (the request body, a database write) —
// never statically cached, same reasoning as app/api/leads/route.ts.
export const dynamic = "force-dynamic";

// A-1's existing customer-facing site (a-1bestmoving.netlify.app) is not
// git-linked and has no code this repo can reach or redeploy — see
// docs/a1-best-moving-launch.md's "Connecting the existing A-1 website"
// section. Its "quote-estimate" Netlify Form already exists with the
// fields a real estimate needs; this route is the other end of a Netlify
// Forms "outgoing webhook" notification pointed at
// /api/leads/netlify-webhook/<secret>, so a real submission on the
// existing site reaches this production lead system without touching
// that site's files at all. Netlify's own Forms storage keeps the raw
// submission durably regardless of what this route does, so a bug or
// outage here never loses a customer's information — it just means the
// lead sits in the Netlify Forms dashboard until reprocessed.
const A1_COMPANY_SLUG = "a1-best-moving";

// Generous relative to app/api/leads/route.ts's customer-facing 5/10min:
// this endpoint's real traffic is only ever real submissions relayed by
// Netlify (one call per real form fill), but the secret path segment is
// the only access control, so a rate limit stays on as defense in depth.
const webhookRateLimiter = new RateLimiter(20, 10 * 60 * 1000);

/**
 * Netlify's outgoing webhook payload shape has varied across
 * documentation versions and isn't contractually stable, so this reads
 * defensively rather than trusting one exact shape.
 */
interface NetlifyFormWebhookBody {
  data?: Record<string, string | undefined>;
  payload?: { data?: Record<string, string | undefined> };
}

function clientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-nf-client-connection-ip") ?? "unknown";
}

function isIsoDate(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function joinNonEmpty(parts: (string | false | undefined)[]): string | undefined {
  const joined = parts.filter((part): part is string => !!part).join("; ");
  return joined.length > 0 ? joined : undefined;
}

export async function POST(request: Request, context: { params: Promise<{ secret: string }> }) {
  const env = getServerEnv();
  const { secret } = await context.params;

  // No timing-safe compare here deliberately: the secret's job is to
  // keep this URL out of scrapers/search engines, not to resist an
  // attacker who can already observe server-side comparison timing —
  // same threat model as TELEGRAM_WEBHOOK_SECRET's header check.
  if (!env.A1_NETLIFY_WEBHOOK_SECRET || secret !== env.A1_NETLIFY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ip = clientIp(request);
  if (!webhookRateLimiter.allow(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: NetlifyFormWebhookBody;
  try {
    body = (await request.json()) as NetlifyFormWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const data = body.payload?.data ?? body.data ?? {};

  if (data["bot-field"]) {
    // Honeypot tripped. Netlify's own spam filtering should already stop
    // this from firing a notification, but never trust a public
    // webhook's upstream classification as the only line of defense.
    return NextResponse.json({ ok: true, spam: true });
  }

  const rawMoveDate = data["move_date"]?.trim();
  const moveSize = data["move_size"]?.trim();
  const rooms = data["rooms"]?.trim();
  const access = data["access"]?.trim();
  const parking = data["parking"]?.trim();

  const submission: LeadSubmission = {
    companySlug: A1_COMPANY_SLUG,
    name: data["name"]?.trim() ?? "",
    phone: data["phone"],
    email: data["email"],
    pickupAddress: data["from"],
    destinationAddress: data["to"],
    moveDate: isIsoDate(rawMoveDate) ? rawMoveDate : undefined,
    inventoryNotes: joinNonEmpty([moveSize && `Move size: ${moveSize}`, rooms && `Rooms: ${rooms}`]),
    accessNotes: joinNonEmpty([access && `Access: ${access}`, parking && `Parking: ${parking}`]),
    // A move_date that didn't parse as YYYY-MM-DD is never silently
    // dropped — it rides along here so the owner still sees exactly
    // what the customer typed.
    notes: joinNonEmpty([
      data["notes"]?.trim(),
      rawMoveDate && !isIsoDate(rawMoveDate)
        ? `Requested move date (as entered): ${rawMoveDate}`
        : undefined,
    ]),
    source: "a1-existing-website",
  };

  try {
    const supabase = await createSupabaseServerClient();
    const leadId = await submitLead(supabase, submission);
    return NextResponse.json({ ok: true, leadId }, { status: 201 });
  } catch (error) {
    console.error("A-1 existing-website form webhook: lead submission failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof LeadValidationError) {
      // Structurally invalid (e.g. no phone and no email) — not
      // something retrying will fix. Still 200: the raw submission is
      // safe in Netlify Forms either way, and a non-2xx here would only
      // make Netlify's delivery log look like an outage.
      return NextResponse.json({ ok: false, error: error.message });
    }
    // A real failure (DB unreachable, etc.) — surfaced as non-2xx so
    // it's visible in Netlify's webhook delivery log, without ever
    // exposing internals.
    return NextResponse.json({ ok: false, error: "submission_failed" }, { status: 502 });
  }
}

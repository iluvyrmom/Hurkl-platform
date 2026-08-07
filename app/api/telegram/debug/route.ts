import { NextResponse } from "next/server";
import { getServerEnv } from "../../../../lib/env";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

// Temporary diagnostic-only route while validating the first real
// Telegram loop end-to-end. Not part of the channel architecture —
// delete once lib/communications/telegram-identity.ts is confirmed
// working against production. Gated by the same webhook secret so it
// isn't a public information-disclosure endpoint in the meantime.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const env = getServerEnv();
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const telegramUserId = searchParams.get("id");

  if (!env.TELEGRAM_WEBHOOK_SECRET || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!telegramUserId) {
    return NextResponse.json({ error: "Missing ?id=<telegram numeric user id>" }, { status: 400 });
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    return NextResponse.json({
      step: "createSupabaseAdminClient",
      threw: error instanceof Error ? error.message : String(error),
    });
  }

  const linkResult = await admin
    .from("telegram_links")
    .select("profile_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  let profileResult: unknown = null;
  if (linkResult.data) {
    profileResult = await admin
      .from("profiles")
      .select("id, company_id, role")
      .eq("id", linkResult.data.profile_id)
      .maybeSingle();
  }

  return NextResponse.json({
    telegramUserId,
    supabaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    serviceRoleKeyConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    linkResult,
    profileResult,
  });
}

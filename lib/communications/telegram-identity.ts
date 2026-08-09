import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "../auth/roles";

export class UnrecognizedSenderError extends Error {
  constructor(message = "Sender is not linked to a HURKL identity") {
    super(message);
    this.name = "UnrecognizedSenderError";
  }
}

export interface TelegramSenderIdentity {
  profileId: string;
  companyId: string | null;
  role: UserRole;
}

/**
 * Resolves an inbound Telegram user id to a HURKL identity via
 * telegram_links — the pre-registered allow-list that IS
 * authentication for this channel (Telegram has no password/OAuth flow
 * for a bot DM; see docs/communications-architecture.md). Must run
 * against the service-role admin client
 * (lib/supabase/admin.ts#createSupabaseAdminClient): telegram_links has
 * RLS enabled with no policies for the ordinary `authenticated` role at
 * all, by design — this table is admin/service-role only.
 */
export async function resolveTelegramSender(
  admin: SupabaseClient,
  telegramUserId: string,
): Promise<TelegramSenderIdentity> {
  const { data: link, error: linkError } = await admin
    .from("telegram_links")
    .select("profile_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (linkError) {
    // A genuine query failure (bad grants, connectivity, etc.) is not
    // the same thing as "a stranger messaged the bot" — the former is
    // a real bug worth a server-side log; collapsing both into a
    // silent UnrecognizedSenderError is what masked a production
    // permissions incident on 2026-08-06 (see migration
    // 00000000000006_grant_table_privileges.sql).
    console.error("telegram_links lookup failed", {
      code: linkError.code,
      message: linkError.message,
    });
    throw new UnrecognizedSenderError();
  }
  if (!link) {
    throw new UnrecognizedSenderError();
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, company_id, role")
    .eq("id", link.profile_id)
    .maybeSingle();

  if (profileError) {
    console.error("profiles lookup failed", {
      code: profileError.code,
      message: profileError.message,
    });
    throw new UnrecognizedSenderError();
  }
  if (!profile) {
    throw new UnrecognizedSenderError();
  }

  return { profileId: profile.id, companyId: profile.company_id, role: profile.role };
}

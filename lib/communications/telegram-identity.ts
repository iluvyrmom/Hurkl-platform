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

  if (linkError || !link) {
    throw new UnrecognizedSenderError();
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, company_id, role")
    .eq("id", link.profile_id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new UnrecognizedSenderError();
  }

  return { profileId: profile.id, companyId: profile.company_id, role: profile.role };
}

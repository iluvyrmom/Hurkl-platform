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
    // Temporary diagnostic logging while validating the first real
    // Telegram loop end-to-end — safe to remove once confirmed working.
    // Never log this in a customer-facing path; internal-only channel.
    console.log("telegram_links lookup failed", {
      telegramUserId,
      errorMessage: linkError?.message,
      errorCode: (linkError as { code?: string } | null)?.code,
    });
    throw new UnrecognizedSenderError();
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, company_id, role")
    .eq("id", link.profile_id)
    .maybeSingle();

  if (profileError || !profile) {
    console.log("profiles lookup failed", {
      profileId: link.profile_id,
      errorMessage: profileError?.message,
      errorCode: (profileError as { code?: string } | null)?.code,
    });
    throw new UnrecognizedSenderError();
  }

  return { profileId: profile.id, companyId: profile.company_id, role: profile.role };
}

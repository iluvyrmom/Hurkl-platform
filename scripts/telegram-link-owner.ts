#!/usr/bin/env node
/**
 * `npm run telegram:link-owner -- <profile-id> <telegram-user-id> [telegram-username]`
 *
 * One-time, founder-run bootstrap: links a Telegram numeric user id to
 * an existing HURKL profile via telegram_links — the allow-list that
 * IS authentication for the Telegram channel (see
 * docs/communications-architecture.md). Deliberately not a self-service
 * or in-app flow: telegram_links has no RLS policies for the ordinary
 * `authenticated` role at all, and linking a Telegram identity to a
 * HURKL identity is a sensitive action that should stay an explicit,
 * out-of-band step, not a code path a compromised session could reach.
 *
 * The profile itself must already exist with role = 'hurkl_admin' for
 * an internal/dev conversation — see docs/communications-architecture.md
 * for the one-time manual SQL step to grant that role (deliberately not
 * automated here either, for the same reason: no code path should be
 * able to self-promote to a platform-admin role).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local — never paste it
 * into a chat session.
 */
import { createSupabaseAdminClient } from "../lib/supabase/admin.ts";

const [profileId, telegramUserId, telegramUsername] = process.argv.slice(2);

if (!profileId || !telegramUserId) {
  console.error(
    "Usage: npm run telegram:link-owner -- <profile-id> <telegram-user-id> [telegram-username]",
  );
  process.exit(1);
}

const admin = createSupabaseAdminClient();

const { error } = await admin.from("telegram_links").insert({
  profile_id: profileId,
  telegram_user_id: telegramUserId,
  telegram_username: telegramUsername ?? null,
});

if (error) {
  console.error("Failed to link Telegram account:", error.message);
  process.exit(1);
}

console.log(`Linked Telegram user ${telegramUserId} to profile ${profileId}.`);

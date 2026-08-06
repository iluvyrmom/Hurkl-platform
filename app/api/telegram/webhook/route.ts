import { NextResponse } from "next/server";
import { receiveMessage } from "../../../../lib/communications/inbound";
import { TelegramAdapter } from "../../../../lib/communications/telegram-adapter";
import { getServerEnv } from "../../../../lib/env";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";

// This route depends on live external state (the request itself, plus
// per-request Supabase/Telegram calls) and must never be statically
// cached — same reasoning as app/api/health/route.ts.
export const dynamic = "force-dynamic";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string };
    chat: { id: number };
    text?: string;
    date: number;
  };
}

/**
 * Telegram's webhook entry point — the production-shaped path (as
 * opposed to scripts/telegram-dev-bridge.ts's long-polling, used until
 * there's a public deployment to register this URL with Telegram's
 * `setWebhook`; see docs/communications-architecture.md). Both call
 * the exact same lib/communications/inbound.ts#receiveMessage — no
 * business logic lives here, only payload normalization.
 *
 * Always returns 200 once the payload is structurally handled (even a
 * dropped/unrecognized-sender message) — Telegram's own delivery
 * contract expects a fast 2xx, not per-message business outcomes.
 */
export async function POST(request: Request) {
  const env = getServerEnv();

  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const provided = request.headers.get("x-telegram-bot-api-secret-token");
    if (provided !== env.TELEGRAM_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const message = update.message;
  if (!message?.text || !message.from) {
    // Not a plain text DM (e.g. a sticker, an edited_message, a
    // channel post) — nothing for this first slice to do with it yet.
    return NextResponse.json({ ok: true, handled: false });
  }

  const admin = createSupabaseAdminClient();
  const adapter = new TelegramAdapter(env.TELEGRAM_BOT_TOKEN);

  const result = await receiveMessage(
    { admin, adapter },
    {
      channel: "telegram",
      externalUserId: String(message.from.id),
      externalConversationId: String(message.chat.id),
      text: message.text,
      receivedAt: new Date(message.date * 1000).toISOString(),
      raw: update,
    },
  );

  // Temporary diagnostic logging while validating the first real
  // Telegram loop end-to-end — safe to remove once confirmed working.
  console.log("Telegram webhook processed", {
    externalUserId: String(message.from.id),
    handled: result.handled,
  });

  return NextResponse.json({ ok: true, handled: result.handled });
}

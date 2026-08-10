#!/usr/bin/env node
/**
 * `npm run telegram:dev-bridge` — long-polls Telegram's getUpdates and
 * feeds each message into the exact same lib/communications/inbound.ts
 * pipeline app/api/telegram/webhook/route.ts uses. This is what makes
 * the Telegram loop genuinely live today, before any public deployment
 * exists to register a real webhook against (see
 * docs/communications-architecture.md). Manual dev tool only — never
 * run in CI, never deployed; Ctrl+C to stop.
 *
 * Requires TELEGRAM_BOT_TOKEN and the real Supabase project's
 * NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local —
 * set these yourself, never paste them into a chat session.
 */
import { receiveMessage } from "../lib/communications/inbound.ts";
import { TelegramAdapter } from "../lib/communications/telegram-adapter.ts";
import { getServerEnv } from "../lib/env.ts";
import { getAIModelProvider } from "../lib/mason/providers/get-ai-model-provider.ts";
import { createSupabaseAdminClient } from "../lib/supabase/admin.ts";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number };
    chat: { id: number };
    text?: string;
    date: number;
  };
}

interface GetUpdatesResponse {
  ok: boolean;
  result: TelegramUpdate[];
}

const env = getServerEnv();
if (!env.TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is not set — see .env.example.");
  process.exit(1);
}

const admin = createSupabaseAdminClient();
const adapter = new TelegramAdapter(env.TELEGRAM_BOT_TOKEN);
const aiModel = getAIModelProvider();

let offset = 0;
console.log("Telegram dev bridge running — Ctrl+C to stop.");

for (;;) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates?timeout=30&offset=${offset}`,
  );
  const body = (await response.json()) as GetUpdatesResponse;

  if (!body.ok) {
    console.error("getUpdates failed", body);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    continue;
  }

  for (const update of body.result) {
    offset = update.update_id + 1;

    const message = update.message;
    if (!message?.text || !message.from) continue;

    const result = await receiveMessage(
      { admin, adapter, aiModel },
      {
        channel: "telegram",
        externalUserId: String(message.from.id),
        externalConversationId: String(message.chat.id),
        externalMessageId: String(message.message_id),
        text: message.text,
        receivedAt: new Date(message.date * 1000).toISOString(),
        raw: update,
      },
    );

    console.log(result.handled ? "handled message" : "dropped message from unrecognized sender");
  }
}

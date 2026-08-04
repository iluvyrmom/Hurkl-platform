import { getServerEnv } from "../env";
import type { CommunicationAdapter, OutboundMessage, OutboundSendResult } from "./adapter";

interface TelegramSendMessageResponse {
  ok: boolean;
  description?: string;
  result?: { message_id: number };
}

/**
 * Real Telegram Bot API client, behind the same CommunicationAdapter
 * interface every channel implements. Plain `fetch` against Telegram's
 * HTTP API — no SDK dependency, matching this repo's lightweight
 * provider style (e.g. lib/supabase/admin.ts).
 *
 * Only ever constructed when TELEGRAM_BOT_TOKEN is actually set —
 * callers should use MockCommunicationAdapter otherwise (see
 * lib/communications/inbound.ts's default), the same "mock until
 * credentials are supplied" pattern every other provider in this repo
 * follows.
 */
export class TelegramAdapter implements CommunicationAdapter {
  public readonly channel = "telegram" as const;

  private readonly botToken: string;

  constructor(botToken?: string) {
    const token = botToken ?? getServerEnv().TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error(
        "TelegramAdapter requires TELEGRAM_BOT_TOKEN (see .env.example). Use MockCommunicationAdapter until a real bot token is configured.",
      );
    }
    this.botToken = token;
  }

  async send(message: OutboundMessage): Promise<OutboundSendResult> {
    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: message.externalConversationId,
        text: message.text,
      }),
    });

    const body = (await response.json()) as TelegramSendMessageResponse;

    if (!response.ok || !body.ok || !body.result) {
      // Never surface Telegram's raw description outside a server log —
      // it can echo back request details. Log server-side only.
      console.error("Telegram sendMessage failed", { status: response.status, body });
      throw new Error("Failed to send Telegram message");
    }

    return { externalMessageId: String(body.result.message_id) };
  }
}

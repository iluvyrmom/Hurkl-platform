import { beforeEach, describe, expect, it, vi } from "vitest";

const receiveMessage = vi.fn();
vi.mock("../../../../lib/communications/inbound", () => ({ receiveMessage }));

vi.mock("../../../../lib/communications/telegram-adapter", () => ({
  TelegramAdapter: class {
    channel = "telegram" as const;
    send = vi.fn();
  },
}));

vi.mock("../../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn().mockReturnValue({}),
}));

const getServerEnv = vi.fn();
vi.mock("../../../../lib/env", () => ({ getServerEnv: () => getServerEnv() }));

async function importRoute() {
  return import("./route");
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const TEXT_UPDATE = {
  update_id: 1,
  message: {
    message_id: 42,
    from: { id: 555000111, username: "founder" },
    chat: { id: 999 },
    text: "status check",
    date: 1_700_000_000,
  },
};

beforeEach(() => {
  receiveMessage.mockReset();
  receiveMessage.mockResolvedValue({ handled: true });
  getServerEnv.mockReset();
  getServerEnv.mockReturnValue({ TELEGRAM_BOT_TOKEN: "test-token" });
});

describe("POST /api/telegram/webhook", () => {
  it("rejects the request when TELEGRAM_WEBHOOK_SECRET is set and the header doesn't match", async () => {
    getServerEnv.mockReturnValue({
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_WEBHOOK_SECRET: "s3cret",
    });
    const { POST } = await importRoute();

    const response = await POST(jsonRequest(TEXT_UPDATE));

    expect(response.status).toBe(401);
    expect(receiveMessage).not.toHaveBeenCalled();
  });

  it("accepts the request when the secret header matches", async () => {
    getServerEnv.mockReturnValue({
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_WEBHOOK_SECRET: "s3cret",
    });
    const { POST } = await importRoute();

    const response = await POST(
      jsonRequest(TEXT_UPDATE, { "x-telegram-bot-api-secret-token": "s3cret" }),
    );

    expect(response.status).toBe(200);
    expect(receiveMessage).toHaveBeenCalledTimes(1);
  });

  it("normalizes a text message into InboundMessage and calls the shared pipeline", async () => {
    const { POST } = await importRoute();

    await POST(jsonRequest(TEXT_UPDATE));

    expect(receiveMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        channel: "telegram",
        externalUserId: "555000111",
        externalConversationId: "999",
        text: "status check",
      }),
    );
  });

  it("returns handled:false and skips the pipeline for a non-text update", async () => {
    const { POST } = await importRoute();

    const response = await POST(jsonRequest({ update_id: 2, message: { chat: { id: 1 } } }));
    const body = (await response.json()) as { ok: boolean; handled: boolean };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, handled: false });
    expect(receiveMessage).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON", async () => {
    const { POST } = await importRoute();

    const response = await POST(
      new Request("http://localhost/api/telegram/webhook", { method: "POST", body: "not json" }),
    );

    expect(response.status).toBe(400);
  });
});

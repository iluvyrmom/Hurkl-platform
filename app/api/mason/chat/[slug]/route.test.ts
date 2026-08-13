import { beforeEach, describe, expect, it, vi } from "vitest";

const receiveMessage = vi.fn();
vi.mock("../../../../../lib/communications/inbound", async () => {
  const actual = await vi.importActual<typeof import("../../../../../lib/communications/inbound")>(
    "../../../../../lib/communications/inbound",
  );
  return { ...actual, receiveMessage: (...args: unknown[]) => receiveMessage(...args) };
});

vi.mock("../../../../../lib/mason/providers/get-ai-model-provider", () => ({
  getAIModelProvider: () => ({ complete: vi.fn() }),
}));

let companyLookupResult: { data: { id: string } | null; error: { message: string } | null } = {
  data: { id: "company-a1" },
  error: null,
};
const fakeAdmin = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => companyLookupResult,
      }),
    }),
  }),
};
vi.mock("../../../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => fakeAdmin,
}));

async function importRoute() {
  return import("./route");
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/mason/chat/a1-best-moving", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function paramsFor(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

const VALID_BODY = { conversationId: "session-1", message: "how much for 2 movers?" };

beforeEach(() => {
  receiveMessage.mockReset();
  receiveMessage.mockImplementation(async (deps: { adapter: { send: (m: unknown) => Promise<unknown> } }, inbound: { channel: string; externalConversationId: string }) => {
    await deps.adapter.send({
      channel: inbound.channel,
      externalConversationId: inbound.externalConversationId,
      text: "Mason's reply",
    });
    return { handled: true };
  });
  companyLookupResult = { data: { id: "company-a1" }, error: null };
});

describe("POST /api/mason/chat/[slug]", () => {
  it("returns 404 when the slug doesn't match a real company", async () => {
    companyLookupResult = { data: null, error: null };
    const { POST } = await importRoute();
    const response = await POST(jsonRequest(VALID_BODY, { "x-forwarded-for": "1.1.1.1" }), paramsFor("nope"));
    expect(response.status).toBe(404);
    expect(receiveMessage).not.toHaveBeenCalled();
  });

  it("returns 400 when conversationId is missing", async () => {
    const { POST } = await importRoute();
    const response = await POST(
      jsonRequest({ message: "hi" }, { "x-forwarded-for": "1.1.1.2" }),
      paramsFor("a1-best-moving"),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when message is missing", async () => {
    const { POST } = await importRoute();
    const response = await POST(
      jsonRequest({ conversationId: "session-1" }, { "x-forwarded-for": "1.1.1.3" }),
      paramsFor("a1-best-moving"),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when the message is too long", async () => {
    const { POST } = await importRoute();
    const response = await POST(
      jsonRequest(
        { conversationId: "session-1", message: "x".repeat(2001) },
        { "x-forwarded-for": "1.1.1.4" },
      ),
      paramsFor("a1-best-moving"),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 on invalid JSON", async () => {
    const { POST } = await importRoute();
    const response = await POST(
      new Request("http://localhost/api/mason/chat/a1-best-moving", {
        method: "POST",
        body: "not json",
      }),
      paramsFor("a1-best-moving"),
    );
    expect(response.status).toBe(400);
  });

  it("returns Mason's reply on success", async () => {
    const { POST } = await importRoute();
    const response = await POST(jsonRequest(VALID_BODY, { "x-forwarded-for": "2.2.2.2" }), paramsFor("a1-best-moving"));
    const body = (await response.json()) as { reply: string; leadSubmitted: boolean };

    expect(response.status).toBe(200);
    expect(body.reply).toBe("Mason's reply");
    expect(body.leadSubmitted).toBe(false);
    expect(receiveMessage).toHaveBeenCalledTimes(1);
    const [, inbound] = receiveMessage.mock.calls[0];
    expect(inbound).toMatchObject({
      channel: "web_public",
      companyId: "company-a1",
      companySlug: "a1-best-moving",
      externalConversationId: "session-1",
    });
  });

  it("reports leadSubmitted when the pipeline returns a leadId", async () => {
    receiveMessage.mockImplementation(async (deps: { adapter: { send: (m: unknown) => Promise<unknown> } }, inbound: { channel: string; externalConversationId: string }) => {
      await deps.adapter.send({
        channel: inbound.channel,
        externalConversationId: inbound.externalConversationId,
        text: "Got it, submitted!",
      });
      return { handled: true, leadId: "lead-1" };
    });

    const { POST } = await importRoute();
    const response = await POST(jsonRequest(VALID_BODY, { "x-forwarded-for": "3.3.3.3" }), paramsFor("a1-best-moving"));
    const body = (await response.json()) as { leadSubmitted: boolean };
    expect(body.leadSubmitted).toBe(true);
  });

  it("maps an unhandled pipeline result to a generic 500", async () => {
    receiveMessage.mockResolvedValueOnce({ handled: false });
    const { POST } = await importRoute();
    const response = await POST(jsonRequest(VALID_BODY, { "x-forwarded-for": "4.4.4.4" }), paramsFor("a1-best-moving"));
    expect(response.status).toBe(500);
  });

  it("maps an unexpected error to a generic 500 without leaking internals", async () => {
    receiveMessage.mockRejectedValueOnce(new Error("relation messages does not exist"));
    const { POST } = await importRoute();
    const response = await POST(jsonRequest(VALID_BODY, { "x-forwarded-for": "5.5.5.5" }), paramsFor("a1-best-moving"));
    const body = (await response.json()) as { error: string };
    expect(response.status).toBe(500);
    expect(body.error).not.toMatch(/relation/i);
  });

  it("rate-limits repeated messages from the same IP", async () => {
    const { POST } = await importRoute();
    const ip = "10.0.0.9";

    for (let i = 0; i < 30; i++) {
      const response = await POST(jsonRequest(VALID_BODY, { "x-forwarded-for": ip }), paramsFor("a1-best-moving"));
      expect(response.status).toBe(200);
    }

    const nextOne = await POST(jsonRequest(VALID_BODY, { "x-forwarded-for": ip }), paramsFor("a1-best-moving"));
    expect(nextOne.status).toBe(429);
  });
});

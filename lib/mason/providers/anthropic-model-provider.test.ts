import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicModelProvider } from "./anthropic-model-provider";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SUCCESS_BODY = {
  content: [{ type: "text", text: "Hi there!" }],
  usage: { input_tokens: 42, output_tokens: 8 },
};

describe("AnthropicModelProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("throws when constructed with no API key and none in the environment", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => new AnthropicModelProvider(undefined)).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("sends the low_cost tier's model with no thinking/effort params, and maps the response", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, SUCCESS_BODY));

    const provider = new AnthropicModelProvider("test-key");
    const response = await provider.complete({
      tier: "low_cost",
      systemPrompt: "You are Mason.",
      userMessage: "What are your hours?",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init?.headers).toMatchObject({ "x-api-key": "test-key" });

    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("claude-haiku-4-5");
    expect(body.thinking).toBeUndefined();
    expect(body.output_config).toBeUndefined();
    expect(body.messages).toEqual([{ role: "user", content: "What are your hours?" }]);

    expect(response.text).toBe("Hi there!");
    expect(response.modelId).toBe("claude-haiku-4-5");
    expect(response.inputTokens).toBe(42);
    expect(response.outputTokens).toBe(8);
    expect(response.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("sends the advanced_reasoning tier's model with adaptive thinking and effort", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, SUCCESS_BODY));

    const provider = new AnthropicModelProvider("test-key");
    await provider.complete({
      tier: "advanced_reasoning",
      systemPrompt: "You are Mason.",
      userMessage: "Should we raise prices?",
    });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.model).toBe("claude-sonnet-5");
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body.output_config).toEqual({ effort: "medium" });
  });

  it("includes truncated history turns in the messages array, oldest first", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, SUCCESS_BODY));

    const provider = new AnthropicModelProvider("test-key");
    await provider.complete({
      tier: "low_cost",
      systemPrompt: "You are Mason.",
      userMessage: "second",
      history: [
        { role: "user", text: "first" },
        { role: "assistant", text: "ok" },
      ],
    });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.messages).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "second" },
    ]);
  });

  it("truncates an oversized user message before sending", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, SUCCESS_BODY));

    const provider = new AnthropicModelProvider("test-key");
    await provider.complete({
      tier: "low_cost",
      systemPrompt: "You are Mason.",
      userMessage: "x".repeat(10_000),
    });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.messages[0].content.length).toBeLessThan(5000);
    expect(body.messages[0].content).toMatch(/truncated/);
  });

  it("retries once on a 500 and succeeds on the second attempt", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { error: { type: "api_error", message: "boom" } }))
      .mockResolvedValueOnce(jsonResponse(200, SUCCESS_BODY));

    const provider = new AnthropicModelProvider("test-key");
    const response = await provider.complete({
      tier: "low_cost",
      systemPrompt: "sys",
      userMessage: "hi",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.text).toBe("Hi there!");
  });

  it("does not retry on a 400 and throws immediately", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: { type: "invalid_request_error", message: "bad" } }),
    );

    const provider = new AnthropicModelProvider("test-key");
    await expect(
      provider.complete({ tier: "low_cost", systemPrompt: "sys", userMessage: "hi" }),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries on repeated 500s", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse(500, { error: { type: "api_error", message: "boom" } }),
    );

    const provider = new AnthropicModelProvider("test-key");
    await expect(
      provider.complete({ tier: "low_cost", systemPrompt: "sys", userMessage: "hi" }),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });
});

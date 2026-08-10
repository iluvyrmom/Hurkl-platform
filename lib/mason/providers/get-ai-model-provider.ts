import { getServerEnv } from "../../env";
import { AnthropicModelProvider } from "./anthropic-model-provider";
import { MockAIModelProvider, type AIModelProvider } from "./ai-model-provider";

/**
 * The one place that decides whether Mason's real reasoning is active.
 * Real reasoning requires ANTHROPIC_API_KEY — the same "mock until
 * credentials are supplied" pattern every provider in this repo
 * follows. Every entry point (the Telegram webhook route, the dev
 * bridge script, and any future channel) calls this instead of
 * constructing a provider itself, so there is exactly one place that
 * decides real vs. mock.
 */
export function getAIModelProvider(): AIModelProvider {
  const apiKey = getServerEnv().ANTHROPIC_API_KEY;
  return apiKey ? new AnthropicModelProvider(apiKey) : new MockAIModelProvider();
}

import { getServerEnv } from "../../env";
import { estimateCostUsd, getModelConfig } from "../model-config";
import type { AIModelProvider, AIModelRequest, AIModelResponse } from "./ai-model-provider";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 1;

// Cost control: bounds input size independent of any limit enforced
// earlier in the pipeline (see lib/communications/inbound.ts) — the
// last line of defense against an unbounded Anthropic bill from one
// oversized message or a long history.
const MAX_USER_MESSAGE_CHARS = 4000;
const MAX_HISTORY_TURN_CHARS = 2000;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponseBody {
  content?: AnthropicContentBlock[];
  usage?: { input_tokens: number; output_tokens: number };
  error?: { type: string; message: string };
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}… [truncated]` : text;
}

/** Thrown for transient failures (timeout, 429, 5xx) — the only cases retried. */
class RetryableAnthropicError extends Error {}

/**
 * Real Anthropic Claude provider, behind the same AIModelProvider
 * interface every other provider implements. Plain fetch — no SDK
 * dependency, matching this repo's lightweight-provider style (e.g.
 * lib/communications/telegram-adapter.ts).
 *
 * Only ever constructed when ANTHROPIC_API_KEY is set — see
 * lib/mason/providers/get-ai-model-provider.ts, the one place that
 * decides real vs. mock (the same "mock until credentials are
 * supplied" pattern every provider in this repo follows).
 *
 * Cost controls (see docs/communications-architecture.md's "Real Mason
 * reasoning" section): model selection is entirely tier-driven
 * (lib/mason/model-config.ts is the only place a tier maps to a real
 * model ID — never hardcoded per call site), output tokens are capped
 * per tier, input is truncated (current message and each history
 * turn), requests time out and retry at most once (network/5xx/429
 * only, never on 4xx — no retry storm), and every response reports
 * real token usage and an estimated cost for the caller to log and
 * attribute per company.
 */
export class AnthropicModelProvider implements AIModelProvider {
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    const key = apiKey ?? getServerEnv().ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "AnthropicModelProvider requires ANTHROPIC_API_KEY (see .env.example). Use MockAIModelProvider until a real key is configured.",
      );
    }
    this.apiKey = key;
  }

  async complete(request: AIModelRequest): Promise<AIModelResponse> {
    const config = getModelConfig(request.tier);
    const maxOutputTokens = request.maxOutputTokens ?? config.maxOutputTokens;

    const messages: AnthropicMessage[] = [
      ...(request.history ?? []).map((turn) => ({
        role: turn.role,
        content: truncate(turn.text, MAX_HISTORY_TURN_CHARS),
      })),
      { role: "user" as const, content: truncate(request.userMessage, MAX_USER_MESSAGE_CHARS) },
    ];

    const body: Record<string, unknown> = {
      model: config.modelId,
      max_tokens: maxOutputTokens,
      system: request.systemPrompt,
      messages,
    };
    // Haiku-tier models reject thinking/effort entirely — only set
    // these for tiers whose model actually supports them.
    if (config.supportsEffort) {
      body.thinking = { type: "adaptive" };
      body.output_config = { effort: config.effort ?? "medium" };
    }

    const startedAt = Date.now();
    const response = await this.sendWithRetry(body);
    const latencyMs = Date.now() - startedAt;

    const textBlock = response.content?.find((block) => block.type === "text");
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;

    return {
      text: textBlock?.text ?? "",
      tier: request.tier,
      modelId: config.modelId,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCostUsd(request.tier, inputTokens, outputTokens),
      latencyMs,
    };
  }

  private async sendWithRetry(body: Record<string, unknown>): Promise<AnthropicResponseBody> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.sendOnce(body);
      } catch (error) {
        lastError = error;
        if (!(error instanceof RetryableAnthropicError) || attempt === MAX_RETRIES) {
          throw error;
        }
      }
    }
    throw lastError;
  }

  private async sendOnce(body: Record<string, unknown>): Promise<AnthropicResponseBody> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const parsed = (await response.json()) as AnthropicResponseBody;

      if (!response.ok) {
        // Never log the raw error message outside a server log — it
        // can echo request details. Status + error type is enough to
        // debug without risking a prompt/secret leak into logs.
        console.error("Anthropic request failed", {
          status: response.status,
          errorType: parsed.error?.type,
        });
        if (response.status === 429 || response.status >= 500) {
          throw new RetryableAnthropicError(`Anthropic request failed: ${response.status}`);
        }
        throw new Error(`Anthropic request failed: ${response.status}`);
      }

      return parsed;
    } catch (error) {
      if (error instanceof RetryableAnthropicError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new RetryableAnthropicError("Anthropic request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

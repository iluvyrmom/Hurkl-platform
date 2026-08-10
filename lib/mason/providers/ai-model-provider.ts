import type { ModelTier } from "../model-routing";

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AIModelRequest {
  tier: ModelTier;
  systemPrompt: string;
  userMessage: string;
  /** Prior turns, oldest first, already bounded by the caller (see lib/communications/inbound.ts). Real providers use this for multi-turn context; MockAIModelProvider ignores it. */
  history?: ConversationTurn[];
  maxOutputTokens?: number;
}

export interface AIModelResponse {
  text: string;
  tier: ModelTier;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  /** Rough cost estimate in USD for this request — see lib/mason/model-config.ts. Not billing-accurate. */
  estimatedCostUsd: number;
  latencyMs: number;
}

/**
 * Provider-independent interface (see ARCHITECTURE.md's provider-
 * independence requirement). The real implementation
 * (lib/mason/providers/anthropic-model-provider.ts) is wired up when
 * ANTHROPIC_API_KEY is configured — see
 * lib/mason/providers/get-ai-model-provider.ts.
 */
export interface AIModelProvider {
  complete(request: AIModelRequest): Promise<AIModelResponse>;
}

/**
 * Makes zero network calls, costs nothing, fully deterministic. Used
 * until a real provider is wired and explicitly activated.
 */
export class MockAIModelProvider implements AIModelProvider {
  public readonly requests: AIModelRequest[] = [];

  async complete(request: AIModelRequest): Promise<AIModelResponse> {
    this.requests.push(request);
    return {
      text: `[mock ${request.tier} response] ${request.userMessage}`,
      tier: request.tier,
      modelId: "mock",
      inputTokens: request.systemPrompt.length + request.userMessage.length,
      outputTokens: 0,
      estimatedCostUsd: 0,
      latencyMs: 0,
    };
  }
}

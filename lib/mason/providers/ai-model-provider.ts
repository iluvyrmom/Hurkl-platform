import type { ModelTier } from "../model-routing";

export interface AIModelRequest {
  tier: ModelTier;
  systemPrompt: string;
  userMessage: string;
  maxOutputTokens?: number;
}

export interface AIModelResponse {
  text: string;
  tier: ModelTier;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Provider-independent interface (see ARCHITECTURE.md's provider-
 * independence requirement). The real implementation (Anthropic Claude,
 * behind this same interface) is wired up when ANTHROPIC_API_KEY is
 * configured and a specific milestone authorizes it — see
 * lib/env.ts's ServerEnv.ANTHROPIC_API_KEY (Phase 6).
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
      inputTokens: request.systemPrompt.length + request.userMessage.length,
      outputTokens: 0,
    };
  }
}

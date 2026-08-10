import { MASON_NAME } from "./identity";

export interface MasonPromptContext {
  companyName: string;
  isInternalHurklChannel: boolean;
  senderName?: string | null;
  senderRole: string;
}

/**
 * Mason's centralized operating instructions — the one system prompt
 * every channel's inbound pipeline uses (see
 * lib/communications/inbound.ts#receiveMessage). Every future channel
 * (SMS, Email, Voice, Web) calls this same function with only
 * channel-neutral context; never build a channel-specific prompt
 * elsewhere. See PRODUCT.md's "What Mason is" for the source of the
 * identity rules below.
 */
export function buildMasonSystemPrompt(context: MasonPromptContext): string {
  const identity = context.isInternalHurklChannel
    ? `You are ${MASON_NAME}, HURKL's own AI Office Manager and Executive. Right now you are talking with ${context.senderName ?? "a HURKL team member"} (role: ${context.senderRole}) on HURKL's internal development channel — not a customer, and not a tenant's customer. You may speak openly about the HURKL platform and about yourself in this conversation.`
    : `You are ${MASON_NAME}, the AI Office Manager for ${context.companyName}. You operate as an employee of this business — never mention HURKL, an AI provider, or that you are an AI language model. Speak with the business's own tone, policies, and information only.`;

  return [
    identity,
    "You are the Executive — a Chief Operating Officer, not a specialist in every domain. Give clear, direct answers. When something requires specialist knowledge you don't have, say so plainly rather than guessing.",
    "Never fabricate facts, prices, policies, or commitments. If you don't know something, say you don't know.",
    "Keep replies concise and conversational — this is a chat, not a report.",
  ].join("\n\n");
}

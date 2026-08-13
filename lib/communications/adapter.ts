/**
 * Channel-agnostic communication interfaces. See
 * docs/communications-architecture.md and ARCHITECTURE.md §3's Channel
 * Gateways.
 *
 * `CommunicationAdapter` is outbound-only (send) by design: inbound
 * delivery is inherently channel-specific — a webhook push (Telegram,
 * SMS), a live audio stream (Voice), an HTTP request/response (Web) —
 * so each channel gets its own thin entry point that normalizes into
 * `InboundMessage` and calls the one shared pipeline
 * (lib/communications/inbound.ts) rather than the adapter interface
 * itself. This is the pattern every future channel implements —
 * Telegram is the first, not a special case.
 */

export type Channel = "telegram" | "web_public";

export interface InboundMessage {
  channel: Channel;
  /** The sending user's identity in the channel's own namespace — e.g. a Telegram numeric user id, as a string. For web_public (anonymous, no linked identity) this is the same client-generated conversation id as externalConversationId. */
  externalUserId: string;
  /** The channel's own conversation/thread identifier — e.g. a Telegram chat id. */
  externalConversationId: string;
  /** The channel's own message identifier, when it has one — e.g. Telegram's message_id. Used for duplicate-delivery protection (see lib/communications/inbound.ts); omit if the channel doesn't supply one. */
  externalMessageId?: string;
  text: string;
  receivedAt: string;
  /** The original channel payload, kept only for audit-log metadata — never parsed by shared pipeline code. */
  raw?: unknown;
  /**
   * Required for anonymous channels (web_public) that resolve their
   * company directly (by public slug, already known to the caller)
   * rather than via a linked sender identity like Telegram's
   * telegram_links. Ignored for identity-linked channels.
   */
  companyId?: string;
  /** Required alongside companyId for web_public — used only to submit a lead via submit_lead()'s existing slug-based contract once Mason has gathered enough (see lib/communications/inbound.ts). */
  companySlug?: string;
}

export interface OutboundMessage {
  channel: Channel;
  externalConversationId: string;
  text: string;
}

export interface OutboundSendResult {
  externalMessageId: string;
}

export interface CommunicationAdapter {
  readonly channel: Channel;
  send(message: OutboundMessage): Promise<OutboundSendResult>;
}

/**
 * Makes zero network calls, costs nothing, fully deterministic — the
 * default in tests and anywhere a real channel isn't configured yet.
 * Generic across channels (unlike the narrower MockTelegramProvider it
 * replaces), since the interface itself is channel-agnostic.
 */
export class MockCommunicationAdapter implements CommunicationAdapter {
  public readonly sentMessages: OutboundMessage[] = [];

  constructor(public readonly channel: Channel) {}

  async send(message: OutboundMessage): Promise<OutboundSendResult> {
    this.sentMessages.push(message);
    return { externalMessageId: `mock-${this.channel}-${this.sentMessages.length}` };
  }
}

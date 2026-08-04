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

export type Channel = "telegram";

export interface InboundMessage {
  channel: Channel;
  /** The sending user's identity in the channel's own namespace — e.g. a Telegram numeric user id, as a string. */
  externalUserId: string;
  /** The channel's own conversation/thread identifier — e.g. a Telegram chat id. */
  externalConversationId: string;
  text: string;
  receivedAt: string;
  /** The original channel payload, kept only for audit-log metadata — never parsed by shared pipeline code. */
  raw?: unknown;
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

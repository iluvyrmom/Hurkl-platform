import type { NotificationProvider } from "./types";
import { MockNotificationProvider } from "./mock-provider";

export type { NotificationProvider, QuoteDeliveryResult } from "./types";

/**
 * Real Twilio (SMS) / Resend (email) adapters are future work — this ships
 * the interface plus an honest mock (logs, doesn't send) so the quote-send
 * UI can be built and tested end-to-end before either provider is wired.
 */
export function getNotificationProvider(): NotificationProvider {
  return new MockNotificationProvider();
}

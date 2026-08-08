import type { NotificationProvider, QuoteDeliveryResult } from "./types";

/** Logs instead of sending. Default until Twilio/Resend keys are configured. */
export class MockNotificationProvider implements NotificationProvider {
  readonly name = "mock";

  async sendQuoteSms(toPhone: string, quoteUrl: string): Promise<QuoteDeliveryResult> {
    console.info(`[mock-notifications] would SMS ${toPhone}: ${quoteUrl}`);
    return { provider: this.name, channel: "sms", delivered: false, messageId: null };
  }

  async sendQuoteEmail(toEmail: string, quoteUrl: string): Promise<QuoteDeliveryResult> {
    console.info(`[mock-notifications] would email ${toEmail}: ${quoteUrl}`);
    return { provider: this.name, channel: "email", delivered: false, messageId: null };
  }
}

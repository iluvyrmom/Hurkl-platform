export interface QuoteDeliveryResult {
  provider: string;
  channel: "sms" | "email";
  delivered: boolean;
  messageId: string | null;
}

/** Abstraction over sending a customer their quote — SMS and/or email. */
export interface NotificationProvider {
  readonly name: string;
  sendQuoteSms(toPhone: string, quoteUrl: string): Promise<QuoteDeliveryResult>;
  sendQuoteEmail(toEmail: string, quoteUrl: string): Promise<QuoteDeliveryResult>;
}

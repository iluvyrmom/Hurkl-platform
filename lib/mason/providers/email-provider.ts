export interface EmailAttachment {
  filename: string;
  contentType: string;
  contentBase64: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  bodyText: string;
  attachments?: readonly EmailAttachment[];
}

export interface EmailSendResult {
  messageId: string;
}

/**
 * Provider-independent interface for transactional email (invoice
 * delivery, receipts, reminders — see Skill 5 and Skill 8). RESEND_API_KEY
 * is anticipated in lib/env.ts (Phase 9) but not wired here yet — mock
 * only, per explicit founder decision, until credentials exist and
 * activation is separately approved.
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export class MockEmailProvider implements EmailProvider {
  public readonly sentMessages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.sentMessages.push(message);
    return { messageId: `mock-email-${this.sentMessages.length}` };
  }
}

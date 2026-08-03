export interface TelegramMessage {
  chatId: string;
  text: string;
}

export interface TelegramSendResult {
  messageId: string;
}

/**
 * Provider-independent interface for the Telegram channel described in
 * the founder's master prompt. No real Telegram bot token is wired up
 * yet — per explicit founder decision, this stays mock-only until
 * credentials are supplied and activating it is separately approved
 * (see CLAUDE.md's cost/paid-infrastructure policy).
 */
export interface TelegramProvider {
  sendMessage(message: TelegramMessage): Promise<TelegramSendResult>;
}

export class MockTelegramProvider implements TelegramProvider {
  public readonly sentMessages: TelegramMessage[] = [];

  async sendMessage(message: TelegramMessage): Promise<TelegramSendResult> {
    this.sentMessages.push(message);
    return { messageId: `mock-telegram-${this.sentMessages.length}` };
  }
}

import type { OCRProvider, ReceiptOCRResult } from "./types";

/** Default provider: never fabricates extracted numbers, always defers to manual entry. */
export class MockOCRProvider implements OCRProvider {
  readonly name = "mock";

  async extractReceiptData(): Promise<ReceiptOCRResult> {
    return {
      provider: this.name,
      rawText: null,
      receiptFormat: "unknown",
      facilityNameGuess: null,
      ticketNumber: null,
      receiptDate: null,
      receiptTime: null,
      grossWeightLbs: null,
      tareWeightLbs: null,
      netWeightLbs: null,
      amountCharged: null,
      requiresManualReview: true,
    };
  }
}

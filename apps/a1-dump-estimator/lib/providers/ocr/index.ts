import type { OCRProvider } from "./types";
import { MockOCRProvider } from "./mock-provider";

export type { OCRProvider, ReceiptOCRResult } from "./types";

/**
 * No real OCR backend is wired yet (future: Google Cloud Vision, AWS
 * Textract, etc., behind this same interface) — Phase 1 ships the
 * abstraction and the honest mock so completion/receipt UI can be built
 * now without waiting on a provider decision.
 */
export function getOCRProvider(): OCRProvider {
  return new MockOCRProvider();
}

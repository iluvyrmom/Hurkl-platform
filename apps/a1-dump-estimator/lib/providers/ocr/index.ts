import type { OCRProvider } from "./types";
import { MockOCRProvider } from "./mock-provider";
import { OpenAIReceiptOCRProvider } from "./openai-provider";

export type { OCRProvider, ReceiptOCRResult } from "./types";

export function getOCRProvider(): OCRProvider {
  const selected = process.env.OCR_PROVIDER ?? "mock";
  switch (selected) {
    case "openai":
      return new OpenAIReceiptOCRProvider();
    case "mock":
    default:
      return new MockOCRProvider();
  }
}

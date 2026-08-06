import { ProviderNotConfiguredError } from "../errors";
import type { OCRProvider, ReceiptOCRResult } from "./types";

/**
 * OpenAI Vision-backed document extraction. Requires OPENAI_API_KEY. No
 * dedicated OCR service (Google Cloud Vision, AWS Textract) is connected in
 * this environment, so this reuses the same vision-capable chat completion
 * approach as the photo-analysis provider, prompted for structured receipt
 * fields instead of junk-item detection.
 *
 * IMPORTANT: not executed against a live API key in this environment — see
 * the same caveat in photo-analysis/openai-vision-provider.ts. Verify
 * against current OpenAI API docs and test with a real key and a real dump
 * receipt photo before relying on it.
 */
export class OpenAIReceiptOCRProvider implements OCRProvider {
  readonly name = "openai";

  private readonly apiKey: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ProviderNotConfiguredError("OpenAIReceiptOCRProvider", ["OPENAI_API_KEY"]);
    }
    this.apiKey = apiKey;
  }

  async extractReceiptData(imageUrl: string): Promise<ReceiptOCRResult> {
    const prompt = [
      "You are reading a scale ticket or dump-facility receipt for a junk-removal business.",
      "Extract exactly what is printed — never estimate or guess a value that isn't legible.",
      "Respond with strict JSON only:",
      '{"rawText":string,"facilityNameGuess":string|null,"ticketNumber":string|null,',
      '"receiptDate":string|null,"receiptTime":string|null,"grossWeightLbs":number|null,',
      '"tareWeightLbs":number|null,"netWeightLbs":number|null,"amountCharged":number|null}',
      "receiptDate must be ISO format (YYYY-MM-DD) if present, receiptTime as HH:MM 24-hour.",
      "Use null for any field that is not clearly legible on the receipt.",
    ].join(" ");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI OCR request failed (${response.status}): ${await response.text()}`);
    }

    const payload = await response.json();
    const content: string | undefined = payload?.choices?.[0]?.message?.content;
    if (!content) {
      return this.emptyResult();
    }

    const parsed = JSON.parse(content) as Omit<ReceiptOCRResult, "provider" | "requiresManualReview">;

    // Assistive only, always — even a fully-populated read requires human
    // confirmation before it's trusted for the job's official record (see
    // DumpReceiptRecord.verifiedByUserId).
    return {
      provider: this.name,
      rawText: parsed.rawText ?? null,
      facilityNameGuess: parsed.facilityNameGuess ?? null,
      ticketNumber: parsed.ticketNumber ?? null,
      receiptDate: parsed.receiptDate ?? null,
      receiptTime: parsed.receiptTime ?? null,
      grossWeightLbs: parsed.grossWeightLbs ?? null,
      tareWeightLbs: parsed.tareWeightLbs ?? null,
      netWeightLbs: parsed.netWeightLbs ?? null,
      amountCharged: parsed.amountCharged ?? null,
      requiresManualReview: true,
    };
  }

  private emptyResult(): ReceiptOCRResult {
    return {
      provider: this.name,
      rawText: null,
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

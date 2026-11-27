import { describe, expect, it } from "vitest";
import { hashReceiptImage } from "./duplicate-detection";

describe("hashReceiptImage", () => {
  it("produces the same hash for the same image bytes", () => {
    const dataUrl = "data:image/png;base64,aGVsbG8gd29ybGQ=";
    expect(hashReceiptImage(dataUrl)).toBe(hashReceiptImage(dataUrl));
  });

  it("produces different hashes for different image bytes", () => {
    const a = "data:image/png;base64,aGVsbG8gd29ybGQ=";
    const b = "data:image/png;base64,Z29vZGJ5ZSB3b3JsZA==";
    expect(hashReceiptImage(a)).not.toBe(hashReceiptImage(b));
  });

  it("handles a bare base64 payload without a data: URL prefix", () => {
    const withPrefix = "data:image/png;base64,aGVsbG8=";
    const withoutPrefix = "aGVsbG8=";
    expect(hashReceiptImage(withPrefix)).toBe(hashReceiptImage(withoutPrefix));
  });

  it("returns a 64-character hex SHA-256 digest", () => {
    const hash = hashReceiptImage("data:image/png;base64,aGVsbG8=");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

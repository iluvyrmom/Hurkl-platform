import { describe, expect, it } from "vitest";
import { parseLeadReadyMarker } from "./lead-intake";

describe("parseLeadReadyMarker", () => {
  it("returns null when no marker is present", () => {
    expect(parseLeadReadyMarker("Sure, we can help with that move!")).toBeNull();
  });

  it("strips the marker line and extracts known fields", () => {
    const text =
      'Great, I have what I need — a coordinator will follow up shortly.\nLEAD_READY: {"name":"Jane Doe","phone":"555-1234","moveDate":"2026-09-01"}';
    const result = parseLeadReadyMarker(text);
    expect(result).not.toBeNull();
    expect(result!.visibleText).toBe(
      "Great, I have what I need — a coordinator will follow up shortly.",
    );
    expect(result!.fields).toEqual({
      name: "Jane Doe",
      phone: "555-1234",
      moveDate: "2026-09-01",
    });
  });

  it("drops unknown keys and non-string values", () => {
    const text = 'ok\nLEAD_READY: {"name":"Jane","movers":3,"unknownField":"x"}';
    const result = parseLeadReadyMarker(text);
    expect(result!.fields).toEqual({ name: "Jane" });
  });

  it("degrades to an empty field set (but still strips the line) on malformed JSON", () => {
    const text = "ok\nLEAD_READY: not valid json";
    const result = parseLeadReadyMarker(text);
    expect(result).not.toBeNull();
    expect(result!.visibleText).toBe("ok");
    expect(result!.fields).toEqual({});
  });

  it("degrades gracefully when the marker's JSON is a non-object", () => {
    const text = 'ok\nLEAD_READY: ["not", "an", "object"]';
    const result = parseLeadReadyMarker(text);
    expect(result!.fields).toEqual({});
  });
});

import { describe, expect, it } from "vitest";
import {
  checkSupportReply,
  createSupportDraft,
  recordSupportDecision,
  submitSupportReply,
  type SupportDraft,
} from "./support-pipeline";

const base = { id: "s1", companyId: "c1" };
const routine = "Hi, what days do you have open next month for a two-man labor crew?";
const goodReply =
  "Thanks for reaching out. Send me the date you're thinking about and I'll check the calendar.";

function start(message = routine): SupportDraft {
  const r = createSupportDraft({ ...base, customerMessage: message });
  if (!r.ok) throw new Error(r.error);
  return r.draft;
}

describe("support pipeline", () => {
  it("a routine question starts a draft", () => {
    expect(start().stage).toBe("drafting");
  });

  it("sensitive messages go straight to the owner with no draft", () => {
    for (const msg of [
      "You broke my dresser and I want a refund.",
      "My lawyer will be in touch about the damage.",
      "Someone got injured during the move.",
    ]) {
      const d = start(msg);
      expect(d.stage).toBe("stalled");
      expect(d.text).toBe("");
      const again = submitSupportReply(d, goodReply);
      expect(again.ok).toBe(false);
    }
  });

  it("empty or oversized customer messages are refused", () => {
    expect(createSupportDraft({ ...base, customerMessage: "  " }).ok).toBe(false);
    expect(createSupportDraft({ ...base, customerMessage: "x".repeat(4001) }).ok).toBe(false);
  });

  it("a clean reply reaches the owner", () => {
    const r = submitSupportReply(start(), goodReply);
    expect(r.ok && r.draft.stage).toBe("awaiting_owner");
  });

  it("blocks fault, money back, promises and legal advice", () => {
    for (const text of [
      "Sorry, it was our fault.",
      "We will give you a full refund.",
      "I promise it will be fine.",
      "Your insurance will cover it.",
    ]) {
      expect(checkSupportReply(text).length).toBeGreaterThan(0);
      const r = submitSupportReply(start(), text);
      expect(r.ok && r.draft.stage).toBe("needs_changes");
    }
  });

  it("three failed tries stop it for the owner", () => {
    let d = start();
    for (let i = 0; i < 3; i += 1) {
      const r = submitSupportReply(d, "I promise a refund.");
      if (!r.ok) throw new Error(r.error);
      d = r.draft;
    }
    expect(d.stage).toBe("stalled");
  });

  it("only a reply waiting for the owner can be decided, and rejecting needs a reason", () => {
    const waiting = submitSupportReply(start(), goodReply);
    if (!waiting.ok) throw new Error(waiting.error);
    expect(recordSupportDecision(start(), { decision: "approve" }).ok).toBe(false);
    expect(recordSupportDecision(waiting.draft, { decision: "reject", reason: " " }).ok).toBe(
      false,
    );
    const approved = recordSupportDecision(waiting.draft, { decision: "approve" });
    expect(approved.ok && approved.draft.stage).toBe("approved");
    const rejected = recordSupportDecision(waiting.draft, {
      decision: "reject",
      reason: "Too stiff",
    });
    expect(rejected.ok && rejected.draft.stage).toBe("rejected");
  });
});

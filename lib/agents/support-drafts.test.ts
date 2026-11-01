import { describe, expect, it } from "vitest";
import {
  decideSupport,
  resubmitSupport,
  rowToSupportDraft,
  startSupport,
  type SupportRow,
} from "./support-drafts";

const base = { id: "s1", companyId: "c1" };
const ask = "What days do you have open next month?";
const good = "Thanks for reaching out. Send me the date and I'll check the calendar.";

function rowFrom(
  save: NonNullable<
    ReturnType<typeof startSupport> extends infer R
      ? R extends { ok: true; save: infer S }
        ? S
        : never
      : never
  >,
): SupportRow {
  return { id: "s1", company_id: "c1", ...save };
}

describe("support drafts", () => {
  it("a message with a clean reply reaches the owner and keeps the customer's words", () => {
    const r = startSupport({ ...base, customerMessage: ask, reply: good });
    expect(r.ok && r.save.stage).toBe("awaiting_owner");
    expect(r.ok && r.save.context).toBe(ask);
  });

  it("a message with no reply yet waits to be written", () => {
    const r = startSupport({ ...base, customerMessage: ask, reply: "" });
    expect(r.ok && r.save.stage).toBe("drafting");
  });

  it("sensitive messages are handed to the owner even if a reply is supplied", () => {
    const r = startSupport({
      ...base,
      customerMessage: "You broke my table, I want a refund",
      reply: good,
    });
    expect(r.ok && r.save.stage).toBe("stalled");
    expect(r.ok && r.save.body).toBe("");
  });

  it("fix, resubmit and decide work end to end", () => {
    const first = startSupport({ ...base, customerMessage: ask, reply: "I promise we have time." });
    if (!first.ok) throw new Error("setup");
    expect(first.save.stage).toBe("needs_changes");
    const fixed = resubmitSupport(rowFrom(first.save), good);
    if (!fixed.ok) throw new Error("setup");
    expect(fixed.save.stage).toBe("awaiting_owner");
    const approved = decideSupport(rowFrom(fixed.save), "approve", "");
    expect(approved.ok && approved.save.stage).toBe("approved");
    expect(decideSupport(rowFrom(fixed.save), "maybe", "").ok).toBe(false);
  });

  it("rows without the customer's message are not opened", () => {
    expect(
      rowToSupportDraft({
        id: "x",
        company_id: "c",
        stage: "drafting",
        body: "",
        context: null,
        round: 0,
        open_fixes: [],
        history: [],
      }),
    ).toBeNull();
  });
});

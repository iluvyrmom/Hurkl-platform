import { describe, expect, it } from "vitest";
import { decide, draftToSave, resubmit, rowToDraft, startAndCheck, type DraftRow } from "./drafts";

const base = { id: "d1", companyId: "c1", channel: "social_post" };
const clean = "Need a hand moving this weekend? We do labor-only moves in the Portland area.";

function rowFrom(save: ReturnType<typeof draftToSave>): DraftRow {
  return { id: "d1", company_id: "c1", channel: "social_post", ...save };
}

describe("agent drafts", () => {
  it("clean wording reaches the owner", () => {
    const r = startAndCheck({ ...base, text: clean });
    expect(r.ok && r.save.stage).toBe("awaiting_owner");
  });

  it("an unverified claim is sent back with a plain reason", () => {
    const r = startAndCheck({ ...base, text: "We are the best licensed movers in town." });
    expect(r.ok && r.save.stage).toBe("needs_changes");
    expect(r.ok && r.save.open_fixes.length).toBeGreaterThan(0);
  });

  it("rejects unknown channels and empty or oversized wording", () => {
    expect(startAndCheck({ ...base, channel: "cold_text", text: clean }).ok).toBe(false);
    expect(startAndCheck({ ...base, text: "   " }).ok).toBe(false);
    expect(startAndCheck({ ...base, text: "x".repeat(4001) }).ok).toBe(false);
  });

  it("fixing the wording lets it pass; three failures stop it", () => {
    const first = startAndCheck({ ...base, text: "Best movers, guaranteed." });
    if (!first.ok) throw new Error("setup");
    const fixed = resubmit(rowFrom(first.save), clean);
    expect(fixed.ok && fixed.save.stage).toBe("awaiting_owner");

    let row = rowFrom(first.save);
    for (let i = 0; i < 2; i += 1) {
      const next = resubmit(row, "Best movers, guaranteed.");
      if (!next.ok) throw new Error("setup");
      row = rowFrom(next.save);
    }
    expect(row.stage).toBe("stalled");
  });

  it("only a draft waiting for the owner can be approved or turned down", () => {
    const needs = startAndCheck({ ...base, text: "Free best moves!" });
    if (!needs.ok) throw new Error("setup");
    expect(decide(rowFrom(needs.save), "approve", "").ok).toBe(false);

    const ok = startAndCheck({ ...base, text: clean });
    if (!ok.ok) throw new Error("setup");
    const approved = decide(rowFrom(ok.save), "approve", "");
    expect(approved.ok && approved.save.stage).toBe("approved");
    expect(decide(rowFrom(ok.save), "reject", "").ok).toBe(false);
    const rejected = decide(rowFrom(ok.save), "reject", "Not my voice");
    expect(rejected.ok && rejected.save.stage).toBe("rejected");
    expect(decide(rowFrom(ok.save), "maybe", "").ok).toBe(false);
  });

  it("bad rows are not opened", () => {
    expect(
      rowToDraft({
        id: "x",
        company_id: "c",
        channel: "nope",
        stage: "approved",
        body: "",
        round: 0,
        open_fixes: [],
        history: [],
      }),
    ).toBeNull();
  });
});

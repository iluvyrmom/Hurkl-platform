import { describe, expect, it } from "vitest";
import {
  checkMarketingText,
  createDraft,
  isReadyToPublish,
  recordOwnerDecision,
  submitDraft,
  type MarketingDraft,
} from "./marketing-pipeline";
import { MARKETING_CHANNELS, MARKETING_DEFINITION } from "./specialists/marketing";

function start(over: Partial<Parameters<typeof createDraft>[0]> = {}): MarketingDraft {
  const r = createDraft({ id: "d1", companyId: "c1", channel: "social_post", ...over });
  if (!r.ok) throw new Error(r.error);
  return r.draft;
}
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

describe("Marketing definition", () => {
  it("can draft but never publish, send, contact anyone or spend money", () => {
    expect(MARKETING_DEFINITION.permissions).toEqual([
      "read_company_package",
      "draft_marketing_content",
    ]);
    for (const banned of ["publish", "send", "contact", "spend", "post_to", "deploy"]) {
      expect(MARKETING_DEFINITION.permissions.some((p) => p.includes(banned))).toBe(false);
    }
    expect(MARKETING_DEFINITION.auditRequired).toBe(true);
  });
  it("has no cold-outreach channel", () => {
    for (const channel of MARKETING_CHANNELS) {
      expect(channel).not.toMatch(/cold|sms|text_message|dm|direct_message|unsolicited/);
    }
  });
});

describe("checkMarketingText", () => {
  it("blocks claims the company has not verified", () => {
    const codes = checkMarketingText("We are licensed and insured. Best movers in town!", []).map(
      (i) => i.code,
    );
    expect(codes).toEqual(
      expect.arrayContaining([
        "unverified_claim:licensed",
        "unverified_claim:insured",
        "unverified_claim:best",
      ]),
    );
  });
  it("allows a claim the company has verified", () => {
    const issues = checkMarketingText("Licensed and insured crews.", ["licensed", "insured"]);
    expect(issues).toEqual([]);
  });
  it("flags false urgency as a fix, not a block", () => {
    const issues = checkMarketingText("Act now, limited time!", []);
    expect(issues.map((i) => [i.code, i.severity])).toEqual([["false_urgency", "fix"]]);
  });
  it("blocks aiming at or excluding people by who they are", () => {
    expect(checkMarketingText("Movers for women only.", []).map((i) => i.code)).toContain(
      "protected_targeting",
    );
    expect(checkMarketingText("Honest labor-only moving crews in Portland.", [])).toEqual([]);
  });
});

describe("draft pipeline", () => {
  it("clean wording goes straight to the owner, and approval is not publishing by itself", () => {
    const d = ok(
      submitDraft(
        start(),
        "Need extra hands on moving day? Call us for labor-only help in Portland.",
      ),
    ).draft;
    expect(d.stage).toBe("awaiting_owner");
    expect(isReadyToPublish(d)).toBe(false);
    const a = ok(recordOwnerDecision(d, { decision: "approve" })).draft;
    expect(a.stage).toBe("approved");
    expect(isReadyToPublish(a)).toBe(true);
  });
  it("sends back wording with an unverified claim and lists what to fix", () => {
    const r = ok(submitDraft(start(), "The best, fully insured movers.")).draft;
    expect(r.stage).toBe("needs_changes");
    expect(r.openFixes.length).toBeGreaterThan(0);
  });
  it("the Critic's rules apply too: an invented discount is stopped", () => {
    const r = ok(submitDraft(start(), "Book today and get 20% off your move!")).draft;
    expect(r.stage).not.toBe("awaiting_owner");
  });
  it("a price not in the company's verified amounts is stopped", () => {
    const d = start({ verifiedDollarAmounts: [150] });
    expect(ok(submitDraft(d, "Crews start at $99 an hour.")).draft.stage).not.toBe(
      "awaiting_owner",
    );
    expect(ok(submitDraft(d, "A $150 deposit holds your day.")).draft.stage).toBe("awaiting_owner");
  });
  it("stalls after the maximum number of tries so Mason can take over", () => {
    let d = start({ maxRounds: 2 });
    d = ok(submitDraft(d, "We are the best.")).draft;
    expect(d.stage).toBe("needs_changes");
    d = ok(submitDraft(d, "Still the best.")).draft;
    expect(d.stage).toBe("stalled");
    expect(submitDraft(d, "Honest help.").ok).toBe(false);
  });
  it("the owner cannot decide before the checks pass, and rejection needs a reason", () => {
    expect(recordOwnerDecision(start(), { decision: "approve" }).ok).toBe(false);
    const waiting = ok(submitDraft(start(), "Labor-only moving help in Portland.")).draft;
    expect(recordOwnerDecision(waiting, { decision: "reject", reason: " " }).ok).toBe(false);
    const rejected = ok(
      recordOwnerDecision(waiting, { decision: "reject", reason: "Too salesy" }),
    ).draft;
    expect(rejected.stage).toBe("rejected");
    expect(isReadyToPublish(rejected)).toBe(false);
  });
  it("cannot be approved by going around the stages", () => {
    const d = start();
    expect(recordOwnerDecision({ ...d, stage: "needs_changes" }, { decision: "approve" }).ok).toBe(
      false,
    );
  });
  it("refuses new promotion when the company is full but still allows review requests", () => {
    const full = createDraft({ id: "x", companyId: "c", channel: "ad_copy", capacity: "full" });
    expect(full.ok).toBe(false);
    expect(
      createDraft({ id: "y", companyId: "c", channel: "review_request", capacity: "full" }).ok,
    ).toBe(true);
    expect(
      createDraft({ id: "z", companyId: "c", channel: "ad_copy", capacity: "has_room" }).ok,
    ).toBe(true);
  });
  it("rejects a channel it does not know", () => {
    expect(createDraft({ id: "q", companyId: "c", channel: "cold_text" as never }).ok).toBe(false);
  });
});

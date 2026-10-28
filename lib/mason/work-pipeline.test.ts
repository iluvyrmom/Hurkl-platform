import { describe, expect, it } from "vitest";
import { reviewWork } from "./critic";
import {
  BUILDER_DEFINITION,
  DESIGNER_DEFINITION,
  DESIGN_CHECKLIST,
} from "./specialists/design-build";
import {
  canShip,
  createWorkItem,
  recordCriticVerdict,
  recordDesignerDecision,
  recordFounderDecision,
  submitBuilderHandoff,
  type BuilderHandoff,
  type PipelineResult,
  type WorkItem,
} from "./work-pipeline";

const goodHandoff: BuilderHandoff = {
  summary: "Built the booking page. Tests pass.",
  previewUrl: "https://preview.example.test/abc",
  evidence: ["vitest: 12 passed"],
  screenshots: [{ viewport: "phone", ref: "phone.png" }],
};

const allChecked = Object.fromEntries(DESIGN_CHECKLIST.map((k) => [k, true]));

function ok(result: PipelineResult): WorkItem {
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.item;
}

function atDesignReview(handoff = goodHandoff) {
  return ok(submitBuilderHandoff(createWorkItem("w1", "Booking page"), handoff));
}
function atCriticReview() {
  return ok(
    recordDesignerDecision(atDesignReview(), { decision: "sign_off", checklist: allChecked }),
  );
}
function atFounder() {
  return ok(
    recordCriticVerdict(
      atCriticReview(),
      reviewWork({ kind: "work_handoff", text: "ok", evidence: ["x"] }),
    ),
  );
}

describe("work pipeline", () => {
  it("walks the full path: Builder → Designer → Critic → founder → approved", () => {
    const approved = ok(recordFounderDecision(atFounder(), "approve"));
    expect(approved.stage).toBe("approved");
    expect(canShip(approved)).toBe(true);
  });

  it("nothing can ship before founder approval, at any earlier stage", () => {
    for (const item of [
      createWorkItem("w", "t"),
      atDesignReview(),
      atCriticReview(),
      atFounder(),
    ]) {
      expect(canShip(item)).toBe(false);
    }
  });

  it("stages cannot be skipped", () => {
    const fresh = createWorkItem("w", "t");
    expect(recordDesignerDecision(fresh, { decision: "sign_off", checklist: allChecked }).ok).toBe(
      false,
    );
    expect(
      recordCriticVerdict(fresh, reviewWork({ kind: "work_handoff", text: "ok", evidence: ["x"] }))
        .ok,
    ).toBe(false);
    expect(recordFounderDecision(fresh, "approve").ok).toBe(false);
    // Designer approved, but the Critic has not looked yet: founder cannot approve.
    expect(recordFounderDecision(atCriticReview(), "approve").ok).toBe(false);
    // The Builder cannot hand off again while the Designer is reviewing.
    expect(submitBuilderHandoff(atDesignReview(), goodHandoff).ok).toBe(false);
  });

  describe("Builder handoff", () => {
    it("rejects a handoff with no evidence", () => {
      const result = submitBuilderHandoff(createWorkItem("w", "t"), {
        summary: "All done.",
        evidence: [],
        screenshots: [],
      });
      expect(result.ok).toBe(false);
    });

    it("rejects an unverified deploy claim", () => {
      const result = submitBuilderHandoff(createWorkItem("w", "t"), {
        ...goodHandoff,
        summary: "Deployed to production.",
      });
      expect(result.ok).toBe(false);
    });

    it("stalls after the round limit and hands over to Mason", () => {
      let item = createWorkItem("w", "t", 2);
      for (let i = 0; i < 2; i++) {
        item = ok(submitBuilderHandoff(item, goodHandoff));
        item = ok(
          recordDesignerDecision(item, { decision: "changes_needed", changes: ["Bigger buttons"] }),
        );
      }
      item = ok(submitBuilderHandoff(item, goodHandoff));
      expect(item.stage).toBe("stalled");
      expect(canShip(item)).toBe(false);
      expect(recordDesignerDecision(item, { decision: "sign_off", checklist: allChecked }).ok).toBe(
        false,
      );
    });
  });

  describe("Designer", () => {
    it("sends work back with specific changes the Builder must address", () => {
      const back = ok(
        recordDesignerDecision(atDesignReview(), {
          decision: "changes_needed",
          changes: ["Bigger buttons"],
        }),
      );
      expect(back.stage).toBe("building");
      expect(back.openFixes).toEqual(["Bigger buttons"]);
    });

    it("will not send work back with no specific change listed", () => {
      expect(
        recordDesignerDecision(atDesignReview(), { decision: "changes_needed", changes: ["  "] })
          .ok,
      ).toBe(false);
    });

    it("will not sign off without a phone screenshot", () => {
      const tabletOnly = atDesignReview({
        ...goodHandoff,
        screenshots: [{ viewport: "desktop", ref: "d.png" }],
      });
      const result = recordDesignerDecision(tabletOnly, {
        decision: "sign_off",
        checklist: allChecked,
      });
      expect(result).toMatchObject({ ok: false });
      expect(!result.ok && result.error).toContain("phone");
    });

    it("will not sign off unless every checklist item is confirmed", () => {
      const partial = { ...allChecked, tap_targets: false };
      const result = recordDesignerDecision(atDesignReview(), {
        decision: "sign_off",
        checklist: partial,
      });
      expect(!result.ok && result.error).toContain("tap_targets");
      const empty = recordDesignerDecision(atDesignReview(), {
        decision: "sign_off",
        checklist: {},
      });
      expect(empty.ok).toBe(false);
    });
  });

  describe("Critic and founder", () => {
    it("a Critic BLOCK or FIX sends work back to the Builder with the reasons", () => {
      const blocked = reviewWork({ kind: "customer_reply", text: "I've booked your move." });
      const back = ok(recordCriticVerdict(atCriticReview(), blocked));
      expect(back.stage).toBe("building");
      expect(back.openFixes.length).toBeGreaterThan(0);
      expect(canShip(back)).toBe(false);
    });

    it("a founder rejection sends work back and keeps it from shipping", () => {
      const back = ok(recordFounderDecision(atFounder(), "reject", "Make the header gold."));
      expect(back.stage).toBe("building");
      expect(back.openFixes).toEqual(["Make the header gold."]);
      expect(canShip(back)).toBe(false);
    });

    it("a founder cannot approve work that is already approved", () => {
      const approved = ok(recordFounderDecision(atFounder(), "approve"));
      expect(recordFounderDecision(approved, "approve").ok).toBe(false);
    });
  });

  it("keeps an audit trail of every stage change", () => {
    const approved = ok(recordFounderDecision(atFounder(), "approve"));
    expect(approved.history.map((h) => h.stage)).toEqual([
      "building",
      "design_review",
      "critic_review",
      "awaiting_founder",
      "approved",
    ]);
  });

  it("does not mutate the item it was given", () => {
    const item = createWorkItem("w", "t");
    submitBuilderHandoff(item, goodHandoff);
    expect(item.stage).toBe("building");
    expect(item.round).toBe(0);
  });
});

describe("Designer and Builder definitions", () => {
  it("the Builder can never deploy, merge, or edit the live site", () => {
    for (const forbidden of [
      "deploy_production",
      "merge_to_main",
      "publish_production",
      "write_production",
    ]) {
      expect(BUILDER_DEFINITION.permissions).not.toContain(forbidden);
    }
    expect(BUILDER_DEFINITION.permissions).toContain("publish_private_preview");
  });

  it("the Designer can never edit code", () => {
    expect(DESIGNER_DEFINITION.permissions.some((p) => p.startsWith("write_"))).toBe(false);
  });

  it("both are audited and limited to one execution at a time", () => {
    for (const def of [BUILDER_DEFINITION, DESIGNER_DEFINITION]) {
      expect(def.auditRequired).toBe(true);
      expect(def.executionLimits.maxConcurrentExecutions).toBe(1);
    }
  });

  it("company-specific colors are not hardcoded into the shared checklist", () => {
    expect(
      JSON.stringify([DESIGN_CHECKLIST, BUILDER_DEFINITION, DESIGNER_DEFINITION]).toLowerCase(),
    ).not.toMatch(/gold|a-1|moving/);
  });
});

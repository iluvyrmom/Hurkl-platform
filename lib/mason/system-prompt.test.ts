import { describe, expect, it } from "vitest";
import { buildMasonSystemPrompt } from "./system-prompt";

describe("buildMasonSystemPrompt", () => {
  it("identifies the internal HURKL channel and names the sender", () => {
    const prompt = buildMasonSystemPrompt({
      companyName: "HURKL (Internal)",
      isInternalHurklChannel: true,
      senderName: "Josh",
      senderRole: "hurkl_admin",
    });
    expect(prompt).toContain("HURKL's own AI Office Manager");
    expect(prompt).toContain("Josh");
    expect(prompt).toContain("hurkl_admin");
  });

  it("never mentions HURKL for a tenant-facing (non-internal) channel", () => {
    const prompt = buildMasonSystemPrompt({
      companyName: "A-1 Best Moving",
      isInternalHurklChannel: false,
      senderRole: "owner",
    });
    expect(prompt).toContain("A-1 Best Moving");
    expect(prompt).toContain("never mention HURKL");
  });

  it("never defaults to giving out the phone number, and treats owner escalation as a last resort", () => {
    const prompt = buildMasonSystemPrompt({
      companyName: "A-1 Best Moving",
      isInternalHurklChannel: false,
      senderRole: "public_visitor",
    });
    expect(prompt).toContain("Do not give out the owner's direct phone number as your default");
    expect(prompt).toContain("last resort");
  });

  it("states verified business facts as fact when provided", () => {
    const prompt = buildMasonSystemPrompt({
      companyName: "A-1 Best Moving",
      isInternalHurklChannel: false,
      senderRole: "public_visitor",
      businessFacts: ["1 mover is $50/hour."],
    });
    expect(prompt).toContain("Known, verified facts about this business");
    expect(prompt).toContain("1 mover is $50/hour.");
  });

  it("omits the business-facts block entirely when none are given", () => {
    const prompt = buildMasonSystemPrompt({
      companyName: "A-1 Best Moving",
      isInternalHurklChannel: false,
      senderRole: "public_visitor",
    });
    expect(prompt).not.toContain("Known, verified facts");
  });

  it("instructs Mason to emit a LEAD_READY marker once required fields are gathered", () => {
    const prompt = buildMasonSystemPrompt({
      companyName: "A-1 Best Moving",
      isInternalHurklChannel: false,
      senderRole: "public_visitor",
      leadIntake: {
        requiredFields: ["name", "phone or email"],
        optionalFields: ["moveDate"],
      },
    });
    expect(prompt).toContain("LEAD_READY:");
    expect(prompt).toContain("name, phone or email, moveDate");
  });
});

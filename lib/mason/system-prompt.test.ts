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
});

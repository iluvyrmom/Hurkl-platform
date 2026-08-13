import { describe, expect, it } from "vitest";
import { resolveDiscountAuthority } from "./discount-authority";
import { buildMasonSystemPrompt } from "./system-prompt";

const NO_DISCOUNT_AUTHORITY = resolveDiscountAuthority(null);

describe("buildMasonSystemPrompt", () => {
  it("identifies the internal HURKL channel and names the sender", () => {
    const prompt = buildMasonSystemPrompt({
      companyName: "HURKL (Internal)",
      isInternalHurklChannel: true,
      senderName: "Josh",
      senderRole: "hurkl_admin",
      discountAuthority: NO_DISCOUNT_AUTHORITY,
      customerRequestedOwnerContact: false,
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
      discountAuthority: NO_DISCOUNT_AUTHORITY,
      customerRequestedOwnerContact: false,
    });
    expect(prompt).toContain("A-1 Best Moving");
    expect(prompt).toContain("never mention HURKL");
  });

  it("frames escalation as the exception, not the default", () => {
    const prompt = buildMasonSystemPrompt({
      companyName: "A-1 Best Moving",
      isInternalHurklChannel: false,
      senderRole: "customer",
      discountAuthority: NO_DISCOUNT_AUTHORITY,
      customerRequestedOwnerContact: false,
    });
    expect(prompt).toContain("not a phone directory");
    expect(prompt).toContain("Escalating to the owner is the exception, not the default");
    expect(prompt).toContain("Let me check that for you");
  });

  it("does not volunteer owner contact info by default, even when it's known", () => {
    const prompt = buildMasonSystemPrompt({
      companyName: "A-1 Best Moving",
      isInternalHurklChannel: false,
      senderRole: "customer",
      ownerPhone: "971-777-6660",
      ownerEmail: "A1BESTMOVING@gmail.com",
      discountAuthority: NO_DISCOUNT_AUTHORITY,
      customerRequestedOwnerContact: false,
    });
    expect(prompt).toContain("971-777-6660");
    expect(prompt).toContain("Do not volunteer it just because you're uncertain");
    expect(prompt).not.toContain(
      "it's appropriate to share the owner's direct contact now if you have it",
    );
  });

  it("tells Mason it's fine to share owner contact when the customer explicitly asked", () => {
    const prompt = buildMasonSystemPrompt({
      companyName: "A-1 Best Moving",
      isInternalHurklChannel: false,
      senderRole: "customer",
      ownerPhone: "971-777-6660",
      discountAuthority: NO_DISCOUNT_AUTHORITY,
      customerRequestedOwnerContact: true,
    });
    expect(prompt).toContain(
      "it's appropriate to share the owner's direct contact now if you have it",
    );
  });

  it("states Mason has no discretionary pricing authority when none is configured", () => {
    const prompt = buildMasonSystemPrompt({
      companyName: "A-1 Best Moving",
      isInternalHurklChannel: false,
      senderRole: "customer",
      discountAuthority: NO_DISCOUNT_AUTHORITY,
      customerRequestedOwnerContact: false,
    });
    expect(prompt).toContain("You have no discretionary pricing authority");
    expect(prompt).not.toContain("You have limited discretionary pricing authority");
  });

  it("states the exact configured ceiling and the hard 5% ceiling when authority is granted", () => {
    const prompt = buildMasonSystemPrompt({
      companyName: "A-1 Best Moving",
      isInternalHurklChannel: false,
      senderRole: "customer",
      discountAuthority: resolveDiscountAuthority(5),
      customerRequestedOwnerContact: false,
    });
    expect(prompt).toContain("up to 5% off");
    expect(prompt).toContain("never more than 5% under any circumstance");
    expect(prompt).toContain("the preferred outcome is no discount");
    expect(prompt).toContain("should not automatically offer the maximum");
  });

  it("instructs conservatism on small/minimum-size jobs", () => {
    const prompt = buildMasonSystemPrompt({
      companyName: "A-1 Best Moving",
      isInternalHurklChannel: false,
      senderRole: "customer",
      discountAuthority: resolveDiscountAuthority(5),
      customerRequestedOwnerContact: false,
    });
    expect(prompt).toContain("especially conservative on a small or minimum-size job");
  });

  it("instructs Mason to never state a dollar discount without a real derived price", () => {
    const prompt = buildMasonSystemPrompt({
      companyName: "A-1 Best Moving",
      isInternalHurklChannel: false,
      senderRole: "customer",
      discountAuthority: resolveDiscountAuthority(5),
      customerRequestedOwnerContact: false,
    });
    expect(prompt).toContain("never state a flat dollar discount you haven't derived");
  });

  it("distinguishes verified policy, granted discretion, calculation, assumption, and unverified information", () => {
    const prompt = buildMasonSystemPrompt({
      companyName: "A-1 Best Moving",
      isInternalHurklChannel: false,
      senderRole: "customer",
      discountAuthority: NO_DISCOUNT_AUTHORITY,
      customerRequestedOwnerContact: false,
    });
    expect(prompt).toContain("verified company policy");
    expect(prompt).toContain("discretion you've been explicitly granted");
    expect(prompt).toContain("a calculation you just did from real numbers");
    expect(prompt).toContain("an assumption");
  });
});

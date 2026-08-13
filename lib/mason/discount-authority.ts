/**
 * Mason's discretionary-discount authority — the concrete, tenant-
 * configured override of risk.ts's "apply_discount" default (medium
 * risk / tier_2_approval_required). risk.ts's own comment already
 * anticipates this: "a tenant may configure a narrowly-scoped,
 * pre-approved workflow that runs a specific medium-risk action at
 * Tier 1 instead." This module IS that workflow — bounded, owner-
 * configured, tenant-scoped, never a platform-wide default — not a
 * second policy engine and not a new autonomy tier.
 *
 * See supabase/migrations/00000000000009_mason_discount_authority_and_escalations.sql
 * for the real, per-company `discretionary_discount_max_percent`
 * column this reads, and docs/communications-architecture.md for how
 * it's wired into a live conversation.
 */

/**
 * Absolute, code-level safety ceiling. No owner rule, however
 * configured, can push Mason's own discretionary authority past this —
 * raising it requires a deliberate code change, not a configuration
 * edit. Matches the founder's instruction: "5% is a hard ceiling
 * unless the owner explicitly authorizes something else."
 */
export const DISCRETIONARY_DISCOUNT_HARD_CEILING_PERCENT = 5;

export interface DiscountAuthority {
  /** 0 means Mason has no standing discretion at all for this company — the safe default for any company that hasn't configured one. */
  maxDiscretionaryPercent: number;
}

/**
 * Clamps a company's configured max into [0, hard ceiling] — defends
 * against a bad or missing config value, not just a bad prompt.
 * Missing/null input (no owner rule configured) resolves to zero
 * discretion, never an assumed default.
 */
export function resolveDiscountAuthority(
  configuredMaxPercent: number | null | undefined,
): DiscountAuthority {
  const raw = configuredMaxPercent ?? 0;
  const clamped = Math.min(Math.max(raw, 0), DISCRETIONARY_DISCOUNT_HARD_CEILING_PERCENT);
  return { maxDiscretionaryPercent: clamped };
}

export function isWithinDiscountAuthority(percent: number, authority: DiscountAuthority): boolean {
  return percent >= 0 && percent <= authority.maxDiscretionaryPercent;
}

/**
 * Rounds the same way lib/mason/skills/invoice.ts's cents math does,
 * so a discretionary percentage and a real invoice never disagree on
 * the resulting dollar figure.
 */
export function computeDiscountAmountCents(priceCents: number, percent: number): number {
  return Math.round((priceCents * percent) / 100);
}

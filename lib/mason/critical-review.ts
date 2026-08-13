/**
 * The one deterministic safety check every one of Mason's replies
 * passes through before it can be sent to a customer — the concrete,
 * code-level implementation of the "Critical Review Specialist" role
 * docs/business-intelligence/HAL_SPECIALIST_WORKFORCE.md describes
 * ("his job is to look over everything before Mason gets it"), built
 * ahead of full HAL specialist execution machinery, which remains
 * types-only (see lib/domain/hal.ts). This is NOT that machinery — it
 * is a narrow, pure text-safety check, the same shape as identity.ts's
 * pre-existing violatesIdentityRules() (previously written but never
 * called by the live pipeline; this module finally wires that up too,
 * rather than leaving it dormant).
 *
 * Why this exists: today's conversation pipeline has no tool-use/
 * function-calling wired to the model (lib/mason/providers/
 * anthropic-model-provider.ts sends a plain system+messages
 * completion) and no verified-price data source reaches Mason at all.
 * That means any specific dollar-amount discount a reply states is,
 * under today's real architecture, definitionally unverifiable — this
 * is exactly the failure mode from the reported incident ("$75
 * discount off the flat rate" with no underlying verified price). This
 * module catches that class of claim before it reaches a customer.
 */
import { violatesIdentityRules } from "./identity";
import type { DiscountAuthority } from "./discount-authority";

export interface CriticalReviewResult {
  ok: boolean;
  violations: string[];
}

// "$75 off" / "$75.00 discount" / "$ 75 knocked off" — deliberately
// broad. Not just badly-rounded numbers: ANY specific dollar-figure
// discount claim is presumptively fabricated today, because nothing in
// the live pipeline gives Mason a real, verified price to derive one
// from (see module comment above).
const DOLLAR_DISCOUNT_PATTERN =
  /\$\s?\d+(\.\d{1,2})?\s*(dollars?)?\s*(off\b|discount|reduction|credit|knock(ed)? off)/i;

// "5% off" / "10% discount" — checked against the caller's actual
// authority, not a fixed number, so this stays correct as owner-
// configured ceilings change.
const PERCENT_DISCOUNT_PATTERN = /(\d+(\.\d+)?)\s*%\s*(off\b|discount|reduction)/i;

export function reviewMasonReply(
  replyText: string,
  authority: DiscountAuthority,
): CriticalReviewResult {
  const violations: string[] = [];

  if (violatesIdentityRules(replyText)) {
    violations.push("identity_rule_violation");
  }

  if (DOLLAR_DISCOUNT_PATTERN.test(replyText)) {
    violations.push("unverified_dollar_discount_claim");
  }

  const percentMatch = replyText.match(PERCENT_DISCOUNT_PATTERN);
  if (percentMatch) {
    const claimedPercent = Number.parseFloat(percentMatch[1]);
    if (claimedPercent > authority.maxDiscretionaryPercent) {
      violations.push("discount_percent_exceeds_authority");
    }
  }

  return { ok: violations.length === 0, violations };
}

/** What the customer sees instead, when a reply is blocked — never a raw error, never silence. */
export const CRITICAL_REVIEW_FALLBACK_REPLY =
  "Let me get that confirmed rather than guess — I'll have it reviewed and follow up with an exact answer.";

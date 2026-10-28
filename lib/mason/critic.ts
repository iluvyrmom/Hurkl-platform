/**
 * The Critic — HAL's mandatory, universal review gate (see
 * docs/business-intelligence/HAL_SPECIALIST_WORKFORCE.md, "Critical
 * Review Specialist"). Nothing reaches a customer, the owner, or Mason
 * until it has been through here.
 *
 * Relationship to lib/mason/critical-review.ts: that module is the
 * narrow, already-live check on Mason's customer replies and is left
 * untouched. This module is the broader gate built around it — it
 * REUSES reviewMasonReply() for customer replies (so the discount and
 * identity rules exist in exactly one place) and adds the checks that
 * module never covered: internals leaking, claims of completed actions
 * with no proof, prices with no verified source, unauthorized
 * promises, placeholder text, and work handed off without evidence.
 *
 * Pure and deterministic: no AI call, no network, no database, no
 * cost. Not yet wired into the live conversation pipeline — wiring it
 * into lib/communications/inbound.ts changes what real customers see
 * and is a separate, deliberate step.
 *
 * Honesty rule: a check that cannot run because the caller did not
 * supply the facts it needs is reported in `checksSkipped`, never
 * silently counted as a pass.
 */
import { CRITICAL_REVIEW_FALLBACK_REPLY, reviewMasonReply } from "./critical-review";
import { resolveDiscountAuthority, type DiscountAuthority } from "./discount-authority";

export type CriticVerdictKind = "PASS" | "FIX" | "BLOCK";
export type CriticSeverity = "fix" | "block";

/** What is being reviewed. Each kind gets the checks that apply to its audience. */
export type ReviewableKind =
  "customer_reply" | "owner_message" | "specialist_report" | "work_handoff";

/** Actions the system has actually confirmed happened — the only thing that makes a "done" claim true. */
export type VerifiedActionKind =
  "message_sent" | "booking_confirmed" | "payment_received" | "deployed";

export interface CriticIssue {
  code: string;
  severity: CriticSeverity;
  detail: string;
  suggestion?: string;
}

export interface CriticContext {
  /** Defaults to zero discretion when omitted — the safe default used elsewhere. */
  discountAuthority?: DiscountAuthority;
  /**
   * Dollar amounts that come from the company's real configured data.
   * When omitted, the price check cannot run and is listed in
   * checksSkipped. When provided, any other dollar figure is blocked.
   */
  verifiedDollarAmounts?: readonly number[];
  /** Actions confirmed to have happened. Omitted means none — any completion claim is blocked. */
  verifiedActions?: readonly VerifiedActionKind[];
}

export interface CriticInput {
  kind: ReviewableKind;
  text: string;
  /** Proof for a work_handoff: screenshots, test results, preview links. */
  evidence?: readonly string[];
  context?: CriticContext;
}

export interface CriticVerdict {
  verdict: CriticVerdictKind;
  issues: CriticIssue[];
  /** Checks that could not run for lack of caller-supplied facts. */
  checksSkipped: string[];
  /** For a blocked customer_reply only: what the customer sees instead. */
  fallbackReply?: string;
}

// Internal machinery must never be visible to an owner or customer —
// the owner has exactly one employee, Mason. "HAL" is matched
// case-sensitively so a person named Hal is not flagged.
const INTERNAL_TERMS: readonly RegExp[] = [
  /\bHAL\b/,
  /hurkl agent library/i,
  /\bsub-?agents?\b/i,
  /\bspecialist agents?\b/i,
  /system prompt/i,
  /\banthropic\b/i,
  /\bclaude\b/i,
  /\bcritic agent\b/i,
  /\bcritical review specialist\b/i,
];

const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /\b(lorem ipsum|TODO|TBD)\b/i,
  /\{\{[^}]*\}\}/,
  /\[(insert|your|name|business)[^\]]*\]/i,
  /\b(undefined|NaN)\b/,
];

const PROMISE_PATTERNS: readonly RegExp[] = [
  /\b(i|we)\s+(absolutely\s+)?(guarantee|promise)\b/i,
  /\bguaranteed\b/i,
  /\b100\s?%\s+(safe|guaranteed|satisfaction)\b/i,
];

const COMPLETION_CLAIMS: ReadonlyArray<{
  action: VerifiedActionKind;
  patterns: readonly RegExp[];
  appliesTo: readonly ReviewableKind[];
}> = [
  {
    action: "message_sent",
    patterns: [
      /\b(i|we)(?:'ve| have)?\s+(?:just\s+)?(?:sent|emailed|texted)\b/i,
      /\b(?:email|message|text)\s+(?:was|has been)\s+sent\b/i,
    ],
    appliesTo: ["customer_reply", "owner_message", "specialist_report", "work_handoff"],
  },
  {
    action: "booking_confirmed",
    patterns: [
      /\b(?:your|the)\s+(?:appointment|booking|move|reservation)\s+(?:is|has been)\s+(?:confirmed|booked|scheduled)\b/i,
      /\b(i|we)(?:'ve| have)?\s+(?:just\s+)?(?:booked|scheduled|confirmed)\b/i,
    ],
    appliesTo: ["customer_reply", "owner_message", "specialist_report", "work_handoff"],
  },
  {
    action: "payment_received",
    patterns: [
      /\b(?:payment|deposit)\s+(?:was|has been|is)\s+(?:received|processed|confirmed)\b/i,
      /\b(i|we)(?:'ve| have)?\s+(?:received|processed)\s+(?:your|the)\s+(?:payment|deposit)\b/i,
    ],
    appliesTo: ["customer_reply", "owner_message", "specialist_report", "work_handoff"],
  },
  {
    action: "deployed",
    patterns: [/\b(?:deployed|published|pushed live|is now live|went live)\b/i],
    appliesTo: ["specialist_report", "work_handoff"],
  },
];

const DOLLAR_AMOUNT = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g;

function extractDollarAmounts(text: string): number[] {
  const amounts: number[] = [];
  for (const match of text.matchAll(DOLLAR_AMOUNT)) {
    const whole = match[1].replaceAll(",", "");
    amounts.push(Number.parseFloat(match[2] ? `${whole}.${match[2]}` : whole));
  }
  return amounts;
}

export function reviewWork(input: CriticInput): CriticVerdict {
  const { kind, text } = input;
  const context = input.context ?? {};
  const issues: CriticIssue[] = [];
  const checksSkipped: string[] = [];

  if (text.trim().length === 0) {
    issues.push({
      code: "empty_output",
      severity: "block",
      detail: "There is nothing to review — the output is empty.",
    });
  }

  // Reuse the live check so discount/identity rules live in one place.
  if (kind === "customer_reply") {
    const authority = context.discountAuthority ?? resolveDiscountAuthority(null);
    for (const code of reviewMasonReply(text, authority).violations) {
      issues.push({
        code,
        severity: "block",
        detail: "Blocked by Mason's existing customer-reply safety check.",
      });
    }
  }

  if (kind === "customer_reply" || kind === "owner_message") {
    if (INTERNAL_TERMS.some((term) => term.test(text))) {
      issues.push({
        code: "internals_exposed",
        severity: "block",
        detail:
          "Mentions internal systems (agents, prompts, or AI vendors). The owner and customers only ever deal with Mason.",
        suggestion: "Remove the reference and say it as Mason would.",
      });
    }
    if (PROMISE_PATTERNS.some((pattern) => pattern.test(text))) {
      issues.push({
        code: "unauthorized_promise",
        severity: "fix",
        detail: "Contains a guarantee or promise nobody has authorized.",
        suggestion: "Describe what the business actually does instead of guaranteeing an outcome.",
      });
    }
  }

  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))) {
    issues.push({
      code: "placeholder_text",
      severity: "fix",
      detail: "Contains placeholder or unfilled template text.",
      suggestion: "Replace it with the real content before this goes out.",
    });
  }

  const verified = new Set(context.verifiedActions ?? []);
  for (const claim of COMPLETION_CLAIMS) {
    if (!claim.appliesTo.includes(kind) || verified.has(claim.action)) continue;
    if (claim.patterns.some((pattern) => pattern.test(text))) {
      issues.push({
        code: `unverified_completion_claim:${claim.action}`,
        severity: "block",
        detail: `Says something was done (${claim.action.replaceAll("_", " ")}) but nothing confirms it happened.`,
        suggestion: "Say what is planned or pending, or attach the confirmation.",
      });
    }
  }

  if (kind !== "work_handoff") {
    if (context.verifiedDollarAmounts === undefined) {
      checksSkipped.push("price_verification");
    } else {
      const allowed = new Set(context.verifiedDollarAmounts);
      const unverified = extractDollarAmounts(text).filter((amount) => !allowed.has(amount));
      if (unverified.length > 0) {
        issues.push({
          code: "unverified_price_claim",
          severity: "block",
          detail: `States dollar amounts with no verified source: ${[...new Set(unverified)].map((n) => `$${n}`).join(", ")}.`,
          suggestion: "Use only prices from the company's configured data.",
        });
      }
    }
  }

  if (kind === "work_handoff") {
    const proof = (input.evidence ?? []).filter((item) => item.trim().length > 0);
    if (proof.length === 0) {
      issues.push({
        code: "done_without_proof",
        severity: "block",
        detail: "Work was handed off with no evidence attached. A bare 'done' does not count.",
        suggestion: "Attach a screenshot, test result, or working preview link.",
      });
    }
  }

  const verdict: CriticVerdictKind = issues.some((issue) => issue.severity === "block")
    ? "BLOCK"
    : issues.length > 0
      ? "FIX"
      : "PASS";

  return {
    verdict,
    issues,
    checksSkipped,
    ...(verdict === "BLOCK" && kind === "customer_reply"
      ? { fallbackReply: CRITICAL_REVIEW_FALLBACK_REPLY }
      : {}),
  };
}

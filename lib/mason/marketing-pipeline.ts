/**
 * Marketing draft pipeline: a pure state machine, like work-pipeline.ts.
 *
 *   drafting -> critic_review (inside submitDraft) -> awaiting_owner -> approved | rejected
 *
 * - A draft reaches the owner only after Marketing's own checks AND the
 *   Critic both pass. There is no function that skips either.
 * - "approved" means the owner OKed the wording. It does NOT publish anything:
 *   no publishing integration exists, and putting content in front of the public
 *   is Approval Required. isReadyToPublish() is therefore the only question this
 *   module answers about publishing, and it is deliberately narrow.
 * - Claims (licensed, insured, guarantee, best, ...) are allowed only when the
 *   company's own verified list says so. Prices and discounts go through the
 *   Critic's existing rules.
 * - When the company is full, new promotion is refused; review requests stay.
 *
 * Pure and deterministic: no AI call, no database, no network, no cost.
 */
import { reviewWork, type CriticIssue, type CriticVerdict } from "./critic";
import {
  MAINTENANCE_CHANNELS,
  MARKETING_CHANNELS,
  type MarketingChannel,
} from "./specialists/marketing";

export type DraftStage =
  "drafting" | "needs_changes" | "awaiting_owner" | "approved" | "rejected" | "stalled";

export type CapacityStatus = "has_room" | "full" | "unknown";

export interface DraftEvent {
  stage: DraftStage;
  note: string;
}

export interface MarketingDraft {
  id: string;
  companyId: string;
  channel: MarketingChannel;
  stage: DraftStage;
  text: string;
  /** Claims the company has verified it may make (from its Company Package). */
  verifiedClaims: readonly string[];
  /** Dollar amounts from the company's real configured data. */
  verifiedDollarAmounts?: readonly number[];
  round: number;
  maxRounds: number;
  openFixes: string[];
  history: DraftEvent[];
}

export type DraftResult = { ok: true; draft: MarketingDraft } | { ok: false; error: string };

const DEFAULT_MAX_ROUNDS = 3;

function fail(error: string): DraftResult {
  return { ok: false, error };
}

function advance(
  draft: MarketingDraft,
  stage: DraftStage,
  note: string,
  patch: Partial<MarketingDraft> = {},
): DraftResult {
  return {
    ok: true,
    draft: { ...draft, ...patch, stage, history: [...draft.history, { stage, note }] },
  };
}

// Claims that make a promise about the company. Each is allowed only when the
// company's verified list contains the matching word.
const CLAIM_PATTERNS: ReadonlyArray<{ claim: string; pattern: RegExp }> = [
  { claim: "licensed", pattern: /\blicensed\b/i },
  { claim: "insured", pattern: /\binsured\b/i },
  { claim: "bonded", pattern: /\bbonded\b/i },
  { claim: "guarantee", pattern: /\bguarantee[sd]?\b/i },
  { claim: "best", pattern: /\b(?:the\s+)?best\b|#\s?1\b|\bnumber\s+one\b/i },
  { claim: "cheapest", pattern: /\bcheapest\b|\blowest\s+price/i },
  { claim: "free", pattern: /\bfree\b/i },
  { claim: "award", pattern: /\baward[- ]winning\b/i },
  { claim: "same-day", pattern: /\bsame[- ]day\b/i },
];

// Pressure that is not true unless the owner has actually set a deadline.
const FALSE_URGENCY =
  /\b(?:act now|limited time|only \d+ (?:spots|slots) left|last chance|today only)\b/i;

// Marketing must never aim at, or exclude, people by protected characteristic.
const PROTECTED_GROUPS =
  "white|black|asian|hispanic|latino|christian|muslim|jewish|men|women|gay|straight|disabled|elderly|seniors|kids|children|immigrants?";
const PROTECTED_TARGETING = new RegExp(
  `\\b(?:only|no|except|not for)\\s+(?:\\w+\\s+)?(?:${PROTECTED_GROUPS})\\b|\\b(?:${PROTECTED_GROUPS})\\s+(?:only|not welcome|need not apply)\\b`,
  "i",
);

export function checkMarketingText(text: string, verifiedClaims: readonly string[]): CriticIssue[] {
  const issues: CriticIssue[] = [];
  const allowed = verifiedClaims.map((c) => c.toLowerCase());
  for (const { claim, pattern } of CLAIM_PATTERNS) {
    if (pattern.test(text) && !allowed.some((a) => a.includes(claim))) {
      issues.push({
        code: `unverified_claim:${claim}`,
        severity: "block",
        detail: `The draft says something about being "${claim}" that the company has not verified.`,
        suggestion: "Remove it, or add it to the company's verified claims first.",
      });
    }
  }
  if (FALSE_URGENCY.test(text)) {
    issues.push({
      code: "false_urgency",
      severity: "fix",
      detail: "The draft pressures people with a deadline or shortage nobody set.",
      suggestion: "Remove the urgency unless the owner set a real deadline.",
    });
  }
  if (PROTECTED_TARGETING.test(text)) {
    issues.push({
      code: "protected_targeting",
      severity: "block",
      detail: "The draft aims at or excludes people by who they are.",
      suggestion: "Describe the service and the service area, not the kind of person.",
    });
  }
  return issues;
}

export function createDraft(input: {
  id: string;
  companyId: string;
  channel: MarketingChannel;
  verifiedClaims?: readonly string[];
  verifiedDollarAmounts?: readonly number[];
  capacity?: CapacityStatus;
  maxRounds?: number;
}): DraftResult {
  if (!(MARKETING_CHANNELS as readonly string[]).includes(input.channel)) {
    return fail(`"${input.channel}" is not a channel Marketing can draft for.`);
  }
  if (input.capacity === "full" && !MAINTENANCE_CHANNELS.includes(input.channel)) {
    return fail(
      "The company is full right now, so Marketing is not drafting new promotion. Review requests are still fine.",
    );
  }
  const draft: MarketingDraft = {
    id: input.id,
    companyId: input.companyId,
    channel: input.channel,
    stage: "drafting",
    text: "",
    verifiedClaims: input.verifiedClaims ?? [],
    verifiedDollarAmounts: input.verifiedDollarAmounts,
    round: 0,
    maxRounds: input.maxRounds ?? DEFAULT_MAX_ROUNDS,
    openFixes: [],
    history: [{ stage: "drafting", note: "Draft started." }],
  };
  return { ok: true, draft };
}

function issueLine(issue: CriticIssue): string {
  return issue.suggestion ? `${issue.detail} ${issue.suggestion}` : issue.detail;
}

/** Marketing hands in wording. Marketing's checks and the Critic both run here. */
export function submitDraft(draft: MarketingDraft, text: string): DraftResult {
  if (draft.stage !== "drafting" && draft.stage !== "needs_changes") {
    return fail(`Cannot submit wording while the draft is in "${draft.stage}".`);
  }
  const round = draft.round + 1;

  const own = checkMarketingText(text, draft.verifiedClaims);
  const review: CriticVerdict = reviewWork({
    kind: "customer_reply",
    text,
    context: draft.verifiedDollarAmounts
      ? { verifiedDollarAmounts: draft.verifiedDollarAmounts }
      : undefined,
  });
  const issues = [...own, ...review.issues];

  if (issues.length > 0) {
    if (round >= draft.maxRounds) {
      return advance(
        draft,
        "stalled",
        `Stopped after ${draft.maxRounds} tries. Mason takes over.`,
        { round, text, openFixes: issues.map(issueLine) },
      );
    }
    return advance(draft, "needs_changes", `Try ${round} needs changes.`, {
      round,
      text,
      openFixes: issues.map(issueLine),
    });
  }
  return advance(draft, "awaiting_owner", `Try ${round} passed all checks.`, {
    round,
    text,
    openFixes: [],
  });
}

/** The owner's call on the wording. Only possible once everything above passed. */
export function recordOwnerDecision(
  draft: MarketingDraft,
  decision: { decision: "approve" } | { decision: "reject"; reason: string },
): DraftResult {
  if (draft.stage !== "awaiting_owner") {
    return fail(
      `The owner can only decide a draft that is waiting for them (this one is "${draft.stage}").`,
    );
  }
  if (decision.decision === "approve") {
    return advance(draft, "approved", "Owner approved the wording.");
  }
  if (decision.reason.trim().length === 0) return fail("Say why the draft was turned down.");
  return advance(draft, "rejected", `Owner turned it down: ${decision.reason.trim()}`);
}

/**
 * True only when the owner approved the exact wording that passed the checks.
 * Even then, nothing is published by this module: a channel integration, with
 * its platform rules and law verified, is a separate approval-required step.
 */
export function isReadyToPublish(draft: MarketingDraft): boolean {
  return draft.stage === "approved" && draft.text.trim().length > 0;
}

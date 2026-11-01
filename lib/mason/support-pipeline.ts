/**
 * Support reply pipeline: a pure state machine, like marketing-pipeline.ts.
 *
 *   customer message -> (sensitive? hand to owner, no draft)
 *                    -> reply wording -> Support checks + Critic -> awaiting_owner
 *                    -> approved | rejected
 *
 * - A sensitive customer message (damage, injury, refund, legal, complaint...)
 *   is never answered by Support. It stops at "stalled" with a note, and the
 *   owner handles it. This reuses the existing owner-approval signals so the
 *   rule lives in one place (escalation.ts).
 * - A reply reaches the owner only after Support's own checks AND the Critic
 *   both pass. There is no function that skips either.
 * - "approved" means the owner OKed the wording. It sends nothing.
 *
 * Pure and deterministic: no AI call, no database, no network, no cost.
 */
import { requiresOwnerApproval } from "./escalation";
import { reviewWork, type CriticIssue } from "./critic";
import type { DraftStage } from "./marketing-pipeline";

export interface SupportDraft {
  id: string;
  companyId: string;
  stage: DraftStage;
  customerMessage: string;
  text: string;
  round: number;
  maxRounds: number;
  openFixes: string[];
  history: { stage: DraftStage; note: string }[];
}

export type SupportResult = { ok: true; draft: SupportDraft } | { ok: false; error: string };

const DEFAULT_MAX_ROUNDS = 3;
export const MAX_SUPPORT_TEXT = 4000;

const OWNER_HANDOFF_NOTE =
  "This message needs you, not a drafted reply (damage, injury, refund, legal or a complaint). Support did not draft anything.";

// Things a support reply must never do on its own.
const PROMISES: ReadonlyArray<{ code: string; pattern: RegExp; detail: string }> = [
  {
    code: "admits_fault",
    pattern:
      /\b(?:our|my)\s+(?:fault|mistake|error)\b|\bwe\s+(?:damaged|broke|ruined|lost)\b|\bwe(?:'re| are)\s+(?:liable|responsible)\b/i,
    detail: "The reply admits fault or liability.",
  },
  {
    code: "offers_money_back",
    pattern:
      /\b(?:full\s+)?refund(?:ed|s)?\b|\bcompensat(?:e|ion)\b|\breimburs(?:e|ement)\b|\bmoney back\b/i,
    detail: "The reply offers money back or compensation.",
  },
  {
    code: "firm_promise",
    pattern:
      /\bi\s+promise\b|\bwe\s+promise\b|\b100%\s+(?:sure|certain|guaranteed)\b|\bguarantee[sd]?\b|\bdefinitely\s+will\b/i,
    detail: "The reply makes a firm promise.",
  },
  {
    code: "legal_or_insurance_advice",
    pattern:
      /\binsurance\s+(?:will|covers|cover)\b|\byou\s+(?:can|should|may)\s+sue\b|\blegally\b|\bliability\b/i,
    detail: "The reply gives legal or insurance advice.",
  },
];

export function checkSupportReply(text: string): CriticIssue[] {
  return PROMISES.filter((p) => p.pattern.test(text)).map((p) => ({
    code: p.code,
    severity: "block" as const,
    detail: p.detail,
    suggestion: "Take it out. If it matters, the owner answers it personally.",
  }));
}

function advance(
  draft: SupportDraft,
  stage: DraftStage,
  note: string,
  patch: Partial<SupportDraft> = {},
): SupportResult {
  return {
    ok: true,
    draft: { ...draft, ...patch, stage, history: [...draft.history, { stage, note }] },
  };
}

function issueLine(issue: CriticIssue): string {
  return issue.suggestion ? `${issue.detail} ${issue.suggestion}` : issue.detail;
}

/** Start a reply to a customer's message. Sensitive messages stop here, handed to the owner. */
export function createSupportDraft(input: {
  id: string;
  companyId: string;
  customerMessage: string;
  maxRounds?: number;
}): SupportResult {
  const customerMessage = input.customerMessage.replace(/\r\n/g, "\n").trim();
  if (customerMessage.length === 0 || customerMessage.length > MAX_SUPPORT_TEXT) {
    return {
      ok: false,
      error: `Paste what the customer wrote (up to ${MAX_SUPPORT_TEXT} characters).`,
    };
  }
  const base: SupportDraft = {
    id: input.id,
    companyId: input.companyId,
    stage: "drafting",
    customerMessage,
    text: "",
    round: 0,
    maxRounds: input.maxRounds ?? DEFAULT_MAX_ROUNDS,
    openFixes: [],
    history: [{ stage: "drafting", note: "Reply started." }],
  };
  if (requiresOwnerApproval(customerMessage)) {
    return advance(base, "stalled", OWNER_HANDOFF_NOTE, { openFixes: [OWNER_HANDOFF_NOTE] });
  }
  return { ok: true, draft: base };
}

/** Hand in reply wording. Support's checks and the Critic both run here. */
export function submitSupportReply(draft: SupportDraft, rawText: string): SupportResult {
  if (draft.stage !== "drafting" && draft.stage !== "needs_changes") {
    return { ok: false, error: `Cannot submit wording while the reply is in "${draft.stage}".` };
  }
  const text = rawText.replace(/\r\n/g, "\n").trim();
  if (text.length === 0 || text.length > MAX_SUPPORT_TEXT) {
    return { ok: false, error: `Write the reply (up to ${MAX_SUPPORT_TEXT} characters).` };
  }
  const round = draft.round + 1;
  const issues = [
    ...checkSupportReply(text),
    ...reviewWork({ kind: "customer_reply", text }).issues,
  ];
  if (issues.length > 0) {
    if (round >= draft.maxRounds) {
      return advance(draft, "stalled", `Stopped after ${draft.maxRounds} tries. You take over.`, {
        round,
        text,
        openFixes: issues.map(issueLine),
      });
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
export function recordSupportDecision(
  draft: SupportDraft,
  decision: { decision: "approve" } | { decision: "reject"; reason: string },
): SupportResult {
  if (draft.stage !== "awaiting_owner") {
    return {
      ok: false,
      error: `The owner can only decide a reply that is waiting for them (this one is "${draft.stage}").`,
    };
  }
  if (decision.decision === "approve") {
    return advance(draft, "approved", "Owner approved the wording.");
  }
  if (decision.reason.trim().length === 0)
    return { ok: false, error: "Say why the reply was turned down." };
  return advance(draft, "rejected", `Owner turned it down: ${decision.reason.trim()}`);
}

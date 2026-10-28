/**
 * The Builder → Designer → Critic → founder pipeline, as a pure state
 * machine. It encodes the founder's rule structurally: work can only
 * reach "approved" (the one state from which shipping is allowed) by
 * passing, in order, a Designer sign-off, a Critic PASS, and the
 * founder's approval. There is no function that skips a stage.
 *
 * Pure and deterministic — no AI call, no database, no deploy. It
 * decides what is allowed to happen next; it does not perform the work.
 * Persisting items and an audit trail is a later step.
 */
import { reviewWork, type CriticIssue, type CriticVerdict } from "./critic";
import { DESIGN_CHECKLIST, type DesignChecklistItem } from "./specialists/design-build";

export type PipelineStage =
  "building" | "design_review" | "critic_review" | "awaiting_founder" | "approved" | "stalled";

export type Viewport = "phone" | "tablet" | "desktop";

export interface Screenshot {
  viewport: Viewport;
  ref: string;
}

/** Everything the Builder hands over. There is no way to express "publish to production" here. */
export interface BuilderHandoff {
  summary: string;
  /** A private preview link — never a production URL. */
  previewUrl?: string;
  evidence: string[];
  screenshots: Screenshot[];
}

export type DesignerDecision =
  | { decision: "sign_off"; checklist: Partial<Record<DesignChecklistItem, boolean>> }
  | { decision: "changes_needed"; changes: string[] };

export interface PipelineEvent {
  stage: PipelineStage;
  note: string;
}

export interface WorkItem {
  id: string;
  title: string;
  stage: PipelineStage;
  /** Number of Builder handoffs so far. */
  round: number;
  maxRounds: number;
  handoff?: BuilderHandoff;
  /** What the Builder must address, from the last Designer/Critic/founder rejection. */
  openFixes: string[];
  history: PipelineEvent[];
}

export type PipelineResult = { ok: true; item: WorkItem } | { ok: false; error: string };

const DEFAULT_MAX_ROUNDS = 3;

function fail(error: string): PipelineResult {
  return { ok: false, error };
}

function advance(
  item: WorkItem,
  stage: PipelineStage,
  note: string,
  patch: Partial<WorkItem> = {},
): PipelineResult {
  return {
    ok: true,
    item: { ...item, ...patch, stage, history: [...item.history, { stage, note }] },
  };
}

function issueLine(issue: CriticIssue): string {
  return issue.suggestion ? `${issue.detail} ${issue.suggestion}` : issue.detail;
}

export function createWorkItem(
  id: string,
  title: string,
  maxRounds = DEFAULT_MAX_ROUNDS,
): WorkItem {
  return {
    id,
    title,
    stage: "building",
    round: 0,
    maxRounds,
    openFixes: [],
    history: [{ stage: "building", note: "Work item created." }],
  };
}

/** Builder hands over work. The Critic's handoff check runs here, so a bare "done" never reaches the Designer. */
export function submitBuilderHandoff(item: WorkItem, handoff: BuilderHandoff): PipelineResult {
  if (item.stage !== "building")
    return fail(`Cannot hand off work while the item is in "${item.stage}".`);

  const proof = [...handoff.evidence, ...handoff.screenshots.map((s) => s.ref)];
  const review = reviewWork({ kind: "work_handoff", text: handoff.summary, evidence: proof });
  if (review.verdict === "BLOCK") {
    return fail(`Handoff rejected: ${review.issues.map(issueLine).join(" ")}`);
  }

  const round = item.round + 1;
  if (round > item.maxRounds) {
    return advance(
      item,
      "stalled",
      `Stopped after ${item.maxRounds} rounds without sign-off. Mason takes over.`,
      {
        round,
        handoff,
      },
    );
  }
  return advance(item, "design_review", `Handoff ${round} received.`, {
    round,
    handoff,
    openFixes: [],
  });
}

export function recordDesignerDecision(item: WorkItem, decision: DesignerDecision): PipelineResult {
  if (item.stage !== "design_review" || !item.handoff) {
    return fail(
      `The Designer can only review work in "design_review" (item is in "${item.stage}").`,
    );
  }

  if (decision.decision === "changes_needed") {
    const changes = decision.changes.map((c) => c.trim()).filter((c) => c.length > 0);
    if (changes.length === 0) return fail("Changes needed must list at least one specific change.");
    return advance(item, "building", "Designer sent the work back.", { openFixes: changes });
  }

  if (!item.handoff.screenshots.some((s) => s.viewport === "phone")) {
    return fail(
      "Sign-off needs a phone-size screenshot. Nothing is signed off without seeing it on a phone.",
    );
  }
  const missing = DESIGN_CHECKLIST.filter((entry) => decision.checklist[entry] !== true);
  if (missing.length > 0) {
    return fail(
      `Sign-off needs every checklist item confirmed. Not confirmed: ${missing.join(", ")}.`,
    );
  }
  return advance(item, "critic_review", "Designer signed off.");
}

export function recordCriticVerdict(item: WorkItem, verdict: CriticVerdict): PipelineResult {
  if (item.stage !== "critic_review") {
    return fail(`The Critic can only review signed-off work (item is in "${item.stage}").`);
  }
  if (verdict.verdict === "PASS")
    return advance(item, "awaiting_founder", "Critic passed the work.");
  return advance(item, "building", `Critic returned ${verdict.verdict}.`, {
    openFixes: verdict.issues.map(issueLine),
  });
}

export function recordFounderDecision(
  item: WorkItem,
  decision: "approve" | "reject",
  note = "",
): PipelineResult {
  if (item.stage !== "awaiting_founder") {
    return fail(
      `Only work that passed Designer and Critic can be approved (item is in "${item.stage}").`,
    );
  }
  if (decision === "approve") return advance(item, "approved", "Founder approved.");
  return advance(item, "building", "Founder sent the work back.", {
    openFixes: note.trim() ? [note.trim()] : ["The founder asked for changes."],
  });
}

/** The only gate on shipping. True solely for founder-approved work. */
export function canShip(item: WorkItem): boolean {
  return item.stage === "approved";
}

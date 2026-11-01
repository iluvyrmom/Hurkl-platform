/**
 * Saved-draft helpers for Support replies in the Agents tab. Pure: turns a
 * database row into the Support pipeline's draft and back. The pipeline stays
 * the only place that decides what is allowed. No database, no AI call.
 */
import {
  createSupportDraft,
  recordSupportDecision,
  submitSupportReply,
  type SupportDraft,
} from "../mason/support-pipeline";
import type { DraftStage } from "../mason/marketing-pipeline";
import type { DraftSave, SaveResult } from "./drafts";

export const SUPPORT_SPECIALIST = "support_specialist";
export const SUPPORT_CHANNEL = "customer_reply";

export interface SupportRow {
  id: string;
  company_id: string;
  stage: string;
  body: string;
  context: string | null;
  round: number;
  open_fixes: unknown;
  history: unknown;
}

const STAGES: readonly string[] = [
  "drafting",
  "needs_changes",
  "awaiting_owner",
  "approved",
  "rejected",
  "stalled",
];

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function events(value: unknown): { stage: DraftStage; note: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((e) => {
    if (e && typeof e === "object" && "stage" in e && "note" in e) {
      const { stage, note } = e as { stage: unknown; note: unknown };
      if (typeof stage === "string" && STAGES.includes(stage) && typeof note === "string") {
        return [{ stage: stage as DraftStage, note }];
      }
    }
    return [];
  });
}

export function rowToSupportDraft(row: SupportRow): SupportDraft | null {
  if (!STAGES.includes(row.stage) || !row.context) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    stage: row.stage as DraftStage,
    customerMessage: row.context,
    text: row.body,
    round: row.round,
    maxRounds: 3,
    openFixes: strings(row.open_fixes),
    history: events(row.history),
  };
}

export function supportToSave(draft: SupportDraft): DraftSave & { context: string } {
  return {
    stage: draft.stage,
    body: draft.text,
    round: draft.round,
    open_fixes: draft.openFixes,
    history: draft.history,
    context: draft.customerMessage,
  };
}

export type SupportSaveResult =
  { ok: true; save: DraftSave & { context: string } } | { ok: false; error: string };

/**
 * The owner pastes what the customer wrote, and optionally their own reply
 * wording. A sensitive message stops at once and is handed to the owner.
 */
export function startSupport(input: {
  id: string;
  companyId: string;
  customerMessage: string;
  reply: string;
}): SupportSaveResult {
  const created = createSupportDraft({
    id: input.id,
    companyId: input.companyId,
    customerMessage: input.customerMessage,
  });
  if (!created.ok) return { ok: false, error: created.error };
  if (created.draft.stage === "stalled" || input.reply.trim().length === 0) {
    return { ok: true, save: supportToSave(created.draft) };
  }
  const submitted = submitSupportReply(created.draft, input.reply);
  if (!submitted.ok) return { ok: false, error: submitted.error };
  return { ok: true, save: supportToSave(submitted.draft) };
}

export function resubmitSupport(row: SupportRow, rawText: string): SupportSaveResult {
  const draft = rowToSupportDraft(row);
  if (!draft) return { ok: false, error: "That reply can't be opened." };
  const submitted = submitSupportReply(draft, rawText);
  if (!submitted.ok) return { ok: false, error: submitted.error };
  return { ok: true, save: supportToSave(submitted.draft) };
}

export function decideSupport(
  row: SupportRow,
  decision: string,
  reason: string,
): SupportSaveResult {
  const draft = rowToSupportDraft(row);
  if (!draft) return { ok: false, error: "That reply can't be opened." };
  const result =
    decision === "approve"
      ? recordSupportDecision(draft, { decision: "approve" })
      : decision === "reject"
        ? recordSupportDecision(draft, { decision: "reject", reason })
        : null;
  if (!result) return { ok: false, error: "Choose approve or turn down." };
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, save: supportToSave(result.draft) };
}

export type { SaveResult };

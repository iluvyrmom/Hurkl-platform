/**
 * Saved-draft helpers for the Agents tab. Pure: turns a database row into the
 * Marketing pipeline's draft and back, so the pipeline stays the only place
 * that decides what is allowed. No database, no AI call.
 */
import {
  createDraft,
  recordOwnerDecision,
  submitDraft,
  type DraftStage,
  type MarketingDraft,
} from "../mason/marketing-pipeline";
import { MARKETING_CHANNELS, type MarketingChannel } from "../mason/specialists/marketing";

export const MAX_DRAFT_LENGTH = 4000;

export interface DraftRow {
  id: string;
  company_id: string;
  channel: string;
  stage: string;
  body: string;
  round: number;
  open_fixes: unknown;
  history: unknown;
}

export interface DraftSave {
  stage: DraftStage;
  body: string;
  round: number;
  open_fixes: string[];
  history: { stage: DraftStage; note: string }[];
}

const STAGES: readonly string[] = [
  "drafting",
  "needs_changes",
  "awaiting_owner",
  "approved",
  "rejected",
  "stalled",
];

export const STAGE_LABELS: Record<DraftStage, string> = {
  drafting: "Being written",
  needs_changes: "Needs changes",
  awaiting_owner: "Waiting for you",
  approved: "Approved wording",
  rejected: "Turned down",
  stalled: "Stopped — needs Mason",
};

export const CHANNEL_LABELS: Record<MarketingChannel, string> = {
  website_copy: "Website words",
  business_profile_post: "Business profile post",
  social_post: "Social post",
  ad_copy: "Ad",
  review_request: "Review request",
  customer_email: "Customer email",
};

export function isMarketingChannel(value: string): value is MarketingChannel {
  return (MARKETING_CHANNELS as readonly string[]).includes(value);
}

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

/** Company claims (licensed, insured...) are not configured anywhere yet, so none are verified. */
export function rowToDraft(row: DraftRow): MarketingDraft | null {
  if (!isMarketingChannel(row.channel) || !STAGES.includes(row.stage)) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    channel: row.channel,
    stage: row.stage as DraftStage,
    text: row.body,
    verifiedClaims: [],
    round: row.round,
    maxRounds: 3,
    openFixes: strings(row.open_fixes),
    history: events(row.history),
  };
}

export function draftToSave(draft: MarketingDraft): DraftSave {
  return {
    stage: draft.stage,
    body: draft.text,
    round: draft.round,
    open_fixes: draft.openFixes,
    history: draft.history,
  };
}

export type SaveResult = { ok: true; save: DraftSave } | { ok: false; error: string };

function cleanText(raw: string): string | null {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (text.length === 0 || text.length > MAX_DRAFT_LENGTH) return null;
  return text;
}

/** Owner hands in wording for a new draft: Marketing's checks and the Critic both run. */
export function startAndCheck(input: {
  id: string;
  companyId: string;
  channel: string;
  text: string;
}): SaveResult {
  if (!isMarketingChannel(input.channel)) return { ok: false, error: "Pick what this is for." };
  const text = cleanText(input.text);
  if (!text)
    return { ok: false, error: `Write the wording (up to ${MAX_DRAFT_LENGTH} characters).` };
  const created = createDraft({ id: input.id, companyId: input.companyId, channel: input.channel });
  if (!created.ok) return { ok: false, error: created.error };
  const submitted = submitDraft(created.draft, text);
  if (!submitted.ok) return { ok: false, error: submitted.error };
  return { ok: true, save: draftToSave(submitted.draft) };
}

/** Owner fixes the wording after "needs changes" and hands it in again. */
export function resubmit(row: DraftRow, rawText: string): SaveResult {
  const draft = rowToDraft(row);
  if (!draft) return { ok: false, error: "That draft can't be opened." };
  const text = cleanText(rawText);
  if (!text)
    return { ok: false, error: `Write the wording (up to ${MAX_DRAFT_LENGTH} characters).` };
  const submitted = submitDraft(draft, text);
  if (!submitted.ok) return { ok: false, error: submitted.error };
  return { ok: true, save: draftToSave(submitted.draft) };
}

export function decide(row: DraftRow, decision: string, reason: string): SaveResult {
  const draft = rowToDraft(row);
  if (!draft) return { ok: false, error: "That draft can't be opened." };
  const result =
    decision === "approve"
      ? recordOwnerDecision(draft, { decision: "approve" })
      : decision === "reject"
        ? recordOwnerDecision(draft, { decision: "reject", reason })
        : null;
  if (!result) return { ok: false, error: "Choose approve or turn down." };
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, save: draftToSave(result.draft) };
}

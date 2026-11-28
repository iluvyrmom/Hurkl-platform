// HURKL — the trio for the founder's private Talk: Mason, Memory and the Verifier.
//
// Wires the coordinator (mason_trio.ts, unchanged rules) to the real pieces through small
// injected functions, so it is fully testable without network or database:
//   gather   — Memory: Mason's briefing, memory entries matching the question, the recent
//              conversation, plus Mason's own tool work for this message (read and write
//              results are evidence of what he looked up or saved).
//   draft    — Mason: his reply from that work; after a failed check, a corrected rewrite.
//   reviewMemory — Memory (code, no AI): spoken words match the written reply, nothing secret,
//              evidence is approved and in scope.
//   verify   — Verifier (a separate AI call): every claim about HURKL, its companies, people,
//              dates, prices, tasks or completed work must be backed by the evidence.
//   commit   — saves the checked reply and its audit row.
// Spending: every step is pre-authorized against the same daily/monthly ceilings as Mason, and
// the whole reply (work, rewrite, verification) is costed together.

import { runTrio, type TrioContext, type TrioEnvelope, type TrioEvidence, type TrioPorts, type TrioReceipt, type TrioScope } from "./mason_trio.ts";

export type Usage = { costUsd: number };
export type WorkResult = { reply: string; toolResults: { name: string; text: string }[]; costUsd: number };
export type VerifierVerdict = { approved: boolean; evidenceIds: string[]; reasons: string[] };
export type MemoryRow = { id: string; title: string; body: string; scope: string; company_id: string | null; status: string };

export type TrioTalkDeps = {
  requestId: string;
  question: string;
  briefing: string;
  conversation: string; // recent turns, oldest first, plain text
  searchMemory: (question: string) => Promise<MemoryRow[]>;
  doWork: (signal: AbortSignal) => Promise<WorkResult>;
  rewrite: (args: { draft: string; feedback: readonly string[]; evidence: readonly TrioEvidence[]; signal: AbortSignal }) => Promise<{ reply: string; costUsd: number }>;
  verifyModel: (args: { envelope: TrioEnvelope; evidence: readonly TrioEvidence[]; signal: AbortSignal }) => Promise<VerifierVerdict & { costUsd: number }>;
  /**
   * An independent Verifier that returns its own receipt (the OpenAI transport, mason_verifier.ts).
   * When given, it replaces verifyModel. addCost records what each check actually cost, including
   * checks that fail, so the reply's total cost stays complete.
   */
  verifyReceipt?: (envelope: TrioEnvelope, context: TrioContext, control: { signal: AbortSignal; attempt: number }, addCost: (usd: number) => void) => Promise<TrioReceipt>;
  spoken: (text: string) => string;
  /** May the next step spend up to this much more? (checks today's/month's ceilings) */
  canSpend: (moreUsd: number) => Promise<boolean>;
  commit: (envelope: TrioEnvelope, receipts: readonly TrioReceipt[]) => Promise<string>;
  providers: { mason: string; memory: string; verifier: string };
  allowSameProviderVerifier: boolean;
};

const FOUNDER: TrioScope = Object.freeze({ kind: "founder", companyId: null });
/** Most one step may cost before it is allowed to start (worst case, USD). */
export const STEP_CEILING_USD = { gather: 0.05, draft: 0.03, memory_review: 0, verification: 0.04, commit: 0 } as const;
const SECRET_LIKE = /\b(sk-[A-Za-z0-9_-]{16,}|sb_secret_[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|\d{13,19})\b/;

/** The fixed reply when a reply can't pass its checks. Approved wording; promises nothing. */
export const HOLDING_REPLY =
  "I want to be sure before I answer that, and I couldn't confirm it just now. Ask me again in a moment, or ask it a little differently.";

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

function scopeOf(row: MemoryRow): TrioScope | null {
  if (row.scope === "company") return row.company_id ? { kind: "company", companyId: row.company_id } : null;
  if (row.scope === "hurkl_core" || row.scope === "founder") return { kind: row.scope, companyId: null };
  return null;
}

async function sha(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Build all evidence for one founder message, within the coordinator's size limits. */
export async function buildEvidence(deps: Pick<TrioTalkDeps, "briefing" | "conversation" | "searchMemory">, question: string, work: WorkResult): Promise<TrioEvidence[]> {
  const out: TrioEvidence[] = [];
  let total = 0;
  const add = (e: TrioEvidence) => {
    if (out.length >= 50 || out.some((x) => x.id === e.id) || total + e.body.length > 32_000) return;
    total += e.body.length;
    out.push(e);
  };
  add({ id: "briefing", body: clip(deps.briefing, 7000), status: "active", scope: { kind: "hurkl_core", companyId: null } });
  if (deps.conversation.trim()) add({ id: "conversation", body: clip(deps.conversation, 3000), status: "active", scope: FOUNDER });
  work.toolResults.slice(0, 8).forEach((t, i) => add({ id: `tool-${i + 1}-${t.name}`, body: clip(t.text, 5000), status: "active", scope: FOUNDER }));
  for (const row of (await deps.searchMemory(question)).slice(0, 6)) {
    const s = scopeOf(row);
    if (!s || row.status !== "active") continue; // pending rules stay proposals, never evidence
    add({ id: row.id, body: clip(`${row.title}\n${row.body ?? ""}`, 3000), status: "active", scope: s });
  }
  return out;
}

/** Memory's own check (code, no AI). Returns the reasons it found, or none. */
export function memoryReasons(envelope: TrioEnvelope, spoken: (t: string) => string): string[] {
  const reasons: string[] = [];
  if (envelope.speechText !== spoken(envelope.text)) reasons.push("The spoken version must be generated from the exact written reply.");
  if (SECRET_LIKE.test(envelope.text)) reasons.push("Remove anything that looks like a key, password or card number.");
  return reasons;
}

export type TrioTalkOutcome = {
  status: "verified" | "blocked";
  reply: string;
  blockedReason: string | null;
  independence: string | null;
  attempts: number;
  stages: readonly string[];
  receipts: readonly TrioReceipt[];
  contextVersion: string | null;
  digest: string | null;
  recordId: string | null;
  costUsd: number;
};

/** One founder message through the whole trio. Never throws; a failure becomes HOLDING_REPLY. */
export async function talkThroughTrio(deps: TrioTalkDeps, deadlineMs = 50_000): Promise<TrioTalkOutcome> {
  let costUsd = 0;
  let work: WorkResult | null = null;
  let context: TrioContext | null = null;

  const ports: TrioPorts = {
    actors: { mason: "mason", memory: "memory", verifier: "verifier" },
    providers: deps.providers,
    authorizeStep: async (stage) => deps.canSpend(costUsd + (STEP_CEILING_USD[stage] ?? 0.05)),
    gather: async (_req, c) => {
      work = await deps.doWork(c.signal);
      costUsd += work.costUsd;
      const evidence = await buildEvidence(deps, deps.question, work);
      const version = (await sha(JSON.stringify(evidence.map((e) => [e.id, e.body])))).slice(0, 24);
      context = { version, scope: FOUNDER, evidence };
      return context;
    },
    draft: async (_req, ctx, feedback, c) => {
      let reply = work?.reply ?? "";
      if (feedback.length) {
        const r = await deps.rewrite({ draft: reply, feedback, evidence: ctx.evidence, signal: c.signal });
        costUsd += r.costUsd;
        reply = r.reply;
        if (work) work = { ...work, reply };
      }
      reply = reply.trim().slice(0, 8000) || "I'm here. What do you need?";
      return { text: reply, speechText: deps.spoken(reply) };
    },
    reviewMemory: async (envelope, ctx) => {
      const reasons = memoryReasons(envelope, deps.spoken);
      return {
        reviewerId: "memory", provider: deps.providers.memory, approved: reasons.length === 0,
        digest: envelope.digest, contextVersion: ctx.version, checkedEvidenceIds: ctx.evidence.map((e) => e.id), reasons,
      };
    },
    verify: async (envelope, ctx, c) => {
      if (deps.verifyReceipt) return deps.verifyReceipt(envelope, ctx, c, (usd) => { costUsd += Math.max(0, usd); });
      const v = await deps.verifyModel({ envelope, evidence: ctx.evidence, signal: c.signal });
      costUsd += v.costUsd;
      const known = new Set(ctx.evidence.map((e) => e.id));
      const ids = v.evidenceIds.filter((id) => known.has(id));
      const reasons = v.approved ? [] : (v.reasons.length ? v.reasons : ["The Verifier could not confirm the reply against memory."]);
      return {
        reviewerId: "verifier", provider: deps.providers.verifier, approved: v.approved && ids.length > 0,
        digest: envelope.digest, contextVersion: ctx.version, checkedEvidenceIds: ids.length ? ids : ["briefing"],
        reasons: v.approved && ids.length === 0 ? ["The Verifier must name the evidence it checked."] : reasons,
      };
    },
    commit: async (envelope, _ctx, receipts) => {
      const recordId = await deps.commit(envelope, receipts);
      return { recordId, digest: envelope.digest, contextVersion: envelope.contextVersion };
    },
  };

  const r = await runTrio({ id: deps.requestId, question: deps.question, scope: FOUNDER }, ports, {
    maxCorrections: 1, maxRoleInvocations: 9, deadlineMs, allowSameProviderVerifier: deps.allowSameProviderVerifier,
  });
  const ctx = context as TrioContext | null;
  if (r.status === "verified") {
    return {
      status: "verified", reply: r.response.text, blockedReason: null, independence: r.independence ?? null,
      attempts: r.attempts, stages: r.stages, receipts: r.receipts, contextVersion: r.response.contextVersion,
      digest: r.response.digest, recordId: r.recordId, costUsd,
    };
  }
  return {
    status: "blocked", reply: HOLDING_REPLY, blockedReason: r.reason, independence: r.independence ?? null,
    attempts: r.attempts, stages: r.stages, receipts: [], contextVersion: ctx?.version ?? null, digest: null, recordId: null, costUsd,
  };
}

/** The Verifier's instructions. It sees only evidence and the exact words, never Mason's reasoning. */
export const VERIFIER_SYSTEM = [
  "You are the Independent Verifier for Mason, HURKL's AI office manager. Josh, the founder, will read and hear Mason's reply only if you approve it.",
  "Check the WRITTEN reply and the SPOKEN version against the EVIDENCE (Mason's memory, his tool results and the recent conversation).",
  "Approve only if every statement about HURKL, its companies, people, prices, dates, statuses, tasks, decisions, connections or completed work is supported by the evidence, or is clearly worded as unknown or uncertain.",
  "Reject: invented facts; claims that something was saved, sent, done or checked without evidence of it; claims Mason can send customer messages, call, spend money or change a customer's setup; one company's details used for another; the spoken version saying something different from the written one.",
  "Plain conversation, questions back to Josh, offers to help and general knowledge that is not about HURKL do not need evidence.",
  "Reply with JSON only, no other text: {\"approved\": true|false, \"evidence_ids\": [ids you checked, at least one; use \"briefing\" when the reply makes no factual claims], \"reasons\": [each specific problem and how to fix it; empty when approved]}",
].join("\n");

export function verifierUserMessage(envelope: TrioEnvelope, evidence: readonly TrioEvidence[]): string {
  const ev = evidence.map((e) => `<evidence id="${e.id}">\n${e.body}\n</evidence>`).join("\n");
  return `EVIDENCE\n${ev}\n\nWRITTEN REPLY\n<<<\n${envelope.text}\n>>>\n\nSPOKEN VERSION\n<<<\n${envelope.speechText}\n>>>`;
}

/** Parse the Verifier's JSON strictly; anything unreadable is a rejection, never an approval. */
export function parseVerdict(raw: string): VerifierVerdict {
  const m = raw.match(/\{[\s\S]*\}/);
  try {
    const j = JSON.parse(m ? m[0] : raw);
    const ids = Array.isArray(j.evidence_ids) ? j.evidence_ids.map(String).slice(0, 50) : [];
    const reasons = Array.isArray(j.reasons) ? j.reasons.map((x: unknown) => String(x).slice(0, 400)).slice(0, 8) : [];
    return { approved: j.approved === true && reasons.length === 0, evidenceIds: ids, reasons };
  } catch {
    return { approved: false, evidenceIds: [], reasons: ["The Verifier's answer could not be read."] };
  }
}

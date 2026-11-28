// The private trio pilot's coordinator. No provider, speech, customer-send or database
// implementation lives here: existing adapters supply those operations. This module
// only returns releasable wording after independent, evidence-bound checks and a
// successful memory commit. It is not yet wired into the production Talk endpoint.

export type TrioScope = Readonly<{
  kind: "hurkl_core" | "founder" | "company";
  companyId: string | null;
}>;
export type TrioRequest = Readonly<{ id: string; question: string; scope: TrioScope }>;
export type TrioEvidence = Readonly<{ id: string; body: string; status: string; scope: TrioScope }>;
export type TrioContext = Readonly<{
  version: string;
  scope: TrioScope;
  evidence: readonly TrioEvidence[];
}>;
export type TrioDraft = Readonly<{ text: string; speechText: string }>;
export type TrioEnvelope = Readonly<
  TrioDraft & { requestId: string; contextVersion: string; scope: TrioScope; digest: string }
>;
export type TrioReceipt = Readonly<{
  reviewerId: string;
  provider: string;
  approved: boolean;
  digest: string;
  contextVersion: string;
  checkedEvidenceIds: readonly string[];
  reasons: readonly string[];
}>;
type Stage = "gather" | "draft" | "memory_review" | "verification" | "commit";
type Control = Readonly<{ signal: AbortSignal; attempt: number }>;

// Provider adapters remain replaceable; the approved pilot uses an OpenAI verifier.
export const DEFAULT_TRIO_PROVIDERS = Object.freeze({
  mason: "anthropic",
  memory: "anthropic",
  verifier: "openai",
});

export type TrioPorts = {
  actors: Readonly<{ mason: string; memory: string; verifier: string }>;
  providers: Readonly<{ mason: string; memory: string; verifier: string }>;
  // Must reserve/check the SAME aggregate budget for every role before any provider call.
  // The adapter owns price lookup, atomic reservations, usage settlement and persistence.
  authorizeStep: (stage: Stage, control: Control) => Promise<boolean>;
  gather: (request: TrioRequest, control: Control) => Promise<TrioContext>;
  draft: (
    request: TrioRequest,
    context: TrioContext,
    feedback: readonly string[],
    control: Control,
  ) => Promise<TrioDraft>;
  reviewMemory: (
    envelope: TrioEnvelope,
    context: TrioContext,
    control: Control,
  ) => Promise<TrioReceipt>;
  verify: (envelope: TrioEnvelope, context: TrioContext, control: Control) => Promise<TrioReceipt>;
  // Adapter must atomically reject stale context and commit idempotently by requestId.
  // Store verified results/lessons as such; this does not authorize new business rules.
  commit: (
    envelope: TrioEnvelope,
    context: TrioContext,
    receipts: readonly TrioReceipt[],
    control: Control,
  ) => Promise<{ digest: string; contextVersion: string; recordId: string }>;
};

export type TrioResult =
  | {
      status: "verified";
      response: TrioEnvelope;
      receipts: readonly TrioReceipt[];
      recordId: string;
      attempts: number;
      stages: readonly string[];
    }
  | { status: "blocked"; reason: string; attempts: number; stages: readonly string[] };

const sameScope = (a: TrioScope, b: TrioScope) => a.kind === b.kind && a.companyId === b.companyId;
const validScope = (s: TrioScope) =>
  !!s &&
  ["hurkl_core", "founder", "company"].includes(s.kind) &&
  (s.kind === "company"
    ? typeof s.companyId === "string" && s.companyId.length > 0
    : s.companyId === null);
const evidenceAllowed = (source: TrioScope, target: TrioScope) =>
  validScope(source) && (source.kind === "hurkl_core" || sameScope(source, target));

async function envelopeFor(
  request: TrioRequest,
  context: TrioContext,
  draft: TrioDraft,
): Promise<TrioEnvelope> {
  if (
    typeof draft.text !== "string" ||
    typeof draft.speechText !== "string" ||
    !draft.text.trim() ||
    !draft.speechText.trim() ||
    draft.text.length > 8000 ||
    draft.speechText.length > 8000
  ) {
    throw new Error("invalid_draft");
  }
  const content = JSON.stringify([
    request.id,
    request.scope.kind,
    request.scope.companyId,
    context.version,
    draft.text,
    draft.speechText,
  ]);
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content))),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return Object.freeze({
    requestId: request.id,
    scope: request.scope,
    contextVersion: context.version,
    text: draft.text,
    speechText: draft.speechText,
    digest,
  });
}

function receiptValid(
  receipt: TrioReceipt,
  reviewerId: string,
  provider: string,
  envelope: TrioEnvelope,
  context: TrioContext,
) {
  const sources = new Set(context.evidence.map((e) => e.id));
  return (
    receipt?.reviewerId === reviewerId &&
    receipt.provider === provider &&
    receipt.approved === true &&
    receipt.digest === envelope.digest &&
    receipt.contextVersion === context.version &&
    Array.isArray(receipt.checkedEvidenceIds) &&
    receipt.checkedEvidenceIds.length > 0 &&
    receipt.checkedEvidenceIds.every((id) => sources.has(id)) &&
    Array.isArray(receipt.reasons) &&
    receipt.reasons.length === 0
  );
}

/**
 * Run the three peer responsibilities, with one outward voice. Receipts bind exact
 * text, spoken wording, request, company and context version; a second model simply
 * agreeing is not evidence. Actual factual assessment is the reviewers' job.
 * Blocked results deliberately contain no unchecked draft or provider error text.
 */
export async function runTrio(
  requestInput: TrioRequest,
  ports: TrioPorts,
  limits: { maxCorrections?: number; maxRoleInvocations?: number; deadlineMs?: number } = {},
): Promise<TrioResult> {
  const maxCorrections = limits.maxCorrections ?? 1;
  const maxRoleInvocations = limits.maxRoleInvocations ?? 8;
  const deadlineMs = limits.deadlineMs ?? 30_000;
  const stages: string[] = [];
  let attempts = 0,
    invocations = 0,
    stage = "configuration";
  const blocked = (reason: string): TrioResult => ({
    status: "blocked",
    reason,
    attempts,
    stages: [...stages],
  });
  if (
    !Number.isInteger(maxCorrections) ||
    maxCorrections < 0 ||
    maxCorrections > 2 ||
    !Number.isInteger(maxRoleInvocations) ||
    maxRoleInvocations < 1 ||
    maxRoleInvocations > 12 ||
    !Number.isInteger(deadlineMs) ||
    deadlineMs < 1 ||
    deadlineMs > 60_000 ||
    !requestInput.id ||
    typeof requestInput.question !== "string" ||
    requestInput.question.length > 4000 ||
    !validScope(requestInput.scope)
  )
    return blocked("invalid_configuration");
  const actors = Object.freeze({ ...ports.actors });
  const providers = Object.freeze({ ...ports.providers });
  if (
    [actors.mason, actors.memory, actors.verifier].some((id) => !id) ||
    Object.values(actors).some((id) => typeof id !== "string" || !id.trim()) ||
    new Set(Object.values(actors)).size !== 3
  )
    return blocked("reviewers_must_be_independent");
  if (
    [providers.mason, providers.memory, providers.verifier].some(
      (provider) => typeof provider !== "string" || !provider.trim(),
    )
  )
    return blocked("invalid_provider_configuration");
  if (providers.mason.trim().toLowerCase() === providers.verifier.trim().toLowerCase())
    return blocked("verifier_requires_independent_provider");
  const request = Object.freeze({
    ...requestInput,
    scope: Object.freeze({ ...requestInput.scope }),
  });
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("deadline"));
    }, deadlineMs);
  });
  async function step<T>(name: Stage, operation: (control: Control) => Promise<T>): Promise<T> {
    stage = name;
    if (controller.signal.aborted || ++invocations > maxRoleInvocations) throw new Error("limit");
    const control = Object.freeze({ signal: controller.signal, attempt: attempts });
    if (!(await ports.authorizeStep(name, control))) throw new Error("budget");
    if (controller.signal.aborted) throw new Error("deadline");
    stages.push(`${name}:${attempts}`);
    return operation(control);
  }
  async function execute(): Promise<TrioResult> {
    const raw = await step("gather", (c) => ports.gather(request, c));
    if (
      !raw ||
      !validScope(raw.scope) ||
      !sameScope(raw.scope, request.scope) ||
      !raw.version ||
      !Array.isArray(raw.evidence) ||
      raw.evidence.length > 50 ||
      new Set(raw.evidence.map((e) => e.id)).size !== raw.evidence.length ||
      raw.evidence.some(
        (e) =>
          !e.id ||
          e.status !== "active" ||
          !evidenceAllowed(e.scope, request.scope) ||
          typeof e.body !== "string" ||
          e.body.length > 8000,
      ) ||
      raw.evidence.reduce((n, e) => n + e.body.length, 0) > 32_000
    )
      return blocked("invalid_or_unapproved_context");
    const context: TrioContext = Object.freeze({
      version: raw.version,
      scope: request.scope,
      evidence: Object.freeze(
        raw.evidence.map((e) => Object.freeze({ ...e, scope: Object.freeze({ ...e.scope }) })),
      ),
    });
    let feedback: readonly string[] = [];
    for (let attempt = 0; attempt <= maxCorrections; attempt++) {
      attempts = attempt + 1;
      const draft = await step("draft", (c) => ports.draft(request, context, feedback, c));
      const envelope = await envelopeFor(request, context, draft);
      const memory = await step("memory_review", (c) => ports.reviewMemory(envelope, context, c));
      const verifier = await step("verification", (c) => ports.verify(envelope, context, c));
      if (
        receiptValid(memory, actors.memory, providers.memory, envelope, context) &&
        receiptValid(verifier, actors.verifier, providers.verifier, envelope, context)
      ) {
        // Copy receipts so a worker cannot mutate its verdict after this gate.
        const receipts = Object.freeze(
          [memory, verifier].map((r) =>
            Object.freeze({
              ...r,
              checkedEvidenceIds: Object.freeze([...r.checkedEvidenceIds]),
              reasons: Object.freeze([...r.reasons]),
            }),
          ),
        );
        const committed = await step("commit", (c) => ports.commit(envelope, context, receipts, c));
        if (controller.signal.aborted) throw new Error("deadline");
        if (
          !committed?.recordId ||
          committed.digest !== envelope.digest ||
          committed.contextVersion !== context.version
        ) {
          return blocked("memory_commit_not_verified");
        }
        return {
          status: "verified",
          response: envelope,
          receipts,
          recordId: committed.recordId,
          attempts,
          stages: [...stages],
        };
      }
      feedback = Object.freeze(
        [
          ...new Set([
            ...(memory?.reasons ?? []),
            ...(verifier?.reasons ?? []),
            "Correct the response and obtain fresh evidence-bound checks for both written and spoken wording.",
          ]),
        ].slice(0, 8),
      );
    }
    return blocked("review_not_passed");
  }
  try {
    return await Promise.race([execute(), expired]);
  } catch {
    controller.abort();
    return blocked(`stopped_at_${stage}`);
  } finally {
    clearTimeout(timeout!);
  }
}

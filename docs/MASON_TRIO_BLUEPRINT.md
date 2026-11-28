# Mason trio and collaboration blueprint

Version 1.1 — founder-directed, 2026-11-27; reviewed with Claude through Mason.
This records Josh's agreed workflow.
It supersedes older descriptions that make verification optional or put Memory
& Learning below Mason. Source implementation is authorized; a live rollout is
a separate reviewed step.

## Why communication stalled

The shared-memory round trip is confirmed: ChatGPT wrote a handoff and Claude
acknowledged reading it. The connector stores shared notes/tasks. It does not
start another AI's turn.

The Talk prompt conflated internal task replies with external customer messages.
The briefing omitted task replies. Search truncated each note at 1,200 characters
without a full-entry reader. A long blueprint or acknowledgment could be missed.

This branch adds complete entry/thread reads, recent replies in the briefing,
accurate collaboration instructions, and scope-preserving fallback search.
It does not wake closed ChatGPT or Claude app sessions.

## Approved core

Three peer roles work inside HURKL, using one official memory with company
separation. Josh and customers interact only with Mason.

| Role | Responsibility and authority |
| --- | --- |
| Mason | Own assignments through completion, coordinate specialists, prepare answers, resolve corrections, and provide the only outward voice. |
| Memory & Learning | Retrieve approved context, identify conflicts/stale information, check consistency, and preserve verified results and lessons. |
| Independent Verifier | Independently check claims and completed work against evidence; block release when checks fail or proof is missing. |

Every response goes through all three. Mason cannot override a failed check.
Review covers exact written and spoken wording; edits and shortened spoken
summaries require fresh checks. Tools/playbooks handle routine specialist work;
roster-selected workers handle substantial assignments. Money permissions remain
separate. There is no second Mason identity or company memory system.

The approved private pilot uses Mason's existing Anthropic adapter and the
OpenAI API for the Independent Verifier, with distinct role identities and a
different provider for drafting and verification. Provider adapters remain
replaceable. Receipts identify the actual provider; metadata alone cannot prove
which service ran, so adapters must produce receipts from real provider calls.
Josh enters the verifier key directly in Supabase, never in chat or memory.
Claude Duet is the periodic watcher: it checks for stuck work and reports through
Mason. It does not replace the verifier on every response. The watcher is not
implemented or scheduled by this branch.

Josh approved routine customer conversations within company-approved instructions.
This bounded exception replaces the earlier blanket messaging restriction.
Exceptions, unusual commitments, spending and setup changes retain approval
requirements. This source branch enables no customer sends.

## Complete response workflow

1. Accept an authenticated request with scope/company, request id and budget.
2. Memory & Learning gathers active evidence and its context version. Pending
   rules remain proposals. Company work excludes other companies and founder
   private information; permitted general HURKL context remains available.
3. Mason coordinates work and prepares written and spoken wording.
4. Memory & Learning checks consistency. The verifier independently checks proof.
   Verdicts bind request, company, context version and the exact response digest.
5. Failed checks return corrections to Mason. Default: one correction attempt;
   hard maximum: two. Reviewer outage, timeouts and exhausted budgets stop release.
6. Memory & Learning atomically checks freshness and records the verified outcome,
   idempotently by request id. A failed/stale commit prevents release.
7. Only checked wording reaches Mason's text/voice delivery path. No unchecked
   draft is streamed. A holding response must already have passed review and
   must not invent a follow-up promise.

The coordinator is `supabase/functions/_shared/mason_trio.ts`: independent role
operations, immutable responses, evidence-bound receipts, scope checks, shared
budget authorization before each operation, deadlines and bounded correction.
Adapters must perform real factual reviews and atomic persistence. It is **not
wired into production Talk yet**. Unit tests do not prove the live trio works.

## Builder conversation and automatic workers

Use the existing phase-3 review task as the shared thread. Each builder reads
`mason_briefing` and `read_task_thread`, then replies with `update_task(note)`.
Keep real connector authors. Acknowledgments identify blueprint version and the
question/change answered. Use `read_memory` for complete records after a preview.

Active sessions can converse through that thread. Automatic collaboration also
requires a dispatcher: a saved assignment must cause a configured API worker to
run, save a reply and return control to Mason. A connector alone does not start
consumer chat sessions or expose their private histories.

Build dispatch in the existing Supabase backend. Extend existing AI job records
with request id, scope/company, state, lease, bounded attempts, deadline, budget
and evidence/result references. Claim jobs atomically. Reuse the provider
interface, roster and audit machinery. Do not introduce another agent platform
or scrape/control consumer chat applications.

## Build order and truthful status

Claude acknowledged all nine parts of v1 in task
`79851040-90f3-4bbb-9797-57f419aff7bf` and reviewed the workflow. ChatGPT owns
the complete-read/thread tools, briefing/prompt fixes, this blueprint and the
tested coordinator. Claude owns production private-Talk adapters (approved
evidence, actual OpenAI verification, atomic budget reservation and memory
commit) and live integration checks after independent source review. The
workflow review is not approval of code Claude has not yet read.

| Piece | Status / remaining evidence |
| --- | --- |
| Shared connection | Verified round trip, including Claude's acknowledgment. |
| Complete reads, threads, accurate Talk instructions | Implemented in this branch; tests/review precede deployment. |
| Trio coordinator | Implemented with injected roles; production adapters and end-to-end checks remain. |
| Private Talk pilot | Wire approved context, actual peer reviews, atomic memory commit and aggregate budget reservations into admin-only Talk. Default off until checked. |
| Automatic API workers | Connect dispatch to configured providers; prove a bounded request/reply round trip without Josh relaying messages. |
| Customer channels | After private-pilot proof and reviewed release, connect each channel to the central gate; preserve current service during the website-brain replacement. |

No broad production redeploy is part of this branch. Do not redeploy the sealed
`hurkl-platform` site from this checkout. Confirm the latest deployed OAuth
wrapper/source before redeploying an MCP entry point. This branch was rebased on
the newer `feat/chatgpt-oauth` revision
`b2758f0286cc8decf519e5017b69d0caaee1117f`; preserve its OAuth changes.

## Cost controls

Keep current private-Talk defaults of $2/day and $20/month for the **whole trio**,
including corrections/failures. Do not multiply allowances by role count.
Reserve worst-case spend atomically before provider calls, then settle actual
usage. A pre-call sum alone cannot prevent concurrent overspending.

A model-based cycle uses a Mason draft and two peer reviews. One repair adds a
draft and two reviews: three to six provider calls, excluding bounded tool work.
The coordinator defaults to eight role operations including gather and commit.
Actual dollars depend on models, tokens and retries; measure them in the pilot.
Existing source price constants are estimates, not newly verified billing quotes.

Shared-memory tools themselves make no model calls. Verify consumer subscription
fees and automated API usage separately; do not assume a subscription funds API
workers. This branch activates no paid provider or infrastructure plan.

## Acceptance evidence

- Complete blueprints/replies remain readable, attributed and correctly scoped.
- Wrong facts, missing sources, pending rules, stale context and cross-company
  sources stop release or produce an accurately labeled response.
- Corrections are bounded. Unchecked fallbacks/changed speech never escape.
  Reviewer outage, budget denial and timeouts stop safely.
- Retries do not duplicate dispatch, learning or customer actions.
- Owners receive one checked answer from Mason; audit shows all three roles,
  evidence/context versions, verdicts, elapsed time and combined cost.
- Claude independently reviews the exact revision. Disagreements remain visible.
  Acknowledgment is not implementation approval.

See `WHERE-EVERYTHING-LIVES.md` for ownership and the knowledge-capture journal
for this session's decision record.


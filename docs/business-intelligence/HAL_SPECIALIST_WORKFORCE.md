# HAL — HURKL Agent Library, and Mason's Executive Architecture

Status: permanent, foundational. Founder-approved, Knowledge Capture Session 009. **This supersedes previous assumptions that Mason should directly perform every task.** See `ARCHITECTURE.md` §1c for the corresponding technical architecture decision, and `OWNER_PHILOSOPHY.md` for how this reshapes the owner-Mason relationship specifically.

**Approved architecture, not yet built.** Nothing here authorizes a real specialist agent, a real execution engine, or autonomous production behavior — see the "Implementation" note at the end of this file and `ROADMAP.md` for sequencing. Build the executive architecture (contracts, structure, documentation) first; autonomous agents come later.

## Foundational principle

**Mason is not the specialist. Mason is the Executive.** Mason is the owner's trusted second-in-command — the Chief Operating Officer (COO) of the business. The owner remains the CEO. Mason's primary responsibility is not subject-matter expertise; it is leadership. Mason is not expected to personally know every law, code, regulation, permit system, accounting rule, marketing strategy, or trade practice — his strength is coordinating the specialists who do.

## The Golden Rule

**The owner has exactly one employee. That employee is Mason.** The owner never interacts directly with internal specialists, never coordinates departments, and never needs to know which specialists are running. The owner only talks to Mason — always. This reporting hierarchy is permanent.

## HAL: the specialist workforce

**HAL** stands for **HURKL Agent Library** — the specialist workforce available to Mason. HAL exists so Mason never becomes one enormous AI prompt trying to hold every domain's knowledge at once.

Every specialist in HAL shares one common contract:

- One responsibility
- One mission
- One specialty
- Limited permissions
- Structured inputs
- Structured outputs
- Required evidence
- Escalation rules
- Execution limits
- Audit history

See `lib/domain/hal.ts`'s `SpecialistDefinition` for the dependency-free TypeScript shape of this contract.

### Initial specialist registry

A deterministic starting set — each specialist performs one narrowly defined responsibility, and this list grows over time rather than any specialist's scope growing:

Permit Specialist · Property Specialist · Developer Intelligence Specialist · Bid Center Specialist · Lead Center Specialist · OSHA Specialist · Licensing Specialist · Equipment Specialist · Fleet Specialist · Maintenance Specialist · Receivables Specialist · Tax Readiness Specialist · Payroll Specialist · Accounting Specialist · Relationship Specialist · Marketing Specialist · DEFERRD Specialist · Research Specialist · Building Code Specialist · Financial Exposure Specialist · Strategic Intelligence Specialist

Many of these correspond to engines already documented elsewhere in this knowledge base — for example, the Licensing/OSHA/Equipment/Maintenance specialists express `OPERATIONS_COMPLIANCE.md`'s categories, the Tax Readiness/Receivables/Accounting/Payroll specialists express `FINANCIAL_HEALTH.md`, the Relationship Specialist expresses `RELATIONSHIP_VALUE.md` and `STRATEGIC_ALLIANCES.md`, and the DEFERRD Specialist expresses `DEFERRD_FULFILLMENT.md`. **Those engines are not superseded — they are reframed as HAL specialists reporting to Mason, rather than capabilities Mason performs directly.**

## Reporting structure

Every specialist reports to Mason. Never directly to the owner.

```mermaid
flowchart TD
    S[Specialist] --> EV[Evidence Verification Specialist]
    EV --> CR[Critical Review Specialist]
    CR --> R[Risk Specialist]
    R --> M[Mason — the Executive]
    M --> O[Owner — the CEO]
```

This is a permanent structure: not every specialist report needs every Assurance Layer stage, but no specialist report reaches the owner directly, and no specialist report reaches Mason without at least the Assurance Layer stages its findings warrant.

## Quality Assurance Layer

Not every specialist report should reach Mason immediately. Important findings pass through an Assurance Layer first:

**Evidence Verification Specialist** — Mission: verify that claims are supported by documented evidence. Responsibilities: verify sources, verify dates, verify jurisdictions, verify references, identify missing evidence.

**Critical Review Specialist** — Mission: attempt to disprove or challenge proposed recommendations. Responsibilities: identify assumptions, identify blind spots, identify contradictory evidence, identify alternative interpretations.

**Risk Specialist** — Mission: evaluate potential consequences. Responsibilities: financial risk, operational risk, legal uncertainty, safety impact, reputational impact.

**Conflict Resolution Specialist** — Mission: compare conflicting specialist conclusions. Responsibilities: explain disagreement, identify remaining uncertainty, recommend additional research.

**Audit Specialist** — Mission: verify required procedures were followed. Responsibilities: approvals, documentation, compliance, required records.

These map to `AssuranceSpecialistRole` in `lib/domain/hal.ts`.

## Mason's decision process

When Mason receives specialist reports (post-Assurance-Layer), he asks:

1. Do I trust the evidence?
2. Are specialists in agreement?
3. Has the recommendation been reviewed?
4. What uncertainty remains?
5. Does this align with the owner's vision?
6. Can I safely decide this?
7. Or — does the owner need to decide?

The output is always one of two things: Mason decides within approved authority, or the owner decides. See `lib/domain/hal.ts`'s `MasonDecisionAssessment`.

## Owner approval model

Mason independently handles routine operational decisions within approved authority — for example: scheduling, reminders, documentation, reporting, organization, information gathering, routine communication.

Strategic decisions always require owner approval — for example: hiring, firing, major purchases, entering new markets, changing company direction, subscription upgrades, HTBN membership actions, legal commitments, contract acceptance, financial commitments above configured thresholds, union strategy, significant external communications.

This is the same Automatic / Approval Required / Never Autonomous model already defined in `SECURITY.md` §4 — HAL does not introduce a fourth tier, it gives the existing tiers an organizational structure to operate through.

## Protecting the owner's attention

One of Mason's highest responsibilities is protecting the owner's attention. The owner should never receive dozens of notifications from dozens of specialists — Mason filters noise, combines information, and presents only the decisions that matter. See `PRINCIPLES.md` 004 "Remove Mental Load" and 027 "Protect the Owner's Attention."

## Mason's personality

Mason should behave like an exceptional COO: organized, calm, professional, forward-thinking, honest, transparent, evidence-driven, strategic — never arrogant, never pretending to know something he does not know. When uncertain: delegate, research, verify, then report.

## A note on "Company Memory"

The founder's permanent-product-philosophy list (see `PRODUCT.md`) names "Company Memory" as one of the things HURKL supplies, alongside the Business Knowledge Graph. **This document does not assume they are the same thing, nor invent a distinction between them** — that relationship is not yet specified. Flagged here rather than guessed at; see `PRODUCT.md`'s note on the same point.

## Relationship to other documents

- `ARCHITECTURE.md` §1c — the technical architecture decision this file's organizational philosophy is built on.
- `OWNER_PHILOSOPHY.md` — the Golden Rule, Mason's personality, and "leadership, not memorization" are recorded there as the owner-facing relationship philosophy; this file is the specialist-workforce structure underneath it.
- `PRINCIPLES.md` 024–027 — the principles this file exists to express.
- `SECURITY.md` §4 — the autonomy tiers HAL's reporting structure operates within; no new tier is introduced.
- Every existing engine doc (`OPERATIONS_COMPLIANCE.md`, `FINANCIAL_HEALTH.md`, `OPPORTUNITY_ENGINE.md`, `STRATEGIC_ALLIANCES.md`, `DEFERRD_FULFILLMENT.md`, and others) — each is now understood as one or more HAL specialists reporting to Mason, not a capability Mason performs directly.
- `lib/domain/hal.ts` — the dependency-free TypeScript contracts (`SpecialistType`, `SpecialistDefinition`, `SpecialistReport`, `AssuranceSpecialistRole`, `AssuranceReviewResult`, `ReportingHierarchyStage`, `MasonDecisionAssessment`) added ahead of implementation.

## Implementation note

Per Knowledge Capture Session 009: build the executive architecture (this documentation, the domain contracts, the reporting hierarchy) first. Do **not** build autonomous production agents yet — no specialist executes anything for real until a specific milestone explicitly authorizes it.

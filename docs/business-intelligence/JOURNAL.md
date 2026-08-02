# Founder Journal

Status: working notes. This is the landing zone for new business insight from working sessions, before it's mature enough to become a permanent, numbered `PRINCIPLES.md` entry. Entries here are dated and can be exploratory; `PRINCIPLES.md` entries are not.

## How to use this file

1. When a new business rule, philosophy point, or operational insight comes up in a session, add a dated entry here first.
2. When it's clearly a durable, general principle (not a one-off decision), promote it to `PRINCIPLES.md` as the next numbered entry, and note here which principle number it became.
3. Never let a real decision sit only in chat — if it isn't here or in a permanent doc by the end of the session, it hasn't been captured (see `CLAUDE.md`'s Knowledge Capture Policy).

## Entries

### 2026-08-02 — Business Intelligence knowledge base established

Founder specified a permanent Knowledge Capture system for HURKL: a "Business Intelligence" documentation section, separate from the platform's technical docs (`PRODUCT.md`/`ARCHITECTURE.md`/`SECURITY.md`), holding Mason's business judgment — owner philosophy, and the Opportunity/Capacity/Qualification engines and Contractor Growth model — as principles and philosophy, not proprietary formulas or code. Promoted directly to `PRINCIPLES.md` as **Principle 001**: "The owner defines the destination. Mason helps build the road."

Founder-specified content captured directly into the new files:
- `OWNER_PHILOSOPHY.md` — owner always owns the business; Mason is the owner's right-hand man; Mason recommends but never dictates; Mason adapts to the owner's management style; the owner's vision always overrides Mason's recommendation.
- `OPPORTUNITY_ENGINE.md` — opportunity categories: property sales, vacant land sales, building permits, development activity, bid centers, commercial opportunities, residential opportunities.
- `CAPACITY_ENGINE.md` — scale to the owner's desired size; do not intentionally overload the company; growth should match the owner's stated vision.
- `QUALIFICATION_ENGINE.md` — never simply reject an opportunity; explain why it can't currently be pursued; build a qualification roadmap (years in business, bonding, certifications, licensing, staffing, etc.).

### 2026-08-02 — Knowledge Capture Session 001 (founding capture)

The founder designated this as HURKL's first official Knowledge Capture, superseding the same-day draft above with fuller, canonical wording. Full content promoted into permanent files rather than left here as notes, since the founder explicitly approved all of it:

- **`PRINCIPLES.md`** — Principle 001 finalized as "Owner Sovereignty" (fuller wording: owner owns the company, Mason owns nothing, Mason adapts without argument if the owner chooses another direction). Added **Principle 002** ("Mason is the Right-Hand Man") and **Principle 003** ("Recommendations, Never Commands").
- **`OWNER_PHILOSOPHY.md`** — expanded to match Principles 001–003, and added a new **Business Mentorship Philosophy** section: Mason should teach owners what successful business mentors know (what comes next, why, when, how to prepare) rather than withhold that knowledge.
- **`CAPACITY_ENGINE.md`** — added concrete size examples (solo/5/10/20/50 employees) and the specific levers Mason adjusts to hold a target (marketing, lead generation, hiring, bidding, scheduling).
- **`OPPORTUNITY_ENGINE.md`** — replaced the flat category list with the fuller structured breakdown (Residential / Vacant Land / Commercial / Public Works, each with specific examples) and added a dedicated **Bid Centers** section (contractor owns the membership, HURKL integrates where technically possible, Mason monitors and alerts).
- **`QUALIFICATION_ENGINE.md`** — expanded qualification factors (added insurance, workforce, equipment, financial capacity) and made the pursue-vs-roadmap branch explicit.
- **`CONTRACTOR_GROWTH.md`** — added **Business Growth Engine** (the owner-defined inputs: desired size, lifestyle goals, income goals, service area, commercial/residential focus, growth speed — growth is intentional, never accidental) and **Commercial Growth Strategy** (residential → small → medium → large commercial → public infrastructure, gated by qualification and experience, not ambition).
- **`BUSINESS_INTELLIGENCE.md`** — added the **Founding Insight**: "We are not building software that simply automates tasks. We are building software that helps business owners build the company they envision. Mason succeeds when the owner's vision succeeds." Cross-referenced from `PRODUCT.md`'s Mission section.
- **`CLAUDE.md`** — Knowledge Capture Policy strengthened with the founder's closing-ritual rule: every work session ends with a Knowledge Capture before the session is considered complete.

No proprietary detail (scoring formulas, research methods, specific data sources, outreach tactics) was introduced — everything captured here is principle, philosophy, or category, consistent with the privacy boundary already established for this public repository.

### 2026-08-02 — Knowledge Capture Session 002: DEFERRD and Operations Compliance Engine approved

Founder approved two new HURKL/Mason product capabilities, plus four new core principles, all recorded permanently rather than left in chat:

- **DEFERRD** approved as HURKL's first-party physical communication and fulfillment service — the customer chooses an outcome (e.g. "send the new-homeowner campaign"), never a mailing vendor; Mason handles trigger detection, eligibility, template selection, personalization, fulfillment, status/cost tracking, and audit logging behind the scenes. Full detail in `DEFERRD_FULFILLMENT.md`.
- **Event-driven physical communication** — mail is triggered by meaningful business events (property sale detected, job completed, birthdays/anniversaries, referrals, certifications, safety milestones, stale estimates, inactive customers, seasonal events), not by the owner remembering to run campaigns. Every automatic action stays subject to an owner-approved playbook, spending limits, lawful data use, audit logging, deduplication, and cancellation.
- **Operations Compliance Engine** approved — tracks employee, company, equipment/vehicle, and project-specific qualifications (licenses, insurance, bonding, certifications, inspections, registrations, and more) across eight statuses, with configurable lead-time warnings (180 down to 7 days). Connects compliance status directly to business consequences (e.g., a specific bid opportunity at risk from an expiring certification) rather than sending generic reminders. Mason must never fabricate that a credential is valid — unverified records are labeled as such. Full detail in `OPERATIONS_COMPLIANCE.md`.
- **Expiration prevention** — Principle 007: a reminder that arrives after expiration is a system failure; the intended behavior is early detection, escalation, and resolution planning, well before a deadline causes real harm (lost bid eligibility, jobsite removal, work stoppage, etc.).
- **Compliance linked to bid/project eligibility** — before recommending an opportunity, Mason now evaluates compliance status (expiring credentials during the project period, workforce/equipment/bonding capacity) alongside the existing qualification factors, classifying any gap as impossible-before-deadline, potentially-correctable, or a long-term growth-path item — see `QUALIFICATION_ENGINE.md`'s new "Connection to the Operations Compliance Engine and Opportunity Engine" section.
- **Mason removing mental load** (Principle 004) and **intelligent delegation** (Principle 005) — owners want fewer things to remember and manage, not more software to operate; Mason automates routine pre-approved decisions and only interrupts the owner for genuine strategic decisions, exceptions, risk, budget thresholds, or legal commitments.

Promoted to `PRINCIPLES.md` as **004** (Remove Mental Load), **005** (Intelligent Delegation), **006** (Hide Operational Complexity), and **007** (Prevent Problems Before They Exist).

Two dependency-free TypeScript domain-contract files added ahead of implementation (types only, no runtime logic, no database, no real provider): `lib/domain/fulfillment.ts` and `lib/domain/compliance.ts`. No proprietary scoring/research logic, no customer-visible alternate mailing providers, and no third-party dependencies were introduced.

<!-- Next entry: ### YYYY-MM-DD — ... -->

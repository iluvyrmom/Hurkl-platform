# PRODUCT.md — Mason, HURKL's AI Office Manager

Status: foundational document. This defines the product. Read this before making any product, architecture, or scope decision.

## Mission

**Helping Business Owners Reclaim Their Lives.**

HURKL exists so that owners of service businesses stop losing evenings, weekends, and mental bandwidth to phone tag, missed calls, scheduling chaos, and administrative overhead. Mason is how that mission gets delivered.

This isn't just task automation — see `docs/business-intelligence/BUSINESS_INTELLIGENCE.md`'s Founding Insight: Mason succeeds when the owner's vision succeeds.

## Product Principles

**"We help companies grow to the size of their vision."**

HURKL does not assume every business owner wants maximum growth. Mason must help each owner maintain, reduce, or grow their company toward the size and lifestyle that owner actually chooses — HURKL never forces or defaults a company toward growth for its own sake. This principle governs every growth-and-capacity-related capability in this document (Capacity Manager, Opportunity Engine, Business Maturity Advisor): all of them serve the owner's chosen vision, not an assumption that bigger is always better.

The underlying business philosophy and judgment behind this principle — how Mason is meant to relate to the owner, and how it reasons about opportunity, capacity, and qualification — is recorded in full in `docs/business-intelligence/` (see `BUSINESS_INTELLIGENCE.md` for the index, and `OWNER_PHILOSOPHY.md` in particular). That knowledge base also holds the full numbered set of core principles (`PRINCIPLES.md`), including Remove Mental Load, Intelligent Delegation, Hide Operational Complexity, and Prevent Problems Before They Exist.

## What HURKL is

HURKL is the platform. It is the company/product umbrella that hosts Mason, manages multi-tenant business accounts, and provides the dashboards, billing, and infrastructure that let a service business run Mason safely.

## What Mason is

Mason is HURKL's configurable AI Office Manager for service businesses.

Mason is designed to operate **as an employee of each client company** — not as a third-party chatbot bolted onto a website. When Mason answers the phone, it answers as the business, not as "an AI assistant for the business." Concretely:

- Phone greeting is always: **"[Business Name], how may I help you?"**
- No "powered by HURKL," no AI disclaimers baked into the greeting, no unnecessary promotional language.
- Mason speaks with the business's own configured tone, policies, services, and pricing — never HURKL's.
- Customers should experience Mason the way they'd experience a competent, always-available member of staff.

Mason is **not** industry-specific. It must never be hardcoded to moving, HVAC, or any single vertical. Every business-specific behavior (services, pricing, hours, policies, scheduling rules, approval thresholds, workflows) is tenant configuration, not platform code. The platform is the engine; each company's configuration is the fuel.

## Who Mason serves

- **Service business owners** (the paying customer of HURKL) — the primary beneficiary of the mission.
- **Employees / technicians / crew** of those businesses — people who do the physical or service work and need job information without needing management access.
- **End customers** of the service business — the people calling, texting, emailing, or visiting the website. They should experience a fast, competent, non-fabricating point of contact, not a maze.
- **HURKL** itself, as the platform operator, needs cross-tenant operational visibility (billing, health, abuse prevention) without ever exposing one tenant's data to another.

## Problems Mason solves

- Missed calls and after-hours calls that become lost revenue.
- Slow follow-up on leads and estimates.
- Owners doing dispatch, scheduling, and customer chasing by hand, often outside business hours.
- Inconsistent intake — different information collected depending on who answers.
- No shared memory of a customer across phone, text, email, and web.
- Reputation and review requests falling through the cracks.
- Seasonal/recurring business opportunities (reminders, re-engagement) not being worked systematically.
- Owners lacking visibility into what an AI system did on their behalf, and lacking a way to stop it quickly if something goes wrong.

## User roles

1. **HURKL Platform Admin** — operates the platform across tenants (billing, incident response, abuse handling). No default access to any tenant's customer data.
2. **Business Owner** — full control of their company's Mason configuration, dashboards, approvals, and pause controls. The primary buyer and primary user of the owner portal.
3. **Manager / Office Staff** *(optional role, owner-configurable)* — a subset of owner capabilities, delegated by the owner.
4. **Employee / Technician / Crew** — sees only what's needed to do assigned work: schedule, job/customer details relevant to that job, status updates. No visibility into payroll, other employees, or business-wide management data.
5. **Customer** — interacts with Mason via phone, website (voice or text), SMS, or email. Does not "log in" to an owner-style portal by default; their relationship is the conversation and, where applicable, a lightweight customer-facing view (e.g., appointment confirmation).

## Major capabilities (target state — see ROADMAP.md for sequencing)

- Answering business phone calls 24/7, handling multiple simultaneous conversations.
- Website voice and text conversations.
- SMS and email communication.
- Taking messages and scheduling callbacks.
- Booking appointments within the same conversation whenever possible.
- Shared customer history across phone, website, text, and email — one customer record, not four.
- New lead qualification.
- Estimate and service-request workflows.
- Calendar management.
- Customer follow-up.
- Missed-call recovery (proactively reaching back out).
- Review requests.
- Seasonal reminders (configurable per business — e.g., pre-season tune-ups, move season).
- Lead-platform integrations (e.g., inbound leads from third-party lead generators).
- Owner and employee dashboards.
- Technician/crew job-status workflows.
- Configurable company services, pricing, policies, hours, FAQs, and scheduling rules.
- Configurable approval thresholds for high-value jobs, discounts, commitments, and other sensitive actions.
- VIP customer prioritization.
- Audit logs for every meaningful autonomous action.
- Emergency pause and slowdown controls, owned by the business owner.
- Cost and usage controls, owned by the business owner.
- Multi-company tenant isolation — no company ever sees another company's data.

## Growth & capacity management (future capabilities)

These capabilities are documented here at a product level only, per the public-repository privacy rule in "Proprietary methods" below: they describe *what* Mason will do and the controls the owner has over it, not the specific methods, scoring logic, or research techniques behind it. Those details are private intellectual property, to be implemented later through protected configuration and internal rules that live outside this public repository. The business philosophy and judgment underlying these capabilities — how Mason thinks about opportunity, capacity, qualification, and growth — is recorded separately in `docs/business-intelligence/`.

### Capacity Manager

Mason will include a Capacity Manager that regulates how aggressively it pursues new work on the owner's behalf, based on configurable factors such as: desired company size, number and size of crews, current workload, backlog, average job duration, available equipment, hiring plans, seasonal demand, and revenue/margin goals.

The owner has direct, explicit control over pursuit intensity, including the ability to:
- Maintain the current business size
- Grow slowly
- Grow aggressively
- Pause new-opportunity pursuit entirely
- Set a custom employee, crew, revenue, or workload target

Mason must recognize when a company already has enough work and reduce or stop unnecessary marketing/outreach activity accordingly. The Capacity Manager exists specifically so growth pursuit reflects the owner's actual capacity and choices — see Product Principles above — not a default assumption that more work is always better.

### Opportunity Engine

Mason will include an Opportunity Engine that receives opportunities from customer-authorized sources, which may include: residential lead providers; publicly available property and permit information; planning and development signals; the contractor's own commercial bid-center memberships; the contractor's own lead subscriptions; CRM imports; referral sources; and future approved integrations.

A firm boundary: **HURKL does not purchase or resell a customer's paid memberships or subscriptions.** Where a contractor already owns and pays for a service — a commercial bid-center membership, for example — HURKL connects to it only through authorized integrations, APIs, notifications, imports, email forwarding, or other permitted methods, never by acquiring or reselling access on the contractor's behalf.

Mason's value is to identify, rank, track, and act on relevant opportunities across these sources so the owner doesn't have to manually watch every system. The specific methods Mason uses to identify and rank opportunities are intentionally not documented here — see "Proprietary methods" below.

### Property and development signal evaluation

As part of the Opportunity Engine, Mason will eventually evaluate property and development signals differently depending on property type, project stage, and the customer's own trade — the same signal means something different to different trades. For example:

- An ordinary residential property sale may matter to painters, landscapers, handymen, cleaners, and similar trades.
- A vacant lot may matter early to general contractors, excavation, grading, utilities, concrete, masonry, surveying, and site-development companies.
- Commercial property activity may matter early to architects, engineers, general contractors, design-build firms, and larger specialty contractors.
- Later project stages should notify the trades that enter later in the construction lifecycle.

The detailed timing and scoring rules behind this evaluation are intentionally not documented here — see "Proprietary methods" below. Industry defaults will be configurable per tenant and improved over time based on real company outcomes, not fixed once and left static.

### Territory and trade exclusivity

Mason will support configurable trade-and-territory exclusivity — a protected market for each tenant. Exclusivity is never hardcoded to fixed city or county boundaries, and it is always based on **both** territory **and** competing trade or service category together: a moving company's protected market must never block an unrelated HVAC, painting, or landscaping company operating in the same territory.

The protected-market model supports:
- A primary business location
- A configurable service radius
- A suggested starting radius (for example, 50 miles), offered as a default — never made mandatory
- Future support for drive-time-based or custom-map-drawn territory, beyond a simple radius
- Protected trades and service categories (defining what actually counts as "competing")
- Expansion into additional territories over time
- Clear status, duration, and renewal rules for how long a protected market stays in effect

### Commercial bid centers

Commercial bid-center monitoring is mission-critical for eligible larger contractors. When a contractor reaches an appropriate level of growth, Mason should recommend that the owner evaluate the relevant bid-center membership or professional service — not before. Mason must not reveal future proprietary growth strategies prematurely; it recommends the next tool, membership, employee, service, or process only when the company's capacity, goals, and opportunity volume actually show readiness for it.

For bid centers a contractor has connected, Mason should eventually:
- Detect new relevant bid opportunities promptly
- Match opportunities to the company's trades and territory
- Track bid deadlines and addenda
- Alert the correct employees
- Prepare checklists and internal summaries
- Track bid status
- Prevent important bid windows from being missed

Monitoring may be automatic (Tier 1 — see SECURITY.md's autonomy tiers). **Actual bid submission, and any other legally binding commitment, requires appropriate company approval** (Tier 2, or Tier 3 for anything resembling signing a legal agreement) unless a narrowly defined, pre-approved workflow has been explicitly configured by the owner.

### Business Maturity Advisor

Mason should recognize when a company has outgrown its current tools or processes and recommend the next appropriate investment — for example: a commercial bid-center membership, dedicated estimating software, additional crews or employees, a dispatcher or estimator, expanded service territory, new equipment, more advanced accounting or CRM systems, additional offices/operating capacity, or an outside specialist (bookkeeper, CPA, payroll provider, attorney, insurance or bonding agent, safety consultant, HR professional, controller, estimator, office manager). Mason does not try to replace every specialist — it prepares, coordinates, follows up, and preserves records around them. Full detail in `docs/business-intelligence/CONTRACTOR_GROWTH.md`'s "Business Maturity and Specialists" section.

Every recommendation must support the owner's chosen vision (see Product Principles above) — never growth for its own sake.

### Strategic alliances and trade relationships

Mason may recommend the owner build professional relationships — strategic capacity-sharing alliances, a respectful conversation with a frequently-competing contractor, or engagement with a local trade network — but never forms an alliance, referral, or partnership automatically, and never bases a recommendation on a protected characteristic. A related, not-yet-designed future capability, the HURKL Trusted Trade Network, would connect compatible HURKL businesses through trade hierarchies under strict owner-control and antitrust boundaries. Full detail in `docs/business-intelligence/STRATEGIC_ALLIANCES.md` and `docs/business-intelligence/TRUSTED_TRADE_NETWORK.md`.

### Approved outreach playbooks

Mason may automatically perform low-risk outreach only when **all** of the following hold:
- The owner approved the specific playbook in advance
- The opportunity matches that company's configured rules
- The company actually needs additional work (see Capacity Manager above — Mason must not pursue outreach on behalf of a company that has paused pursuit or already has enough work)
- The channel and the data use involved are lawful and permitted
- Configured spending limits are respected
- Every action is recorded in the audit log

Mason should prefer the lowest-cost effective approved channel. Potential channels may include approved email, permitted social or digital outreach, and physical mail. Mason must never assume that a given social or digital platform permits automated outreach — that platform's specific rules, and any applicable law, must be verified before any such channel is implemented, not assumed from this document.

### DEFERRD — first-party fulfillment

DEFERRD is HURKL's approved first-party physical communication and fulfillment service — the channel that fulfills the "physical mail" playbook above. The customer chooses an outcome (e.g. "send the new-homeowner campaign"), never a mailing vendor; there is no customer-facing provider selector. Full detail — customer experience, event triggers, and the internal-only provider abstraction — is in `docs/business-intelligence/DEFERRD_FULFILLMENT.md`.

### Operations Compliance Engine

A future capability that tracks employee, company, equipment/vehicle, and project-specific qualifications (licenses, insurance, bonding, certifications, inspections) so Mason can flag renewal needs early enough to prevent real business consequences (lost bid eligibility, jobsite removal, work stoppage) — never merely reminding after the fact. Connects directly to the Opportunity and Qualification Engines above. Full detail in `docs/business-intelligence/OPERATIONS_COMPLIANCE.md`.

### Financial Health Engine

A future capability built on the principle that cash in the bank is not always spendable cash: Mason distinguishes operating cash, payroll obligations, tax reserves, insurance obligations, debt obligations, committed project costs, and true discretionary cash, and tracks tax-related deadlines, organized financial records, and whether mandatory obligations are current — coordinating around an established accounting platform (which remains the financial system of record) rather than replacing it. Mason must never invent tax strategy; it flags decisions that warrant tax analysis and defers to current official rules and a qualified professional. Full detail in `docs/business-intelligence/FINANCIAL_HEALTH.md`.

## Boundaries — what Mason must never do

Mason collects only the information reasonably needed to complete the customer's request — no unnecessary intake friction.

Mason must never fabricate:
- Prices
- Appointment availability
- Business policies
- Completed actions
- Payment status
- Job status
- Customer information
- Knowledge, confidence, completion, compliance, eligibility, or source authority — if Mason doesn't know something, it says so and researches the verified answer rather than guessing (see `docs/business-intelligence/VERIFIED_INTELLIGENCE.md`)

Mason must never base a relationship, alliance, referral, or outreach recommendation on race, ethnicity, nationality, sex, religion, or any other protected characteristic — communication barriers are operational problems to solve, never identity judgments (see `docs/business-intelligence/STRATEGIC_ALLIANCES.md`). Mason must never facilitate price fixing, bid rigging, market allocation beyond HURKL's own customer licensing/exclusivity model, coordinated suppression of competition, sharing confidential bid prices between competitors, or retaliatory blacklisting (see `docs/business-intelligence/TRUSTED_TRADE_NETWORK.md`).

Mason must escalate to the owner (or configured approver) whenever a decision would exceed that company's configured authority threshold. See SECURITY.md and ARCHITECTURE.md for the three-tier autonomy model (Automatic / Approval Required / Never Autonomous) that enforces this in practice.

## Initial pilot: A-1 Best Moving LLC

A-1 Best Moving LLC is the first real-world pilot company, onboarded as a tenant of the HURKL platform built in this repository (`hurkl-platform`). The existing A-1 Netlify marketing site is a separate, unrelated project and is not the pilot — the pilot is A-1 configured and running inside HURKL/Mason. The platform itself must remain industry-neutral — A-1's rules live entirely in tenant configuration, never in core platform code.

- **Business name:** A-1 Best Moving LLC
- **Slogan:** "The best move you'll make."
- **Phone:** 971-777-6660
- **Email:** A1BESTMOVING@gmail.com
- **Current focus:** labor-only moving services, with configuration allowing that business model to change later (e.g., adding truck moves, packing services) without a platform rebuild.

A-1-specific workflows to eventually support (as tenant configuration, not core logic):
- Conversational move intake
- Room-by-room job details
- Estimate versus actual time
- Two-man and three-man crew options
- Scheduling and dispatch
- Crew assignments
- Time tracking
- Job photos
- Completion checklist
- Customer communication
- Owner approval controls
- Final payment workflow
- Review requests

A-1 validates the platform end-to-end. Success with A-1 should never come at the cost of baking moving-specific assumptions into Mason's core.

## Proprietary methods

**This repository (`hurkl-platform`) is currently public.** Only high-level product capabilities and principles are documented here — never the detailed logic behind them.

HURKL's business-development and public-record research methods (how HURKL finds and qualifies prospective client businesses) are proprietary. The same applies to the growth-and-capacity capabilities above (Capacity Manager, Opportunity Engine, property/development signal evaluation, territory-and-trade exclusivity matching, Commercial Bid Centers, Business Maturity Advisor, Approved Outreach Playbooks, DEFERRD, Operations Compliance Engine): this document describes what they do and the controls the owner has over them, never the underlying opportunity-scoring formulas, signal timing/staging rules, territory-matching logic, detailed commercial research methods, outreach tactics, data-source discovery methods, compliance risk-scoring logic, renewal-sourcing methods, or the founder's private business-development playbooks.

This documentation intentionally does not describe those methods, formulas, or tactics. They are private intellectual property, to be implemented later through protected configuration and internal rules that are not committed to this public repository. Keep this area abstract in all public-facing documentation and code — comments included — unless the founder explicitly authorizes disclosure.

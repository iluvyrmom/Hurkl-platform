# PRODUCT.md — Mason, HURKL's AI Office Manager

Status: foundational document. This defines the product. Read this before making any product, architecture, or scope decision.

## Mission

**Helping Business Owners Reclaim Their Lives.**

HURKL exists so that owners of service businesses stop losing evenings, weekends, and mental bandwidth to phone tag, missed calls, scheduling chaos, and administrative overhead. Mason is how that mission gets delivered.

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

Mason must escalate to the owner (or configured approver) whenever a decision would exceed that company's configured authority threshold. See SECURITY.md and ARCHITECTURE.md for the three-tier autonomy model (Automatic / Approval Required / Never Autonomous) that enforces this in practice.

## Initial pilot: A-1 Best Moving LLC

A-1 Best Moving LLC is the first real-world pilot company. The platform itself must remain industry-neutral — A-1's rules live entirely in tenant configuration, never in core platform code.

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

HURKL's business-development and public-record research methods (how HURKL finds and qualifies prospective client businesses) are proprietary. This documentation intentionally does not describe those methods. Keep this area abstract in all documentation and code unless the founder explicitly authorizes disclosure.

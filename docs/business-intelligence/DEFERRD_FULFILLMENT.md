# DEFERRD — First-Party Fulfillment

Status: permanent knowledge base entry, principle/category level only. See `BUSINESS_INTELLIGENCE.md`'s privacy boundary — this file does not name real vendor integrations, contain proprietary personalization/targeting logic, or describe founder business-development tactics.

**Approved capability, not yet built.** DEFERRD is HURKL's first-party physical communication and fulfillment service. Nothing here authorizes a real integration, real mail, or a paid account — see `ARCHITECTURE.md` §3 and `ROADMAP.md` for sequencing.

## Purpose

DEFERRD exists to make Principle 006 ("Hide Operational Complexity," `PRINCIPLES.md`) real for physical mail and fulfillment: the customer chooses an outcome, and Mason handles everything behind it, the same way it already does for text/voice/email under `PRODUCT.md`'s Approved Outreach Playbooks.

## Customer experience

Customers should not normally see or choose a mailing vendor. When a HURKL customer enables a physical communication feature, the workflow should simply work. Fulfillment categories, organized by who receives them:

**Customer:**
- Birthday cards
- Holiday cards
- Thank-you cards
- Anniversary cards
- Referral appreciation
- Warranty reminders
- Seasonal reminders
- Reactivation campaigns
- New-homeowner postcards
- Magnets
- Welcome packages

**Employee:**
- Birthday cards
- Work anniversaries
- Bonuses
- Recognition
- Safety awards
- Certification achievements
- Welcome packages
- Holiday appreciation

**Marketing:** *(incomplete — the founder message specifying this category cut off mid-list; not documented here yet, pending the rest of that instruction. Do not infer or invent this list.)*

**The customer chooses:** the outcome, the approved budget, the eligible audience, the playbook, and the level of autonomy.

**Mason handles:** trigger detection, eligibility, template selection, personalization, the fulfillment request itself, status tracking, cost tracking, audit logging, and outcome tracking.

## First-party provider decision

DEFERRD is HURKL's default and official physical communication fulfillment service. There is no customer-facing provider selector as part of the standard experience.

Internally, HURKL preserves a provider interface — see `lib/domain/fulfillment.ts`'s `PhysicalFulfillmentProvider` — purely for HURKL's own engineering flexibility (international expansion, disaster recovery, enterprise contractual requirements, future acquisitions, internal provider changes). That interface exists for HURKL's operational flexibility, not to make customers manage vendors, and must never be exposed as a customer-facing choice.

No real DEFERRD API integration exists yet, and none should be built until a specific milestone explicitly authorizes it.

## Event-driven communication

Physical communication should be triggered by meaningful business events rather than requiring the owner to remember every campaign. Possible triggering events:

- Property sale detected
- New customer created
- Job completed
- Customer birthday / anniversary
- Employee birthday / work anniversary
- Referral received
- Certification achieved
- Safety milestone reached
- Estimate not accepted within a configured period
- Customer inactive for a configured period
- Holiday or seasonal event

Every automatic fulfillment action remains subject to: an owner-approved playbook, a spending limit, lawful data use, the applicable communication rules, audit logging, deduplication, cancellation capability, and clear fulfillment status — the same guardrails `PRODUCT.md`'s Approved Outreach Playbooks already establish for every channel, applied here to physical mail specifically.

## Direct Mail — Fallback Lead Generation

A playbook for when normal lead generation has failed or become unsuitable. Possible triggers: lead volume below the owner's threshold, backlog below target, the owner stepping away from a builder relationship or apartment work, the owner rejecting current lead types, seasonal slowdown, current lead sources drying up, or capacity existing with no qualified work available.

**Founder field experience indicates that a neighborhood direct-mail campaign may produce approximately one meaningful job per roughly 500 households reached, for certain contractors.** Per `VERIFIED_INTELLIGENCE.md`, this figure must be labeled precisely: it is an anecdotal founder baseline, not a promise, not a guaranteed conversion rate, and dependent on trade, offer, market, neighborhood, season, material, timing, and execution. Mason begins with this only as a configurable planning assumption and replaces it with each company's actual measured performance as data accumulates — a direct application of `EVIDENCE_BASED_OPERATIONS.md`'s "confidence level" and re-verification discipline to a business assumption rather than a regulatory fact.

Track: households reached, campaign cost, response count, qualified leads, jobs won, revenue, gross margin, cost per lead, cost per acquired customer, best-performing neighborhoods, best-performing offers, and repeat/referral value.

Example Mason statement once built: *"Your projected workload falls below target in two weeks. Based on your approved fallback acquisition playbook, I recommend a direct-mail campaign to approximately 500 qualified households."*

DEFERRD is the first-party physical fulfillment service behind this workflow. The customer chooses the outcome, audience, budget, and approved playbook — never a fulfillment vendor.

## Persistent Physical Advertising

A trade-specific playbook for businesses that depend on repeat work, maintenance calls, emergency calls, and household recall: HVAC, plumbing, electrical, carpet cleaning, landscaping, pest control, appliance repair, garage door repair, locksmith, pool service, restoration, handyman, chimney service, pressure washing, and window cleaning.

**Founder-approved principle: for these businesses, refrigerator magnets should be treated as a serious long-term customer-retention and recall tool, not an unnecessary expense.** The brand remains visible; emergency needs occur unpredictably; homeowners prefer the easiest trusted call; a visible magnet can prevent the customer from searching competitors; persistent visibility supports repeat business and referrals. Mason recommends magnets based on trade suitability and customer lifetime-value strategy — not as a default add-on for every business.

Future DEFERRD workflows may include: magnet design, personalization, automatic reordering, inventory monitoring, and inclusion with thank-you cards, completed-job packets, new-homeowner campaigns, and customer-appreciation packages.

**Track outcomes rather than assuming success** — the same discipline as the direct-mail baseline above: this is a founder-informed starting hypothesis, not a verified guarantee, and gets replaced by each tenant's actual measured results.

## Relationship to other documents

- `PRODUCT.md`'s "Approved Outreach Playbooks" — physical mail is one of the channels that section already names; DEFERRD is how HURKL fulfills that channel specifically.
- `PRINCIPLES.md` 006 "Hide Operational Complexity" — the principle this capability exists to express.
- `ARCHITECTURE.md` §3 "Future services" — where DEFERRD will eventually be implemented as a platform service.
- `lib/domain/fulfillment.ts` — the dependency-free TypeScript contracts (`FulfillmentTrigger`, `FulfillmentProduct`, `FulfillmentOrderStatus`, `PhysicalFulfillmentProvider`, `FulfillmentRequest`, `FulfillmentResult`) added ahead of implementation so later work has a stable shape to build against.
- `VERIFIED_INTELLIGENCE.md` and `EVIDENCE_BASED_OPERATIONS.md` — the direct-mail baseline and magnet-recommendation logic above are exactly the kind of founder assumption that must be labeled by confidence and replaced with measured data over time, never presented as a guarantee.

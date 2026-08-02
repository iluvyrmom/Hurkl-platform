# DEFERRD — First-Party Fulfillment

Status: permanent knowledge base entry, principle/category level only. See `BUSINESS_INTELLIGENCE.md`'s privacy boundary — this file does not name real vendor integrations, contain proprietary personalization/targeting logic, or describe founder business-development tactics.

**Approved capability, not yet built.** DEFERRD is HURKL's first-party physical communication and fulfillment service. Nothing here authorizes a real integration, real mail, or a paid account — see `ARCHITECTURE.md` §3 and `ROADMAP.md` for sequencing.

## Purpose

DEFERRD exists to make Principle 006 ("Hide Operational Complexity," `PRINCIPLES.md`) real for physical mail and fulfillment: the customer chooses an outcome, and Mason handles everything behind it, the same way it already does for text/voice/email under `PRODUCT.md`'s Approved Outreach Playbooks.

## Customer experience

Customers should not normally see or choose a mailing vendor. When a HURKL customer enables a physical communication feature, the workflow should simply work. Example outcomes a customer might request:

- New-homeowner postcards
- Fridge magnets
- Customer thank-you cards
- Customer birthdays and anniversaries
- Holiday cards
- Referral thank-you packages
- Employee birthday cards and work-anniversary recognition
- Employee bonuses and recognition, safety awards
- Welcome packages
- Certification-achievement recognition
- Estimate follow-up mail
- Seasonal reminders
- Warranty reminders
- Customer reactivation campaigns

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

## Relationship to other documents

- `PRODUCT.md`'s "Approved Outreach Playbooks" — physical mail is one of the channels that section already names; DEFERRD is how HURKL fulfills that channel specifically.
- `PRINCIPLES.md` 006 "Hide Operational Complexity" — the principle this capability exists to express.
- `ARCHITECTURE.md` §3 "Future services" — where DEFERRD will eventually be implemented as a platform service.
- `lib/domain/fulfillment.ts` — the dependency-free TypeScript contracts (`FulfillmentTrigger`, `FulfillmentProduct`, `FulfillmentOrderStatus`, `PhysicalFulfillmentProvider`, `FulfillmentRequest`, `FulfillmentResult`) added ahead of implementation so later work has a stable shape to build against.

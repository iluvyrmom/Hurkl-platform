# Strategic Alliances and Professional Relationships

Status: permanent knowledge base entry, principle/category level only. See `BUSINESS_INTELLIGENCE.md`'s privacy boundary — this file describes relationship-evaluation categories and guardrails, not any real company names, proprietary matching logic, or founder-specific relationship data.

**Approved capability, not yet built.** Nothing here authorizes automatic alliance formation, data sharing between tenants, or any real outreach — see `ARCHITECTURE.md` §3 and `ROADMAP.md` for sequencing.

## Purpose

A single company cannot always meet every capacity or expertise need alone, and a strong professional reputation is itself a business asset. This file documents how Mason recognizes relationship opportunities and recommends the owner pursue them — it never creates a relationship, commitment, or data-sharing arrangement automatically. See `PRINCIPLES.md` 003 ("Recommendations, Never Commands") and 012 ("Professional Relationships Are Recommended, Never Automated or Discriminatory").

## Strategic Growth Alliances

When contractors begin moving from residential work into small commercial or larger projects, temporary capacity gaps become likely: extra crew needed, specialized equipment needed, schedule recovery, specialized expertise, temporary supervision, estimating assistance, or emergency support.

**An alliance does not mean merger, ownership, or a permanent partnership.** Each business remains fully independent. Mason should recommend building relationships before they are urgently needed, not scrambling to find help during a crisis.

Potential alliance candidates may include: trusted former coworkers who built their own companies, respected contractors slightly larger than the tenant, respected contractors at a similar stage, compatible complementary trades, well-established industry veterans, and respected competitors.

Mason evaluates candidates based on: reliability, professional reputation, quality, payment history when lawfully known, compatible values, safety, communication, ability to honor commitments, mutual benefit, geographic overlap, and trade compatibility.

This connects directly to `QUALIFICATION_ENGINE.md`'s "potentially correctable" gap category — a temporary capacity or expertise gap that blocks pursuing an opportunity today can sometimes be closed through an existing alliance relationship rather than requiring months of internal growth.

## Respect-Worthy Competitors

**Founder-approved lesson:** a competitor who repeatedly bids against the company, sometimes wins, sometimes loses, and continues operating professionally may deserve respect rather than resentment.

Mason may identify patterns such as: repeated competition on similar projects, similar project size, similar growth trajectory, comparable reputation, fair competitive behavior, aligned standards, and complementary capacity.

Mason may recommend a conversation, for example: *"You and [competitor] have competed on several comparable projects. Their track record suggests similar ambition and capability. Consider inviting the owner to lunch or coffee to open a professional relationship. No commitment is required."*

**No automatic alliance should be created.** The point is to recommend a conversation, nothing more.

## Local Relationship Networks

Established local business relationships strongly influence how work flows in a market. This is a real, practical observation about how established markets function, not a basis for excluding anyone:

- Established markets have trusted relationship networks.
- Work often flows through people who have known and trusted each other for years.
- Owners should understand the professional network rather than ignore it.
- Reputation, reliability, communication, and participation matter.
- Outsiders can build trust through consistent professional behavior over time.

Mason should help the owner identify relevant professional relationships involving: general contractors, subcontractors, architects, engineers, developers, suppliers, property managers, facility managers, industry associations, respected peers, and mentors.

**Communication barriers are treated as operational problems, not identity judgments.** Possible solutions Mason may recommend: translation support, bilingual staff, communication training, clearer documentation, meeting preparation, and multilingual customer and employee materials.

**Alliance and relationship recommendations must never discriminate based on race, ethnicity, nationality, sex, religion, or any other protected characteristic.** Evaluation is always based on the professional factors listed above — reliability, reputation, quality, safety, communication, and compatibility — never on identity.

## Relationship to other documents

- `PRINCIPLES.md` 003 "Recommendations, Never Commands," 012 "Professional Relationships Are Recommended, Never Automated or Discriminatory," and 021 "Relationships Create Opportunities" — the principles this file exists to express.
- `CONTRACTOR_GROWTH.md`'s "Strategic Alliances and Trade Relationships" section — how this fits the overall growth model.
- `QUALIFICATION_ENGINE.md` — alliances as one way to close a "potentially correctable" capacity or expertise gap.
- `TRUSTED_TRADE_NETWORK.md` — the related, but distinct and not-yet-designed, cross-tenant capability for compatible HURKL businesses; this file covers a single tenant's own external relationships, that file covers relationships between HURKL tenants.
- `VERIFIED_INTELLIGENCE.md` — any claim about a competitor's or ally's track record, reputation, or payment history must be sourced and labeled by confidence, never asserted as fact without verification.
- `SECURITY.md`'s autonomy tiers — recommending a relationship conversation is, at most, an automatic (Tier 1) suggestion; forming any actual commitment, data-sharing arrangement, or referral relationship requires owner approval.
- `lib/domain/alliances.ts` — the dependency-free TypeScript contracts (`AllianceCapacityNeed`, `RelationshipEvaluationFactor`, `AllianceCandidate`, `AllianceRecommendation`, `CompetitorPatternSignal`, `RespectWorthyCompetitorObservation`, `LocalRelationshipType`, `LocalRelationshipReference`, `CommunicationBarrierSolution`) added ahead of implementation — single-tenant relationship types only, no cross-tenant data access.

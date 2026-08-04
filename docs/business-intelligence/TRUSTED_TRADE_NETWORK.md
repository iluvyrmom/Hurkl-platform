# HURKL Trusted Business Network (HTBN)

Status: permanent knowledge base entry, principle/category level only. See `BUSINESS_INTELLIGENCE.md`'s privacy boundary — this file describes a future capability's governance philosophy and legal boundaries, not any real tenant names, matching logic, membership decisions, or referral data.

**Naming note:** this file was originally recorded as the "HURKL Trusted Trade Network." Knowledge Capture Session 008 formalized and deepened the same underlying concept as the **HURKL Trusted Business Network (HTBN)**, with a full governance model. The filename is unchanged to avoid breaking existing cross-references; the concept itself is the same one, now much more fully specified.

**Approved capability, not yet designed, not yet built.** Nothing here authorizes any cross-tenant data sharing, matching, membership decision, or referral mechanism — see `ARCHITECTURE.md` §1b, §3, §4 and `ROADMAP.md` for sequencing.

## ⚠ Relationship to the existing cross-tenant exception — read first

`ARCHITECTURE.md` §4 documents exactly one narrow, deliberate exception to Mason's tenant isolation: checking territory-and-trade exclusivity conflicts, exposing only trade/territory/status fields through a dedicated workflow. `CLAUDE.md`'s permanent rules state that exception must never be used as precedent for any other cross-tenant read.

**HTBN is a separate, additional cross-tenant capability — if anything, a larger one than originally scoped**, since network membership and trust signals are, by definition, things other member businesses may eventually need some visibility into. It is documented here as an approved future direction, but it is explicitly **not** covered by the existing exclusivity-check exception and **must not** be implemented by extending that mechanism. Any real design — what data crosses tenant boundaries, under what consent, through what workflow, visible to whom — is its own conscious, reviewed architectural and security decision, to be made deliberately when this capability is actually scheduled, not assumed from this document.

## Founding mission

**HURKL is building the most trusted business network in the United States.** The objective is **not** to become the largest network — it is to become the most trusted one. Every decision regarding HTBN should protect that mission, even when the largest-network path and the most-trusted-network path diverge.

## Network philosophy

Membership in HTBN is a privilege, not a byproduct of software usage. **Using Mason and being recognized as an HTBN member are separate concepts** — a business may use Mason without automatically qualifying for HTBN membership. Membership represents businesses that consistently demonstrate professionalism, reliability, safety, integrity, and continuous improvement.

## Business stewardship

HURKL is a steward of the network, not merely a host of it. Its responsibility is to protect: customers, member businesses, employees, HURKL's own reputation, and the long-term value of the network itself. Leadership sometimes requires difficult decisions — **protecting the network is more important than avoiding uncomfortable conversations.**

## Mason's role

**Mason never judges people. Mason never labels businesses. Mason never removes members.** Mason continuously gathers objective operational evidence — for example: licensing, insurance, certifications, equipment maintenance, safety compliance, documented regulatory actions, verified customer feedback received through HURKL, project completion history, documentation quality, responsiveness, and operational organization.

When patterns indicate elevated operational risk, Mason **privately recommends an internal stewardship review** — nothing more. **Only HURKL administrators make membership decisions.** This is the Tier 3 "never autonomous" boundary (`SECURITY.md` §4) applied directly to network membership.

## Improvement first

The objective is always improvement before removal. Whenever practical: identify the problem, explain the issue, recommend corrective action, provide time to improve, and monitor progress. **Removal should be considered only when a business consistently demonstrates unwillingness or inability to meet the published standards after a reasonable opportunity to improve.**

## A higher standard

Meeting minimum legal requirements does not automatically qualify a business for HTBN membership. The network exists to represent businesses striving for excellence, not businesses merely meeting minimum compliance — see `OPERATIONS_COMPLIANCE.md` and `FINANCIAL_HEALTH.md` for the compliance floor HTBN membership sits above.

## Trusted Business Ecosystem

The HTBN is built upon earned trust. Every trusted member strengthens every other trusted member. Projects naturally flow through trusted relationships, for example:

General Contractors → Architects → Engineers → Excavation → Concrete → Framing → Roofing → Mechanical Trades → Interior Trades → Landscaping → Maintenance

(An earlier, more granular version of this same flow — general contractor → excavation → concrete → framing → roofing → siding → electrical → plumbing → HVAC → insulation → drywall → painting → flooring → landscaping — remains valid as a more detailed example within the same ecosystem concept.)

Mason should understand this ecosystem and identify opportunities that naturally flow between trusted businesses, while respecting owner control, lawful competition, and confidentiality (see the constraints and antitrust boundary below, which apply in full here).

## Reputation as an asset

A company's reputation is one of its most valuable assets. Mason should help member and prospective-member businesses improve that reputation through organization, compliance, communication, professionalism, preparation, and operational excellence — never through fabricated credentials or inflated claims (see `VERIFIED_INTELLIGENCE.md`).

## Constraints

Any future design must respect all of the following:

- Owner-controlled participation — no tenant is included without explicit opt-in.
- Capacity-aware — never referring more work than a business can actually handle.
- Quality-first — never a race-to-the-bottom marketplace.
- Trade and territory exclusivity respected (see `ARCHITECTURE.md` §4 and `PRODUCT.md`'s "Territory and trade exclusivity").
- No automatic sharing of confidential tenant data.
- No forced referrals.
- No unlawful collusion.
- No price coordination.
- No exclusion based on protected traits — evaluation is professional (reliability, reputation, quality, safety, communication, compatibility), never identity-based, matching the standard set in `STRATEGIC_ALLIANCES.md`.

## Antitrust and competition boundary

This boundary is explicit and non-negotiable:

**HURKL may support:** lawful introductions, referrals, subcontracting, and collaboration between independently-owned, willing tenant businesses.

**HURKL must never facilitate:**
- Price fixing
- Bid rigging
- Market allocation beyond HURKL's own customer licensing/exclusivity model
- Coordinated suppression of competition
- Sharing confidential bid prices between competitors
- Retaliatory blacklisting

Any future implementation must be reviewed against applicable antitrust and competition law before it is built — this document states the principle, not a legal clearance.

## Relationship to other documents

- `CLAUDE.md`'s "Two permanent rules for growth/opportunity capabilities" — the rule this file's warning section exists to honor.
- `ARCHITECTURE.md` §1b — the "Business Ecosystem Platform, not a CRM" foundational decision this network sits within — and §4, the one existing, narrow cross-tenant exception this capability is deliberately kept separate from.
- `STRATEGIC_ALLIANCES.md` — the single-tenant version of relationship-building (a tenant's own external relationships); this file is the cross-tenant, multi-HURKL-business, governed-membership version.
- `SECURITY.md` §4 — Mason's evidence-gathering-and-recommend-only role here is a direct instance of the Tier 1 (automatic evidence gathering) / Tier 3 (membership decisions, never autonomous) split.
- `PRODUCT.md`'s "Territory and trade exclusivity" — the exclusivity rules any referral or subcontracting relationship must continue to respect.
- `CONTRACTOR_GROWTH.md`'s "Strategic Alliances and Trade Relationships" section.
- `BUSINESS_KNOWLEDGE_GRAPH.md` — HTBN's ecosystem view is one lens onto the same shared Business Knowledge Graph, not a separate data silo.
- `lib/domain/network-governance.ts` — the dependency-free TypeScript contracts (`NetworkMembershipStatus`, `OperationalEvidenceCategory`, `TenantOperationalEvidence`, `StewardshipReviewRecommendation`, `ImprovementPlan`) added ahead of implementation — single-tenant perspective only, no cross-tenant membership lookup modeled.

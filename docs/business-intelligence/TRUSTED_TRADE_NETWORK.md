# HURKL Trusted Trade Network

Status: permanent knowledge base entry, principle/category level only. See `BUSINESS_INTELLIGENCE.md`'s privacy boundary — this file describes a future capability's constraints and legal boundaries, not any real tenant names, matching logic, or referral data.

**Approved capability, not yet designed, not yet built.** Nothing here authorizes any cross-tenant data sharing, matching, or referral mechanism — see `ARCHITECTURE.md` §3 and `ROADMAP.md` for sequencing.

## ⚠ Relationship to the existing cross-tenant exception — read first

`ARCHITECTURE.md` §4 documents exactly one narrow, deliberate exception to Mason's tenant isolation: checking territory-and-trade exclusivity conflicts, exposing only trade/territory/status fields through a dedicated workflow. `CLAUDE.md`'s permanent rules state that exception must never be used as precedent for any other cross-tenant read.

**The Trusted Trade Network described below is a separate, additional cross-tenant capability.** It is documented here as an approved future direction, but it is explicitly **not** covered by the existing exclusivity-check exception and **must not** be implemented by extending that mechanism. Any real design — what data crosses tenant boundaries, under what consent, through what workflow — is its own conscious, reviewed architectural and security decision, to be made deliberately when this capability is actually scheduled, not assumed from this document.

## Purpose

Projects naturally flow through trade hierarchies. A typical example:

General contractor → excavation → concrete → framing → roofing → siding → electrical → plumbing → HVAC → insulation → drywall → painting → flooring → landscaping

When multiple HURKL companies operate in compatible territories and trade categories, Mason may eventually identify natural referral or subcontracting relationships between them.

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
- `ARCHITECTURE.md` §4 — the one existing, narrow cross-tenant exception, and why this capability is deliberately kept separate from it.
- `STRATEGIC_ALLIANCES.md` — the single-tenant version of relationship-building (a tenant's own external relationships); this file is the cross-tenant, multi-HURKL-business version.
- `PRODUCT.md`'s "Territory and trade exclusivity" — the exclusivity rules any referral or subcontracting relationship must continue to respect.
- `CONTRACTOR_GROWTH.md`'s "Strategic Alliances and Trade Relationships" section.

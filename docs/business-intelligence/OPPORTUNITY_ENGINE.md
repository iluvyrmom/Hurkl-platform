# Opportunity Engine — Knowledge Base

Status: permanent knowledge base entry, principle/category level only. See `BUSINESS_INTELLIGENCE.md`'s privacy boundary — this file does not contain scoring formulas, ranking logic, or data-source discovery methods.

## Purpose

Documents the categories of business opportunity signals Mason draws on when helping an owner grow — the inputs to the Opportunity Engine capability described in `PRODUCT.md`.

## Opportunity categories

Mason constantly monitors opportunities appropriate for the contractor, organized by category:

**Residential**
- Property sales
- New homeowners
- Building permits
- Remodeling activity

**Vacant Land**
- Land sales
- Site development
- Utility work
- Excavation opportunities

**Commercial**
- Commercial developments
- Retail
- Apartments
- Medical
- Schools
- Government projects

**Public Works**
- Bid centers
- Municipality procurement systems
- County purchasing portals
- State purchasing systems

## Bid Centers

Large commercial contractors should maintain memberships with regional bid centers once they've reached the appropriate stage (see `CONTRACTOR_GROWTH.md`'s Commercial Growth Strategy and `QUALIFICATION_ENGINE.md`). HURKL integrates with these systems whenever technically possible — but **the contractor, not HURKL, owns and pays for those memberships** (see the customer-authorized-sources boundary below). Once connected, Mason monitors those opportunities and alerts the owner immediately when qualified work becomes available.

## Relationship to PRODUCT.md

These categories elaborate `PRODUCT.md`'s "Opportunity Engine" and "Property and development signal evaluation" sections, which already establish two firm boundaries this file inherits:

- Opportunities come only from **customer-authorized sources** — HURKL never purchases or resells a customer's own paid memberships or subscriptions (e.g., a commercial bid-center membership); it connects to them only through authorized integrations, APIs, notifications, imports, email forwarding, or other permitted methods.
- Different signals matter to different trades at different project stages (see `PRODUCT.md`'s worked examples: residential sales vs. vacant land vs. commercial activity).

This file exists to keep a durable, growing list of the categories themselves. The detailed evaluation, ranking, and scoring logic behind each category is proprietary (see "Proprietary methods" in `PRODUCT.md`) and is not documented here — see `CAPACITY_ENGINE.md` and `QUALIFICATION_ENGINE.md` for what governs whether and how Mason acts on an opportunity once identified.

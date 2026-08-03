# Business Knowledge Graph

Status: permanent knowledge base entry, principle/category level only. See `BUSINESS_INTELLIGENCE.md`'s privacy boundary — this file describes the shared-intelligence concept and category structure, not the proprietary matching, scoring, or research logic behind it (see `PRODUCT.md`'s "Proprietary methods").

**Approved capability, not yet built.** Nothing here authorizes a real graph database, a real cross-tenant matching mechanism, or production data — see `ARCHITECTURE.md` §3 and `ROADMAP.md` for sequencing. Nothing here is a cross-tenant read; see `TRUSTED_TRADE_NETWORK.md` and `CLAUDE.md`'s permanent rules for the separate, deliberate process any actual cross-tenant capability requires.

## Purpose

An expansion of `OPPORTUNITY_ENGINE.md`: **every project exists once.** A commercial development, a permit, a property sale — each is a single real-world fact that many trades might care about. Today, each trade effectively re-discovers the same underlying project independently. The Business Knowledge Graph is the concept of treating a discovered project as a shared intelligence object, continuously updated, rather than re-researched from scratch by every relevant trade.

## Project Lifecycle Intelligence

A project discovered once should continuously update the opportunities it represents for every relevant trade — excavation, concrete, framing, roofing, electrical, and so on — rather than requiring duplicate research per trade. The project itself has a lifecycle (discovered, permitted, under construction, trades sequencing, completed), and Mason's opportunity awareness for a given tenant should track where in that lifecycle a relevant project currently sits.

This is the same underlying idea as Principle 018, "Research Once, Use Many Times" — applied to project research specifically.

## Trade Intelligence Profiles

Each supported trade should eventually define its own profile within the graph:

- Earliest opportunity signal for that trade
- Primary decision makers
- Relationship strategy
- Strongest lead sources
- Project timing (when that trade typically engages in a project's lifecycle)
- Qualification requirements
- Ideal marketing methods
- Recurring customers
- Trade hierarchy (see `TRUSTED_TRADE_NETWORK.md`'s example hierarchy)

**Lead generation should be trade-specific rather than universal** — a signal that matters enormously to an excavation contractor may be irrelevant to a painting contractor, even on the same project. Trade profiles are configuration and category structure, never hardcoded to a specific industry (per `PRODUCT.md`'s platform-neutrality rule) — the platform defines the shape of a trade profile; each tenant's own trade fills it in.

## Relationship to other documents

- `OPPORTUNITY_ENGINE.md` — this file is a direct expansion of that engine's opportunity categories.
- `TRUSTED_TRADE_NETWORK.md` — the trade hierarchy concept this file's Trade Intelligence Profiles build on, and the cross-tenant boundary this capability must respect if it ever touches data across tenants.
- `PRINCIPLES.md` 018 "Research Once, Use Many Times" — the principle this file exists to express.
- `PRODUCT.md`'s "Proprietary methods" — the actual matching/scoring/research logic behind project and trade intelligence stays out of this public repository.

# Business Risk Dashboard

Status: permanent knowledge base entry, principle/category level only. See `BUSINESS_INTELLIGENCE.md`'s privacy boundary — this file describes a future dashboard's categories, not proprietary risk-scoring formulas or real financial/customer data.

**Approved capability, not yet built.** Nothing here authorizes a real dashboard, integration, or production data — see `ARCHITECTURE.md` §3 and `ROADMAP.md` for sequencing. This is a documentation-only entry with no new domain contract of its own — it aggregates categories already modeled in `lib/domain/finance.ts`, `lib/domain/compliance.ts`, and `lib/domain/readiness.ts` rather than duplicating them.

## Purpose

**The objective is prevention rather than reaction.** Where `OPERATIONAL_READINESS.md` answers "are we ready to work today," the Business Risk Dashboard is the broader, forward-looking view: what could go wrong across the business if current trends continue unaddressed.

## What the dashboard shows

- Cash-flow risk (see `FINANCIAL_HEALTH.md`'s cash categories)
- Customer concentration
- Receivables
- Compliance (see `OPERATIONS_COMPLIANCE.md`)
- Certifications (see `OPERATIONS_COMPLIANCE.md`'s employee credentials)
- Insurance (see `OPERATIONS_COMPLIANCE.md`'s company credentials)
- Equipment readiness (see `OPERATIONS_COMPLIANCE.md`'s Equipment Lifecycle Engine)
- Maintenance
- Project exposure
- Staffing
- Capacity (see `CAPACITY_ENGINE.md`)

## Relationship to other documents

- `OPERATIONAL_READINESS.md` — the same-day counterpart; readiness is "today," this dashboard is "the trend."
- `FINANCIAL_HEALTH.md`, `OPERATIONS_COMPLIANCE.md`, `CAPACITY_ENGINE.md` — the source engines this dashboard aggregates rather than replaces or duplicates.
- `PRINCIPLES.md` 007 "Prevent Problems Before They Exist" and 019 "Hope for the Best, Prepare for the Worst" — the principles this dashboard exists to express.

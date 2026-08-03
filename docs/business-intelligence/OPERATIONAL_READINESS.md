# Operational Readiness Engine

Status: permanent knowledge base entry, principle/category level only. See `BUSINESS_INTELLIGENCE.md`'s privacy boundary — this file describes the categories the daily readiness check draws on, not proprietary risk-scoring logic.

**Approved capability, not yet built.** Nothing here authorizes a real readiness dashboard, integration, or production data — see `ARCHITECTURE.md` §3 and `ROADMAP.md` for sequencing.

## Purpose

Each morning, Mason should be able to answer one question: **"Are we ready to work today?"** This engine exists to aggregate the answer from the engines that already track the underlying facts, rather than requiring the owner to check five different places.

## What readiness includes

**People** — certifications, training, availability (see `OPERATIONS_COMPLIANCE.md`'s employee credentials).

**Equipment** — inspections, maintenance, availability (see `OPERATIONS_COMPLIANCE.md`'s Equipment Lifecycle Engine).

**Projects** — permits, documentation, scheduling (see `OPERATIONS_COMPLIANCE.md`'s project-specific compliance records and `PROJECT_COMPLIANCE_BINDERS.md`).

**Company** — insurance, licensing, compliance (see `OPERATIONS_COMPLIANCE.md`'s company credentials).

**Financial** — payroll readiness, receivables, upcoming obligations (see `FINANCIAL_HEALTH.md`).

## Behavior

**Highlight only actionable issues.** A readiness check that lists everything that's fine alongside everything that's wrong buries the one thing the owner actually needs to act on today — the point is prevention through visibility, not a status wall.

## Relationship to other documents

- `OPERATIONS_COMPLIANCE.md` and `PROJECT_COMPLIANCE_BINDERS.md` — the People, Equipment, Projects, and Company inputs.
- `FINANCIAL_HEALTH.md` — the Financial input.
- `PRINCIPLES.md` 007 "Prevent Problems Before They Exist" and 017 "Preparation Is Part of Production" — the principles this engine exists to express.
- `VOICE_FIRST_CAPTURE.md` — low-friction capture is what keeps the underlying records current enough for a daily readiness check to be trustworthy.
- `BUSINESS_RISK_DASHBOARD.md` — a related, broader future view; readiness answers "are we ready today," the risk dashboard answers "what could go wrong going forward."
- `lib/domain/readiness.ts` — the dependency-free TypeScript contracts (`ReadinessCategory`, `ReadinessIssue`, `DailyReadinessReport`) added ahead of implementation.

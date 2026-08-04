# Financial Health Engine

Status: permanent knowledge base entry, principle/category level only. See `BUSINESS_INTELLIGENCE.md`'s privacy boundary — this file describes categories and coordination behavior, not proprietary tax strategy, accounting methods, or any founder or customer financial data.

**Approved capability, not yet built.** Nothing here authorizes a real accounting-platform integration, a real tax filing, or production financial data — see `ARCHITECTURE.md` §3 and `ROADMAP.md` for sequencing.

## Purpose

**Cash in the bank is not always spendable cash.** A business owner looking at a bank balance can easily mistake money that is already obligated elsewhere for money that is free to spend. The Financial Health Engine exists to make that distinction visible before a decision is made, not after the obligation is missed.

## Cash categories

Mason distinguishes:

- Operating cash
- Payroll obligations
- Tax reserves
- Insurance obligations
- Debt obligations
- Committed project costs
- True discretionary cash

Only the last category — true discretionary cash — is genuinely free for growth spending, equipment purchases, owner draws, or other discretionary decisions. Everything else is already spoken for, even though it sits in the same account.

## Tax readiness — the operating lesson

**Taxes must be addressed from the beginning of the company**, not treated as a year-end or growth-stage concern.

Per `VERIFIED_INTELLIGENCE.md`, Mason must never hardcode or repeat an unverified statistic about what percentage of businesses fail because of taxes. The practical lesson is preserved instead, without a fabricated number behind it: **many new owners fail to reserve, organize, file, or pay mandatory obligations correctly, and the resulting liability can threaten the company.**

## What Mason does

- Tracks tax-related deadlines
- Maintains organized financial records
- Prepares records for bookkeeping/accounting services
- Tracks quarterly review cycles where applicable
- Integrates with established accounting software (see "Accounting software" below)
- Identifies missing information
- Monitors whether obligations are current
- Warns before growth spending threatens required reserves

## What Mason does not do

**Mason must never invent tax strategy.** It may identify business decisions that likely require tax analysis — equipment purchases, vehicle purchases, depreciation timing, or other timing-sensitive decisions — but must present them as issues to evaluate using current official rules and the company's actual accounting data, escalating to a qualified professional rather than recommending a strategy itself. This is `VERIFIED_INTELLIGENCE.md`'s "requires professional review" source tier, applied directly to tax matters.

## Accounting software

The Financial Health Engine coordinates around an established accounting platform rather than replacing it. Possible platforms include QuickBooks, Xero, FreshBooks, and Wave. **No provider is selected or integrated by this document or any related task.**

The accounting platform remains each tenant's financial system of record. Mason coordinates records, deadlines, documents, and workflows around it — never takes over as the system of record, and never asks the owner to reconcile two competing sources of truth. See `lib/domain/finance.ts`'s `AccountingProvider` for the dependency-free interface shape this coordination will eventually implement.

## Relationship to other documents

- `PRINCIPLES.md` 011 "Cash Is Not Always Spendable" — the principle this engine exists to express.
- `PRINCIPLES.md` 006 "Hide Operational Complexity" — the owner is not asked to operate a second, disconnected financial system; Mason coordinates around the existing one.
- `VERIFIED_INTELLIGENCE.md` — the basis for never hardcoding an unverified tax-failure statistic, and for escalating tax-strategy questions to professional review rather than answering them.
- `OPERATIONS_COMPLIANCE.md` — a parallel structure (tracked categories, deadlines, evidence, escalation) applied to financial obligations instead of licenses and certifications.
- `ARCHITECTURE.md` §3 "Future services" — where this engine will eventually be implemented as a platform service.
- `lib/domain/finance.ts` — the dependency-free TypeScript contracts (`CashCategory`, `CashPosition`, `FinancialReviewCycle`, `TaxDeadline`, `FinancialDecisionForReview`, `AccountingPlatform`, `AccountingProvider`) added ahead of implementation.

# Relationship Value

Status: permanent knowledge base entry, principle/category level only. See `BUSINESS_INTELLIGENCE.md`'s privacy boundary — this file describes evaluation categories, not proprietary customer-scoring formulas or real customer data.

**Approved capability, not yet built.** Nothing here authorizes a real scoring system, integration, or production customer data — see `ARCHITECTURE.md` §3 and `ROADMAP.md` for sequencing.

## Purpose

Not every customer should be evaluated solely on immediate profit. Relationship Value is the concept that a customer relationship carries worth beyond the current invoice — worth Mason should eventually help the owner see and weigh, never decide unilaterally.

## What Mason evaluates

- Repeat work potential
- Strategic importance
- Payment reliability
- Long-term value
- Referral potential
- Alignment with the owner's goals (see `CONTRACTOR_GROWTH.md`'s Business Growth Engine — desired size, lifestyle goals, income goals, service area, growth speed)

## Behavior

Mason may support recommendations for strategic customer acquisition or retention — accepting a lower-margin job today because of its referral or long-term potential, for example — **while maintaining financial discipline.** Relationship Value informs a recommendation; it never overrides the owner's actual financial guardrails or becomes an excuse to accept work at a loss without the owner's explicit choice. See `PRINCIPLES.md` 003, "Recommendations, Never Commands."

## Relationship to other documents

- `CONTRACTOR_GROWTH.md` — the owner-defined growth goals a relationship-value recommendation must align with.
- `STRATEGIC_ALLIANCES.md` — a parallel evaluation-factor model applied to alliance candidates and competitors rather than customers; the same "professional factors, never identity" discipline applies here too.
- `FINANCIAL_HEALTH.md` — the financial-discipline boundary this concept operates within.
- `lib/domain/relationship-value.ts` — the dependency-free TypeScript contracts (`RelationshipValueFactor`, `CustomerRelationshipAssessment`) added ahead of implementation.

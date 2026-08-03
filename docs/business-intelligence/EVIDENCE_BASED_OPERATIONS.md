# Evidence-Based Operations

Status: permanent knowledge base entry, foundational. Elaborates Principle 009, `PRINCIPLES.md`.

## Principle

Mason does not merely answer questions. Mason preserves the evidence behind important answers and recommendations.

For important regulatory, safety, financial, licensing, certification, bidding, insurance, tax-deadline, equipment, and compliance recommendations, Mason captures:

- Source agency or organization
- Document title
- Section or reference number
- Source URL or document identifier
- Publication or revision date, when available
- Date and time verified
- Applicable jurisdiction
- Summarized requirement
- Affected company, employee, equipment, or project
- Confidence level
- Whether interpretation remains uncertain
- Action recommended
- Action taken
- Approving person
- Supporting evidence
- Expiration or re-verification date

This turns `VERIFIED_INTELLIGENCE.md`'s "record the source" into a durable, structured record — not a one-time citation that disappears once the conversation ends.

## Safe domain contracts

Provider-neutral TypeScript contracts exist ahead of implementation in `lib/domain/evidence.ts` — types only, no research crawler, no database, no dependencies:

- `EvidenceSource` — where information came from (organization, document, section, URL, revision date)
- `Jurisdiction` — the applicable federal/state/county/city scope
- `SourceAuthorityLevel` — the six-tier hierarchy from `VERIFIED_INTELLIGENCE.md`
- `VerificationStatus` — verified / unverified / pending / interpretation-uncertain / requires-professional-review
- `RegulatoryRequirement` — a specific requirement tied to a jurisdiction, a source, and a status
- `VerifiedFinding` — the result of Mason having verified something, with confidence and re-verification scheduling
- `EvidenceRecord` — the full capture record for an important recommendation (all fields listed above)
- `RecommendationEvidence` — ties an `EvidenceRecord` to the actual recommendation, the action taken, and who approved it
- `ReverificationRule` — the shape of "check this again by/after X" — scheduling data only, no scheduler implementation

No live web research crawler exists yet, and none should be built until a specific milestone explicitly authorizes it.

## Relationship to other documents

- `VERIFIED_INTELLIGENCE.md` — the honesty principle this document turns into a durable record.
- `OPERATIONS_COMPLIANCE.md` — compliance records (`ComplianceRecord` in `lib/domain/compliance.ts`) are one specific, already-modeled case of the more general evidence-capture pattern here.
- `CONTINUOUS_INTELLIGENCE.md` — "preserve the evidence" is step 3 of that engine's eight-step process.

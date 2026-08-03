# Digital Project Compliance Binders

Status: permanent knowledge base entry, principle/category level only. See `BUSINESS_INTELLIGENCE.md`'s privacy boundary — this file describes a future capability's structure, not proprietary risk-scoring or renewal-sourcing logic.

**Future capability, not yet built.** Nothing here authorizes a real compliance database, a real integration, or production data — see `ARCHITECTURE.md` §3 and `ROADMAP.md` for sequencing.

## Purpose

A digital compliance binder automatically assembled per job, showing:

- what is required
- what is present
- what is missing
- what expires during the project
- where every requirement came from
- evidence of compliance
- who verified it
- when it was verified

Mason should be able to produce the full compliance record immediately when requested by a customer, inspector, owner, project manager, or regulator — subject to access controls (see `SECURITY.md`'s RBAC roles; a binder view must never expose more than the requester's role is entitled to see).

This is a direct application of `PRINCIPLES.md` 007 ("Prevent Problems Before They Exist") and 009 ("Evidence-Based Operations," `EVIDENCE_BASED_OPERATIONS.md`) to a single project's compliance posture: the binder is the evidence trail, assembled and kept current automatically rather than reconstructed under pressure during an inspection or dispute.

## What a binder assembles

Per `OPERATIONS_COMPLIANCE.md`'s "project-specific compliance records" category: permits, the project safety plan, employee qualifications assigned to the project, equipment records assigned to the project, insurance certificates on file, bonds on file, daily logs, toolbox talks, incident records, project-specific orientations, and customer-specific requirements.

## Relationship to other documents

- `OPERATIONS_COMPLIANCE.md` — the engine this binder is assembled from; the binder is a per-project view over that engine's records.
- `PRINCIPLES.md` 007 "Prevent Problems Before They Exist" and 009 "Evidence-Based Operations" — the principles this capability exists to express.
- `EVIDENCE_BASED_OPERATIONS.md` — every binder item traces back to a source, a verifier, and a verification date, exactly as that file requires.
- `SECURITY.md`'s RBAC roles — the access-control boundary a binder view must respect.
- `lib/domain/compliance.ts` — the dependency-free TypeScript contracts (`ComplianceBinderItem`, `ComplianceBinder`) added ahead of implementation.

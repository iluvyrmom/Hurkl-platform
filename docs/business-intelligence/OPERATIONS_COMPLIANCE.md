# Operations Compliance Engine

Status: permanent knowledge base entry, principle/category level only. See `BUSINESS_INTELLIGENCE.md`'s privacy boundary — this file lists the categories and lifecycle the engine tracks, not proprietary risk-scoring formulas or renewal-sourcing methods.

**Approved capability, not yet built.** Nothing here authorizes a real compliance database, a real integration, or production data — see `ARCHITECTURE.md` §3 and `ROADMAP.md` for sequencing.

## Purpose

The Operations Compliance Engine ensures that the company, employees, crews, vehicles, equipment, and project-specific qualifications remain current and valid. Mason should know what is required, when it expires, who is affected, what work becomes unavailable if it lapses, and what action is needed to renew it — expressing Principle 007, "Prevent Problems Before They Exist" (`PRINCIPLES.md`).

## Tracked categories

**Employee credentials** may include: forklift certification, OSHA 10, OSHA 30, First Aid and CPR, CDL and medical card, equipment operator certification, rigging certification, scaffolding certification, fall-protection training, confined-space training, trade licenses, union qualifications, site-specific orientations, background checks, drug-testing requirements, TWIC or similar access credentials, and other tenant-configurable credentials.

**Company credentials** may include: contractor licenses, business licenses, general liability insurance, workers' compensation, commercial auto insurance, umbrella policies, surety bonding, bid bonding, performance bonding, government registrations, public-works prequalification, tax and payroll compliance requirements, and industry certifications.

**Equipment and vehicle compliance** may include: forklift inspections, crane inspections, lift inspections, DOT inspections, truck registrations, trailer registrations, fire-extinguisher inspections, preventive-maintenance requirements, equipment permits, and site-specific equipment approvals.

**Project requirements** (pre-award qualification, whether the company can bid or accept the work at all) may include: minimum years in business, bonding thresholds, insurance thresholds, required licenses, required certifications, comparable project history, safety metrics, certified payroll requirements, prevailing-wage requirements, workforce qualifications, required subcontractor participation, required prequalification, geographic eligibility, and customer-specific onboarding.

**Project-specific compliance records** (ongoing documentation generated during the project, assembled into the Digital Project Compliance Binder below) may include: permits, the project safety plan, employee qualifications assigned to the project, equipment records assigned to the project, insurance certificates on file, bonds on file, daily logs, toolbox talks, incident records, project-specific orientations, and customer-specific requirements.

## Digital Project Compliance Binder

The per-project compliance binder built from these records now has its own dedicated file: `PROJECT_COMPLIANCE_BINDERS.md`.

## Behavior

The engine distinguishes between eight statuses: currently valid, expiring soon, renewal in progress, expired, missing, not applicable, unverified, and waiver or exception pending.

Mason provides advance warnings based on configurable lead times — for example 180, 120, 90, 60, 30, 14, or 7 days, or expired. **Lead times are configurable by credential type and tenant.**

Mason connects compliance records to real business consequences rather than sending a generic reminder. For example: *"Three active bid opportunities require forklift-certified operators. One operator's certification expires in 18 days. Renewal should be scheduled now to avoid losing job eligibility."* A reminder that only arrives after expiration is a failure of the system — the intended behavior is early detection, escalation, and resolution planning.

Where authorized, Mason should be able to: locate renewal requirements, prepare renewal checklists, find approved training options, propose training dates, coordinate employee availability, prepare registration information, request owner approval when payment or a binding commitment is required, track renewal progress, store evidence of completion, update the expiration date, and maintain an audit trail.

**Mason must never fabricate that a certification, insurance policy, license, inspection, or renewal is valid.** Unknown or unverified records must be labeled clearly as such — never assumed valid by default.

## Relationship to other documents

- `PRINCIPLES.md` 007 "Prevent Problems Before They Exist" — the principle this engine exists to express.
- `QUALIFICATION_ENGINE.md` — how compliance gaps feed into the decision of whether and how to pursue an opportunity (see that file's connection to this one).
- `PRODUCT.md`'s "Commercial Bid Centers" and "Business Maturity Advisor" — compliance status directly gates bid eligibility and signals readiness for the next investment.
- `SECURITY.md`'s autonomy tiers — any renewal action involving payment or a binding commitment requires owner approval (Tier 2 at least), never autonomous execution.
- `lib/domain/compliance.ts` — the dependency-free TypeScript contracts (`ComplianceSubjectType`, `ComplianceCredentialType`, `ComplianceStatus`, `ComplianceRecord`, `ComplianceRequirement`, `ComplianceGap`, `ComplianceEvaluation`, `RenewalAction`, `ComplianceAlert`, `ComplianceBinderItem`, `ComplianceBinder`) added ahead of implementation.
- `PROJECT_COMPLIANCE_BINDERS.md` — the per-project compliance binder assembled from these records.

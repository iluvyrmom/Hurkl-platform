# Voice-First Capture — "Talk to Mason"

Status: permanent knowledge base entry, principle/category level only. See `BUSINESS_INTELLIGENCE.md`'s privacy boundary — this file describes the capture experience and data model, not any speech-to-text vendor, AI-extraction model, or proprietary classification logic.

**Approved capability, not yet built.** Nothing here authorizes a real speech-to-text integration, a real AI extraction pipeline, or production data — see `ARCHITECTURE.md` §3 and `ROADMAP.md` for sequencing.

## Purpose

Owners and field employees do not think in forms — they think in conversations. This file documents the philosophy and shape of Mason's primary capture interface, built around one idea: **if recording information is difficult, the information will never be recorded.**

## Friction is failure

Every workflow should minimize friction, and every required click should have to justify itself. Goals:

- Zero manual entry whenever possible.
- One tap whenever practical.
- Voice before forms.
- Automatic classification.
- Automatic linking.
- Automatic reminders.
- Automatic scheduling.

## Conversation before forms — "Talk to Mason"

The primary capture interface is a single button: **"Talk to Mason."** Press. Talk naturally. Mason performs, without requiring the user to manually categorize anything:

- Speech-to-text
- Intent recognition
- Structured data extraction
- Project linking
- Employee linking
- Equipment linking
- Customer linking
- Timeline updates
- Reminder creation
- Audit logging

## Voice-first logging

Mason should support conversational operational logging such as:

- *"Forklift three passed inspection."*
- *"Crew finished Building C."*
- *"Truck twelve got new brakes."*
- *"John completed OSHA training."*
- *"Concrete inspection passed."*
- *"We finished drywall today."*

The user speaks naturally. Mason determines what happened, where it belongs, who is affected, what follow-up actions are needed, and what future reminders to create — see `OPERATIONS_COMPLIANCE.md` (credentials, equipment) and `PROJECT_COMPLIANCE_BINDERS.md` (project records) for where this structured output eventually lands.

## Original record preservation

**The original record is never discarded after structured extraction.** Each voice log may preserve: the original transcript, optional original audio, timestamp, location (if enabled), attached photos, the structured data extracted from it, a confidence score, and links to the relevant project, equipment, and employee.

This is `EVIDENCE_BASED_OPERATIONS.md`'s discipline applied to voice capture specifically: the source (what was actually said) stays available alongside the interpretation (what Mason extracted from it), so a low-confidence or disputed extraction can always be checked against what was really said.

## Never ask twice

If Mason already knows information, it never requests it again. Existing knowledge is reused; everything possible is pre-filled; Mason only asks for genuinely missing information.

## The five-second rule

Routine operational logging should generally take five seconds or less — tap, speak, done. Any workflow that takes meaningfully longer should be evaluated for redesign against the friction-is-failure principle above.

## Relationship to other documents

- `PRINCIPLES.md` 013–016 — the principles this file exists to express (Friction Is Failure, Conversation Before Forms, Never Ask Twice, The Five-Second Rule).
- `EVIDENCE_BASED_OPERATIONS.md` — the preserved-original-record discipline above is this principle applied to voice capture.
- `OPERATIONS_COMPLIANCE.md` — voice logs about certifications, inspections, and equipment feed directly into this engine's records.
- `OPERATIONAL_READINESS.md` — a fast, low-friction capture surface is what keeps the daily readiness picture current without becoming its own chore.
- `SECURITY.md`'s audit logs — every voice-triggered action is still recorded there, friction-free capture does not mean unaudited capture.

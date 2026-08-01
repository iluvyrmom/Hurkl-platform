# HURKL Platform

HURKL is the platform behind **Mason**, a configurable AI Office Manager for service businesses.

## Mission

**Helping Business Owners Reclaim Their Lives.**

Mason answers calls, texts, and emails as an employee of each client business — not as a third-party chatbot — handling scheduling, lead qualification, follow-up, and routine customer communication so owners get their time back. Mason is industry-neutral by design: every business-specific behavior (services, pricing, policies, hours, workflows) is configuration, not code specific to any one trade.

## Repository status

**This repository is currently documentation-only.** No application code has been written yet. The product has been designed in detail (see below); this repo captures that design before any scaffolding begins.

## Documentation

Read these before making any product or engineering decision:

- [`PRODUCT.md`](./PRODUCT.md) — what Mason is, who it serves, capabilities, boundaries, and the initial pilot.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — recommended technical architecture, provider strategy, AI cost routing, and deployment plan (proposal, pending founder approval).
- [`SECURITY.md`](./SECURITY.md) — tenant isolation, authentication/authorization, secrets, audit logging, and incident handling requirements.
- [`ROADMAP.md`](./ROADMAP.md) — phased build order from documentation through multi-company commercial release.
- [`CLAUDE.md`](./CLAUDE.md) — permanent operating rules for any Claude Code session working in this repository.

## Development setup

Not yet applicable — no application has been scaffolded. Setup instructions will be added in Phase 1 of `ROADMAP.md`, once a stack is confirmed and the project is initialized.

## Security warning

Never commit API keys, tokens, passwords, customer data, private email content, or voice/telephony credentials (including ElevenLabs or telephony provider credentials) to this repository. See `SECURITY.md` and `.gitignore`. If you're unsure whether something is safe to commit, don't commit it — ask first.

# HURKL's internal ownership / account-classification system

Status: built and locally verified. **Not yet applied to `Hurkl-production`** — the migration is written and tested against a disposable local Postgres, same discipline as every prior migration, but application is queued behind the Supabase connection being reachable again. Not a customer feature — an internal platform feature, per the founder's explicit framing.

## Why this exists

HURKL needs to always recognize companies that belong to HURKL itself — the founder's own company, development/test companies, demo companies, and (later) approved partners — and give them full platform access without ever creating a subscription, invoice, or Stripe charge for them. Production customers continue through the normal billing system exactly as designed (which does not exist yet — see "What doesn't exist yet" below).

## Architecture changes

- **`companies.account_type`** (new column, `supabase/migrations/00000000000005_company_account_types.sql`): `production_customer` (default) | `internal_hurkl` | `demo` | `development` | `partner`. A CHECK list, not an enum — same reasoning as `audit_log.autonomy_tier` and `conversations.channel`: account types are expected to grow (`Enterprise` is already anticipated), and a CHECK list means adding one later is a one-line `ALTER`, not an enum migration.
- **One centralized billing-authorization layer** (`lib/billing/authorization.ts`): `getBillingDecision(client, companyId)` is the only sanctioned way to ask "does this company get billed?" — every future billing workflow (subscriptions, invoices, Stripe checkout, plan-limit enforcement) must call it rather than re-deriving the answer from `account_type` itself. This prevents the exact thing the founder asked to avoid: billing exceptions scattered across the codebase as ad hoc `if (accountType === 'internal_hurkl')` checks at each call site.
- **One admin-only mutation path** (`lib/billing/account-type-admin.ts#setCompanyAccountType`): calls the `set_company_account_type` database function — never a direct table `UPDATE` from application code, and not exposed to customers anywhere.

## Database changes

`supabase/migrations/00000000000005_company_account_types.sql`:
- Adds `companies.account_type` with the CHECK list above, default `production_customer`.
- Re-classifies the already-seeded `HURKL (Internal)` company (from the Telegram migration, `00000000000004`) as `internal_hurkl` — this is the company the founder's own owner profile attaches to (see "Owner account" below). No second "internal company" concept was introduced; this reuses what already existed.
- Adds `set_company_account_type(p_company_id, p_new_account_type)`, a `SECURITY DEFINER` function that:
  1. Checks `is_hurkl_admin()` **inside the function itself** and raises if the caller isn't one — enforced in the database, not just the application layer, so even a direct RPC call from a non-admin authenticated user is rejected server-side.
  2. Updates `account_type` (the table's own CHECK constraint still validates the new value).
  3. Writes an `audit_log` entry (`action = 'company_account_type_changed'`, `tier_1_automatic` — see the security review below for why that tier, not `tier_2`).
  4. Grants: `revoke all ... from public; grant execute ... to authenticated;` — same least-privilege pattern as `create_company_and_assign_owner` (migration 3). The `authenticated` grant is intentional: the function's *own* internal check is what actually gates access, exactly like `create_company_and_assign_owner` is callable by any signed-in user but only succeeds for its own valid preconditions.

## Code changes

- `lib/billing/authorization.ts` — `AccountType`, `decideBilling` (pure), `getBillingDecision` (looks the company up for real, never trusts a client-supplied value).
- `lib/billing/account-type-admin.ts` — `setCompanyAccountType`, `NotHurklAdminError`.
- No UI, no API route was added for changing `account_type` — the founder's spec asked for "an admin-only workflow," and per the same reasoning as `scripts/telegram-link-owner.ts` (a comparably sensitive, comparably rare bootstrap-style action), this stays a direct function call rather than a customer-reachable surface. If a founder-facing admin console is wanted later, it would call `setCompanyAccountType` — the authorization logic doesn't move.

## Migration requirements

Migration `00000000000005` depends on `00000000000001` (companies, `is_hurkl_admin()`), `00000000000002` (audit_log), and `00000000000004` (the seeded internal company it re-classifies) — must apply after all three, which filename ordering already guarantees. No other migration depends on this one yet.

## Security review

- **Never trusts the client**: `is_hurkl_admin()` is evaluated against the database's own `profiles.role` for the authenticated caller (`auth.uid()`), inside `SECURITY DEFINER` function execution — not a header, not a request body field, not a JWT claim read directly by application code.
- **Every billing decision re-verifies from the database**: `getBillingDecision` always queries `companies.account_type` fresh; nothing caches or trusts a previously-computed exemption across requests.
- **Autonomy-tier note**: the audit entry uses `tier_1_automatic`, not `tier_2_approval_required`. SECURITY.md's autonomy tiers govern *Mason's* behavior toward a tenant — this is a human platform owner's own direct administrative action, gated entirely by the `is_hurkl_admin()` check itself (there's no further pending-approval step to represent). Same reasoning already applied to `company_created_owner_assigned` in migration 3.
- **Open question, flagged rather than silently decided**: the founder's spec named `partner` as an account type but never specified its billing behavior in the Billing Rules section (unlike `internal_hurkl`, `development`, and `demo`, each called out explicitly as billing-exempt). `lib/billing/authorization.ts` currently treats `partner` as **billed like a production customer** by default — the more conservative reading, since silently exempting partners from billing without being asked to would be a bigger, unrequested decision. Revisit `BILLING_EXEMPT_ACCOUNT_TYPES` in that file when partner billing terms are actually decided.
- **What this does not do**: there is still no real Stripe/subscription/invoice system anywhere in this codebase. This work is the guardrail built *before* that exists, not a bypass of anything real yet — there is nothing to bypass today.

## Tests added

- `lib/billing/authorization.test.ts` — `decideBilling` for all five account types (parameterized), `getBillingDecision` against a fake client (happy path, lookup failure, not-found).
- `lib/billing/account-type-admin.test.ts` — `setCompanyAccountType` calls the RPC correctly, maps the database's admin-check rejection to `NotHurklAdminError`, surfaces any other failure rather than swallowing it.
- `lib/db/company-account-types.integration.test.ts` — against real local Postgres: the internal company is seeded `internal_hurkl`; a new company defaults to `production_customer`; a `hurkl_admin` can change a type and it's audit-logged with the exact expected row; an ordinary company owner is rejected by the function *and* by a raw `UPDATE` (zero rows affected — `companies` has no UPDATE policy for any ordinary role at all); the CHECK constraint rejects an invalid type even from a `hurkl_admin`.
- Full suite run locally before this was considered done: format/typecheck/lint/build/`audit:report` plus 88 unit tests (was 76, +12) and 28 integration tests (was 22, +6) — all passing.

## Owner account (Josh)

Not yet created — blocked on the Supabase connection being reachable from this session (unrelated to this migration; the same blocker as the rest of this session's production work). Planned, once unblocked:
- A real `auth.users` row created directly via the Supabase Admin API (no sign-up page needed — nothing is deployed publicly yet for one to exist).
- A `profiles` row: `full_name = 'Josh'`, `role = 'hurkl_admin'`, `company_id = '00000000-0000-0000-0000-000000000001'` (the Internal HURKL company). The schema's existing CHECK constraint (`role = 'hurkl_admin' or company_id is not null`) only requires a company for non-admin roles — it does not forbid an admin from also having one, so this gives Josh both full platform permissions (via `hurkl_admin`) and a personal company correctly classified `internal_hurkl` for billing-exemption purposes, without inventing a second mechanism.
- A `telegram_links` row connecting his personal Telegram id (already collected) to that profile.

## Telegram identity distinctions

- **Josh (platform owner)** — a human identity, linked via `telegram_links` to his `profiles` row (above). This is what already exists in `lib/communications/telegram-identity.ts`.
- **Mason (AI executive)** — not a "sender" in this model at all. Mason never authenticates as an inbound message source; he's who `CommunicationAdapter#send()` replies as. There is no `telegram_links` row for Mason, and there shouldn't be — bots are service identities, not human accounts to authenticate against an allow-list built for humans.
- **Business users** — future real tenant customers, once a customer-facing channel exists (not built yet — Telegram is explicitly internal/dev only, see `docs/communications-architecture.md`). They would get their own `telegram_links`/company-scoped rows under their own tenant's `company_id`, structurally isolated from the internal HURKL company exactly the way `customers`/`audit_log` already isolate real tenants from each other.
- **Future HAL specialists** — per the numbering convention agreed in this session (specialist channels get numbered — 1, 2, 3... — rather than individually named), whenever specialists are actually authorized to run (a separate, explicit decision per Knowledge Capture Session 009 — unrelated to and not advanced by this work).

## Future scalability concerns

- **Multi-bot registry.** The founder's spec explicitly asked that bot identities not be hardcoded, and none are — `TELEGRAM_BOT_TOKEN` is the only bot identity in code today, read from an environment variable, never a literal name or token in source. With a single bot (`@M_HurklBot`), an environment variable is sufficient "configuration, not code." If/when a second bot is actually added (e.g. a numbered specialist channel), a small `bot_registry` table (bot id, platform, label, which env var/secret holds its token) would be the natural next step — deliberately not built now, since there is exactly one bot today and building a registry for a hypothetical second one would be speculative, unused infrastructure.
- **`partner` billing terms** — see the security review's open question above.
- **Demo company expiry** — the founder's spec mentions demo companies "can optionally expire later if desired." No expiry mechanism exists yet (no `expires_at` column, no cleanup job); flagged here as a deliberately deferred, not forgotten, piece.
- **Enterprise account type** — anticipated by the founder's spec but not added to the CHECK list yet, since nothing distinguishes its behavior from `production_customer` today. Adding it later is a one-line migration once there's a real behavioral difference to encode.

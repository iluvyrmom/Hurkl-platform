# Production migration plan — `Hurkl-production`

Status: **Historical — this plan has since been executed.** All 6 migrations (`00000000000001` through `00000000000006`) are applied to `Hurkl-production` as of 2026-08-06, including a 6th one not covered by this document (`00000000000006_grant_table_privileges.sql` — see `docs/communications-architecture.md`'s "Production incident, 2026-08-06" for why). This document is kept as the review/verification record for migrations 1–3; the plan-only framing below no longer reflects current reality.

**Update:** findings F1, F2, and F4 from the original review (below) have since been fixed directly in `supabase/migrations/00000000000001_tenant_foundation.sql` and `00000000000002_customers_and_audit_log.sql`, since neither had been applied anywhere real yet. File hashes in this document were recomputed after the fix — see the "Findings summary" and updated hashes below.

Real project: `Hurkl-production` (ref `atwaixmsvzehheotdymf`, org `Hurkl`, region `ca-central-1`, Postgres 17, org plan **free**). Connection confirmed working via the Supabase MCP connector on 2026-08-03; `list_tables`/`list_migrations` both returned empty — the project is live and reachable but has no schema applied yet.

## 1. Migration review

Three migrations exist, in required order (each depends on the one before it — no circular dependencies, no migrations can be reordered):

### `00000000000001_tenant_foundation.sql`

| Object | Type | Notes |
|---|---|---|
| `pgcrypto` | extension (`create extension if not exists`) | provides `gen_random_uuid()` |
| `public.companies` | table | `id uuid pk default gen_random_uuid()`, `name text not null`, `created_at` |
| `public.user_role` | enum | `hurkl_admin, owner, manager, employee, customer` |
| `public.profiles` | table | `id uuid pk references auth.users(id) on delete cascade`, `company_id uuid references companies(id) on delete cascade`, `role user_role not null`, `full_name`, CHECK `profiles_company_required_unless_hurkl_admin` (company_id required unless role = hurkl_admin) |
| `profiles_company_id_idx` | index | btree on `profiles(company_id)` |
| `public.current_company_id()`, `current_role()`, `is_hurkl_admin()` | functions | `SECURITY DEFINER`, `STABLE`, `SET search_path = public` — read `profiles` keyed on `auth.uid()` |
| RLS | — | enabled on `companies` and `profiles` |
| Policies | — | `companies_select_own` (select only); `profiles_select_own_company` (select only); `profiles_update_own_row` (own row only). **No insert/update/delete policy on `companies` for ordinary roles** — see finding F3 below. |

### `00000000000002_customers_and_audit_log.sql`

| Object | Type | Notes |
|---|---|---|
| `public.customers` | table | `id uuid pk`, `company_id uuid not null references companies(id) on delete cascade`, `name`, `phone`, `email`, `deleted_at timestamptz` (soft-delete marker, added by the F1 fix), `created_at` |
| `customers_company_id_idx` | index | btree on `customers(company_id)` |
| `public.audit_log` | table | `id uuid pk`, `company_id uuid not null references companies(id) on delete cascade`, `actor_user_id uuid references auth.users(id) on delete set null` (F2 fix — was `no action`), `action text not null`, `autonomy_tier text not null` CHECK (one of the three tier values), `policy_reference`, `subject_type`, `subject_id`, `metadata jsonb not null default '{}'`, `created_at` |
| `audit_log_company_id_idx` | index | btree on `audit_log(company_id)` |
| RLS | — | enabled on both tables |
| Policies | — | `customers`: select/insert/update scoped to `current_company_id()`; **no DELETE policy at all** (F1 fix — was a real hard-delete policy). Deleting a customer now means the app sets `deleted_at` via the existing UPDATE policy; permanent removal is not reachable through RLS at all. `audit_log`: select + insert only — **no update/delete policy exists at all**, which is what makes it structurally append-only (RLS default-denies any command with no matching policy). |

### `00000000000003_company_onboarding.sql`

| Object | Type | Notes |
|---|---|---|
| `public.create_company_and_assign_owner(...)` | function | `SECURITY DEFINER`, `LANGUAGE plpgsql`, `SET search_path = public`. Atomically: validates caller is authenticated and inputs are non-empty, inserts a company, claims the caller's `profiles` row via `INSERT ... ON CONFLICT (id) DO UPDATE ... WHERE company_id IS NULL`, checks `ROW_COUNT` to detect "already has a company" and raises (rolling back the company insert too), writes one `audit_log` row. No new tables/columns. |
| Grants | — | `revoke all ... from public; grant execute ... to authenticated;` — the only explicit grant statement anywhere in the three migrations. |

### Dependency order

`00000000000001` → `00000000000002` (needs `companies`, `current_company_id()`, `is_hurkl_admin()`) → `00000000000003` (needs `companies`, `profiles`, `audit_log`). Filename timestamps already enforce this order; `supabase db push` / the SQL editor applied in filename order will apply correctly.

### Rollback / down migrations

**None exist.** There is no down-migration mechanism, no reversal scripts, and no Supabase CLI rollback tooling in use. Rolling back after applying would mean hand-writing `DROP` statements in reverse dependency order (see §4's recovery plan below).

### Destructive / irreversible behavior

- **F1 — FIXED.** `customers` now has a `deleted_at timestamptz` column and no DELETE RLS policy at all — hard deletion of a customer row is no longer reachable through RLS by any tenant role; "deleting" a customer means the app issues an `UPDATE ... SET deleted_at = now()` through the existing UPDATE policy. Matches `SECURITY.md` §10's "soft-delete first" requirement. Proven in `lib/db/tenant-isolation.integration.test.ts`: a same-company hard `DELETE` now affects zero rows, and a soft-delete `UPDATE` succeeds.
- **`ON DELETE CASCADE`** on `profiles.company_id`, `customers.company_id`, and `audit_log.company_id`: deleting a `companies` row cascades to delete every profile, customer, and audit entry for that tenant, with no confirmation step at the database layer. Intentional (tenant offboarding needs *some* mechanism), but worth knowing this is a hard, cascading, irreversible delete with nothing above the database layer gating it yet — the "companies" table also has no delete RLS policy for ordinary roles at all, so this can currently only happen via a service-role/superuser connection, not through the app. Not changed by the F1/F2 fixes; still worth a conscious decision later (e.g. blocking cascade if a company has any non-deleted customers).
- **F2 — FIXED.** `audit_log.actor_user_id` now has `ON DELETE SET NULL` instead of the implicit `NO ACTION`. Deleting an `auth.users` row that has audit_log entries now succeeds — the audit_log rows survive with `actor_user_id` nulled out, rather than the deletion failing outright. Proven in `lib/db/tenant-isolation.integration.test.ts`: a user with audit history is deleted (as the superuser/service-role-equivalent connection), and the surviving audit_log row's `actor_user_id` is confirmed null.

### RLS coverage

All four tables created by the migrations have RLS enabled: `companies`, `profiles`, `customers`, `audit_log`. No tenant-scoped table is missing RLS.

### Tenant isolation: enforced by policy, not application code

Confirmed by policy definition and by the local integration-test suite (§2 below) — every policy expression is `company_id = public.current_company_id() [or public.is_hurkl_admin()]`, evaluated inside Postgres itself. A crafted request from application code cannot bypass this; the tests prove crafted cross-tenant `UPDATE`/`DELETE`/`INSERT` statements are rejected or affect zero rows at the database layer, not just filtered by a query builder.

### Service-role assumptions

- The migrations themselves make **no** service-role assumptions and grant nothing to `service_role` explicitly — `service_role` bypasses RLS entirely by Postgres/Supabase convention, which is standard and not something these migrations need to configure.
- **F4 — FIXED.** Migration 1's header comment previously said company creation "goes through the dedicated, audited HURKL-admin path (service role), never a tenant's own request" — inaccurate, since migration 3 implements it as a `SECURITY DEFINER` function granted to `authenticated`. The comment now correctly points at `create_company_and_assign_owner` in migration 3. No functional change; the function itself was always safe.
- **Table-level grants to `anon`/`authenticated`** are not present anywhere in the three migrations (only the one function `EXECUTE` grant in migration 3). This relies entirely on Supabase's project-level default ACLs. **Verified directly against `Hurkl-production` via `pg_default_acl`**: the project already has default privileges granting `anon` and `authenticated` full table-level CRUD on future objects created in `public` by `postgres`/`supabase_admin` (the roles migrations run as), matching what `lib/db/test-support/local-role-grants.sql` manually approximates for local testing. This closes what would otherwise be an open assumption — the local test environment's role/grant model is a faithful match for production defaults, not a guess.

### Alignment with the approved Mason/HAL architecture

- Matches `ARCHITECTURE.md` §4 (single Postgres, `company_id` on every tenant-scoped table, RLS as the enforcement layer, no cross-tenant query path outside a dedicated admin path) and `SECURITY.md` §1/§3/§6 (RLS-enforced isolation, RBAC roles matching `PRODUCT.md`'s role list, append-only audit log).
- Scope matches the founder's explicit boundary for this slice: no Mason runtime tables (conversations, calls, estimates, invoices, HAL execution state) exist in this migration set, which is correct — those weren't in scope.
- The one open gap against the approved posture (F1, no soft-delete) has been fixed — see above. Everything else reviewed here is either already aligned or a minor, low-risk doc/FK-behavior note (F2, F4 — also fixed).
- A pre-existing, Supabase-platform-managed object was found in `Hurkl-production` that predates and is unrelated to these migrations: `public.rls_auto_enable()`, an event trigger function Supabase installs by default that auto-enables RLS on any newly created `public` table. Supabase's own security advisor flags it (WARN-level, `anon`/`authenticated` can technically invoke it as a bare RPC call, though calling it outside its event-trigger context does nothing harmful — it just iterates zero rows). Not something our migrations create or need to touch; flagged here only so it isn't mistaken for something introduced by this work.

## 2. Verification against a disposable environment

**Environment used: local, disposable PostgreSQL 16** (not a Supabase-hosted branch). The org's Supabase plan is **free**, and Supabase's database-branching feature is a paid capability — per the founder-approved cost policy ("no paid infrastructure without explicit approval"), a branch was not created. The local Postgres instance applies the exact same migration files (`supabase/migrations/*.sql`, byte-for-byte, no modifications) plus a local-only `auth` schema stand-in and role grants that were just cross-checked against `Hurkl-production`'s real default ACLs and found to match (see F4 discussion above) — so this environment is a faithful proxy for the real project's RLS/grant behavior, not merely "some Postgres."

File hashes as of the F1/F2/F4 fix (current — for the production migration plan in §4 below):

```
2c9455422bee3eeff5f18f19b5b58bb6cd3ec2b44eb1afed2b3663d00e175519  00000000000001_tenant_foundation.sql
2267edad663aff9914b675dd453ec18afb94fc79e4f66f7769c7539be8d0d0a8  00000000000002_customers_and_audit_log.sql
20d4882feb79af6476d056fa35814306587e116a3b19fc0449b611e8836c873a  00000000000003_company_onboarding.sql
```

(Migration 3's hash is unchanged — the fixes only touched migrations 1 and 2. The original pre-fix hashes were `4d176381607de3b67a1711a6b70c0c268743432b0e5f73652b5259fa5cd15cad` for migration 1 and `d1fbd5166e247e9be0a00125471fbdff30ef664944f637eba280305e2660a0b7` for migration 2 — recorded here only for continuity with earlier discussion of this document, not because that version is still relevant to apply.)

### Results (all run this session, 2026-08-03)

| Check | Result |
|---|---|
| Migrations apply cleanly from an empty database | **Pass.** Dropped and recreated `hurkl_test` from scratch (genuinely empty, not just schema-reset), applied all three migrations via `applyTestSchema`, all 13 integration tests passed. |
| Migrations replay deterministically | **Pass.** Immediately re-ran the same suite a second time (each run does its own drop-schema-cascade + full reapply). Identical result: 2 files, 13 tests, all passing, both runs. |
| Tenant A cannot access tenant B's data | **Pass** — `lib/db/tenant-isolation.integration.test.ts`: a real crafted cross-tenant `UPDATE`/`DELETE` (as Company A's user, targeting Company B's row) affects zero rows; a crafted `INSERT` forging another company's `id` is rejected outright by RLS (`row-level security` error), not just filtered. |
| Anonymous users cannot access protected records | **Pass**, with one noted fidelity limit. The test suite exercises "authenticated role, no `app.test_current_user_id` set" (returns zero rows everywhere, since `current_company_id()` resolves to null and no policy matches null). This is not literally Supabase's separate `anon` role, since the local stand-in doesn't create one. That gap is substantially closed by the `pg_default_acl` check in §1 above — production's `anon` role gets the same broad table grants `authenticated` does, meaning RLS (which denies on `company_id = null`) is the only thing standing between `anon` and tenant data in both environments, and RLS is what's under test. |
| Authenticated users only receive authorized tenant data | **Pass** — a company's user sees only their own company's customers; the one documented exception (a `hurkl_admin` row) can read across tenants, matching `ARCHITECTURE.md` §4's single narrow cross-tenant admin exception. |
| Audit records are append-safe | **Pass** — explicit test inserts an audit_log row, then attempts `UPDATE` and `DELETE` on it as the same tenant's user; both affect zero rows (no matching RLS policy exists for those commands at all, so they default-deny). |
| Tests/seed data do not touch production | **Confirmed.** `.env.local`'s `NEXT_PUBLIC_SUPABASE_URL` does not reference the production project ref (`atwaixmsvzehheotdymf`); `.github/workflows/ci.yml` explicitly documents its Postgres service container is disposable and never connects to Supabase; no test file or script references real Supabase credentials or the production ref anywhere in the repo. |
| The application builds and tests against the migrated environment | **Pass** — `npm run build`, `typecheck`, `lint`, `format:check`, unit tests (68/68), integration tests (13/13, against the freshly-migrated local DB above), and `audit:report` (no new dependency findings) all pass as of this review. |

Company-onboarding-specific coverage (`lib/db/company-onboarding.integration.test.ts`, all passing): atomic create+claim+audit in one call; rejects unauthenticated calls; rejects empty company name with **zero orphaned rows** left behind; rejects a second company for a user who already has one, with **zero orphaned rows**; and a genuine two-independent-connection concurrency race (not sequential calls) where exactly one of two simultaneous submissions wins and the loser leaves no orphaned company.

### F1/F2 fix verification (re-run after the migration edits above)

| Check | Result |
|---|---|
| Hard `DELETE` on a customer's own company's row is blocked | **Pass** — new test: affects zero rows (no DELETE policy exists at all now). |
| Soft-deleting a customer (`UPDATE ... SET deleted_at = now()`) works | **Pass** — new test: succeeds via the existing UPDATE policy, `deleted_at` is set. |
| Deleting a user with `audit_log` history no longer fails | **Pass** — new test: deletes a user referenced by an `audit_log.actor_user_id`, confirms the delete succeeds and the surviving audit_log row's `actor_user_id` is `null`. |
| Full suite still green after the fix | **Pass** — 16 tenant-isolation + company-onboarding integration tests (was 13; +3 new), 68 unit tests, build, typecheck, lint, format, audit:report all pass against the edited migrations. |

## 3. Findings summary

| ID | Severity | Finding | Status |
|---|---|---|---|
| F1 | Medium | No soft-delete on `customers`; RLS permitted hard `DELETE` directly | **Fixed** — `deleted_at` column added, DELETE policy removed entirely |
| F2 | Low | `audit_log.actor_user_id` had no `ON DELETE` behavior — blocked deleting a user with audit history | **Fixed** — `ON DELETE SET NULL` |
| F3 | Informational | `companies` has no insert/update/delete RLS policy for any ordinary role — by design, all mutation goes through the `SECURITY DEFINER` onboarding function or a service-role connection | No action needed; documenting intentional behavior |
| F4 | Low (docs only) | Migration 1's comment claimed company creation goes through a service-role path; migration 3 actually grants it to `authenticated` directly | **Fixed** — comment corrected to point at `create_company_and_assign_owner` |

F1, F2, and F4 are now fixed directly in the migration files (not yet applied to any real project, so editing in place rather than adding a follow-up migration was safe). F3 remains intentional, documented behavior — no action needed. Nothing here blocks applying this migration set to the currently-empty `Hurkl-production` project.

## 4. Production migration plan (not yet executed)

### Pre-flight

- Target: `Hurkl-production` (ref `atwaixmsvzehheotdymf`), currently confirmed empty (`list_tables` → `[]`, `list_migrations` → `[]`).
- Exact files and hashes to apply, in order — see §2 above (`00000000000001` → `00000000000002` → `00000000000003`).
- Apply via `mcp__Supabase__apply_migration` (one call per file, named after the migration) or `npx supabase db push` from a linked local checkout — either applies the same SQL.

### Backup / recovery plan

- The project currently holds **no data**, so there is nothing to lose from applying schema — the "backup" that matters here is the ability to undo the schema itself, not data recovery.
- Before applying: no snapshot needed given the project is empty, but confirm via `list_tables`/`list_migrations` immediately beforehand that it's still empty (someone else could have changed it since this review).
- Recovery if something goes wrong mid-apply: since there are no down-migrations, recovery is a hand-written reverse-order `DROP`:
  1. `drop function if exists public.create_company_and_assign_owner(text, text, text, text, text, text);`
  2. `drop policy` statements for `audit_log`/`customers`, then `drop table if exists public.audit_log, public.customers;`
  3. `drop policy` statements for `profiles`/`companies`, then `drop function if exists public.current_company_id(), public.current_role(), public.is_hurkl_admin(); drop table if exists public.profiles, public.companies; drop type if exists public.user_role;`
- Once real tenant data exists (post-pilot-onboarding), add point-in-time recovery / automated backups per `SECURITY.md` §10 before this recovery plan is relied on for anything but an empty-project mistake.

### Verification queries (run immediately after applying, before any real signup)

```sql
-- All four tables present with RLS enabled
select relname, relrowsecurity from pg_class
where relname in ('companies','profiles','customers','audit_log') and relnamespace = 'public'::regnamespace;

-- Policy count matches expectation (2 companies, 2 profiles, 3 customers, 2 audit_log = 9)
select tablename, count(*) from pg_policies where schemaname = 'public' group by tablename;

-- customers has no DELETE policy at all (F1 fix) — this must return zero rows
select * from pg_policies where schemaname = 'public' and tablename = 'customers' and cmd = 'DELETE';

-- Onboarding function exists and is EXECUTE-granted to authenticated only
select has_function_privilege('authenticated', 'public.create_company_and_assign_owner(text,text,text,text,text,text)', 'EXECUTE');
select has_function_privilege('anon', 'public.create_company_and_assign_owner(text,text,text,text,text,text)', 'EXECUTE');  -- must be false

-- get_advisors (security) should show nothing new beyond the pre-existing rls_auto_enable notice
```

Then run `mcp__Supabase__get_advisors` (`security`) again and confirm the only findings are the pre-existing `rls_auto_enable` ones already present before this migration set was applied.

### Expected resulting schema

Exactly the objects enumerated in §1: 4 tables (`companies`, `profiles`, `customers`, `audit_log`), 1 enum (`user_role`), 4 functions (`current_company_id`, `current_role`, `is_hurkl_admin`, `create_company_and_assign_owner`), 3 indexes, **9** RLS policies (down from 10 in the original review — `customers` now has 3, not 4, since F1 removed its DELETE policy), 1 extension (`pgcrypto`), 0 triggers introduced by these migrations. No data.

### What happens after schema is applied (explicitly out of scope for this step)

Retrieving `.env.local` values (`NEXT_PUBLIC_SUPABASE_URL`, publishable key) via `get_project_url`/`get_publishable_keys`, and executing the manual end-to-end checklist in `docs/development.md` §"Manual end-to-end verification" — both deferred until the founder authorizes actually applying this plan.

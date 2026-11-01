# DEFERRD database (Supabase) — test project only, no real data

New, separate database design for DEFERRD, replacing the Base44 data tables.
See `docs/deferrd/MOVE_PLAN.md`. Applied Nov 1, 2026 to a NEW, empty, free-plan Supabase project named `deferrd` (separate from HURKL). It holds no real data. Migration 0001 is applied together with 0002.
Do not run it against HURKL's database.

- `migrations/0001_deferrd_core.sql` — tables, access rules (row-level security), guards.
- `migrations/0002_revoke_anon_helpers.sql` — anonymous callers cannot run the helper functions.
- `tests/rls.test.mjs` — security tests. Run: `npm install && npm test`.

The tests run the migration in an in-memory Postgres (PGlite) with a small stand-in for
Supabase logins, so they prove the rules in the SQL, not Supabase itself. Re-run them on
a real (private) Supabase project before any real data goes in.

Key rules enforced: customers see only their own requests; they cannot set status beyond
Draft, prices, payment or refund fields; companies see only their own contacts, campaigns
and recipients; campaigns, charges, gift-card status and Stripe records are written only by
server code; the revenue settings, ledger and alerts are admin-only; card tokens are 48
random hex characters.

Known to-do for the server functions (not the database): the checkout function must
recompute shipping and tax itself, because customers may still enter those two input
fields on a Draft.

## Verified on the real project (Nov 1, 2026)

16 spot checks run inside a transaction that was rolled back (no leftover rows): customers see only their own requests and cannot set totals, paid status or role; company members see only their own contacts and campaigns, can add a contact without a name, cannot write campaigns directly; anonymous callers are blocked. The full 50-check suite has not been run against the real project (it uses the in-memory stand-in).

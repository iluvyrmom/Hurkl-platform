# DEFERRD database (Supabase) — NOT DEPLOYED

New, separate database design for DEFERRD, replacing the Base44 data tables.
See `docs/deferrd/MOVE_PLAN.md`. **Nothing here has been applied to any real Supabase project.**
Do not run it against HURKL's database.

- `migrations/0001_deferrd_core.sql` — tables, access rules (row-level security), guards.
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

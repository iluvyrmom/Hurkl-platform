/**
 * Proves SECURITY.md §1's requirement in code: "user from Company A
 * cannot read/write Company B's rows even via a crafted request." This
 * runs real SQL against a real (local, disposable) Postgres database
 * with the exact migrations in supabase/migrations/ applied — the same
 * RLS policies a real Supabase project would enforce.
 *
 * Requires a reachable Postgres instance. See package.json's
 * "test:integration" script and .github/workflows/ci.yml for how CI
 * provides one. Not part of the default `npm test` run — see
 * vitest.config.mts.
 */
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyTestSchema } from "./test-support/apply-schema";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/hurkl_test";

const COMPANY_A = "00000000-0000-0000-0000-00000000000a";
const COMPANY_B = "00000000-0000-0000-0000-00000000000b";
const USER_A = "00000000-0000-0000-0000-0000000000a1";
const USER_B = "00000000-0000-0000-0000-0000000000b1";
const HURKL_ADMIN = "00000000-0000-0000-0000-0000000000ad";
const CUSTOMER_A = "00000000-0000-0000-0000-00000000c0a1";
const CUSTOMER_B = "00000000-0000-0000-0000-00000000c0b1";

let client: Client;

async function asUser<T>(userId: string | null, fn: (c: Client) => Promise<T>): Promise<T> {
  await client.query("begin");
  await client.query("set local role authenticated");
  if (userId) {
    await client.query("select set_config('app.test_current_user_id', $1, true)", [userId]);
  }
  try {
    return await fn(client);
  } finally {
    await client.query("rollback");
  }
}

beforeAll(async () => {
  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  await applyTestSchema(client);

  await client.query(
    "insert into public.companies (id, name) values ($1, 'Company A'), ($2, 'Company B')",
    [COMPANY_A, COMPANY_B],
  );
  await client.query("insert into auth.users (id) values ($1), ($2), ($3)", [
    USER_A,
    USER_B,
    HURKL_ADMIN,
  ]);
  await client.query(
    "insert into public.profiles (id, company_id, role) values ($1, $2, 'owner'), ($3, $4, 'owner'), ($5, null, 'hurkl_admin')",
    [USER_A, COMPANY_A, USER_B, COMPANY_B, HURKL_ADMIN],
  );
  await client.query(
    "insert into public.customers (id, company_id, name) values ($1, $2, 'A''s customer'), ($3, $4, 'B''s customer')",
    [CUSTOMER_A, COMPANY_A, CUSTOMER_B, COMPANY_B],
  );
});

afterAll(async () => {
  await client.end();
});

describe("tenant isolation (RLS)", () => {
  it("a company's user sees only their own company's customers", async () => {
    const result = await asUser(USER_A, (c) =>
      c.query("select id, company_id from public.customers"),
    );
    expect(result.rows).toEqual([{ id: CUSTOMER_A, company_id: COMPANY_A }]);
  });

  it("a crafted cross-tenant UPDATE affects zero rows", async () => {
    const result = await asUser(USER_A, (c) =>
      c.query("update public.customers set name = 'HACKED' where id = $1", [CUSTOMER_B]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("a crafted cross-tenant DELETE affects zero rows", async () => {
    const result = await asUser(USER_A, (c) =>
      c.query("delete from public.customers where id = $1", [CUSTOMER_B]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("a crafted INSERT forging another company's id is rejected by the database itself", async () => {
    await expect(
      asUser(USER_A, (c) =>
        c.query("insert into public.customers (company_id, name) values ($1, 'forged row')", [
          COMPANY_B,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("a company's user can read/write their own company's rows normally", async () => {
    const insert = await asUser(USER_A, (c) =>
      c.query(
        "insert into public.customers (company_id, name) values ($1, 'new customer') returning id",
        [COMPANY_A],
      ),
    );
    expect(insert.rowCount).toBe(1);
  });

  it("a HURKL admin can read across tenants (the one documented exception)", async () => {
    const result = await asUser(HURKL_ADMIN, (c) =>
      c.query("select company_id from public.customers order by company_id"),
    );
    expect(result.rows.map((r) => r.company_id)).toEqual([COMPANY_A, COMPANY_B]);
  });

  it("an unauthenticated connection (no current user set) sees no rows anywhere", async () => {
    const result = await asUser(null, (c) => c.query("select * from public.customers"));
    expect(result.rows).toEqual([]);
  });

  it("the audit log is append-only: no UPDATE or DELETE policy exists, so both affect zero rows", async () => {
    await asUser(USER_A, (c) =>
      c.query(
        "insert into public.audit_log (company_id, action, autonomy_tier) values ($1, 'test_action', 'tier_1_automatic')",
        [COMPANY_A],
      ),
    );

    const update = await asUser(USER_A, (c) =>
      c.query("update public.audit_log set action = 'tampered' where company_id = $1", [COMPANY_A]),
    );
    expect(update.rowCount).toBe(0);

    const del = await asUser(USER_A, (c) =>
      c.query("delete from public.audit_log where company_id = $1", [COMPANY_A]),
    );
    expect(del.rowCount).toBe(0);
  });
});

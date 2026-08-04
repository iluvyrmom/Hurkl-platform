/**
 * Proves supabase/migrations/00000000000005_company_account_types.sql's
 * security model against a real, local, disposable Postgres: only a
 * hurkl_admin can change a company's account_type (enforced INSIDE the
 * database, not just by the app), an ordinary company owner cannot do
 * it via the function OR a raw UPDATE, the CHECK constraint rejects
 * invalid values, and the internal HURKL company is seeded correctly.
 */
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyTestSchema } from "./test-support/apply-schema";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/hurkl_test";

const HURKL_INTERNAL_COMPANY_ID = "00000000-0000-0000-0000-000000000001";
const COMPANY_A = "00000000-0000-0000-0000-00000000000a";
const USER_A = "00000000-0000-0000-0000-0000000000a1";
const HURKL_ADMIN = "00000000-0000-0000-0000-0000000000ad";

let client: Client;

async function asUser<T>(userId: string | null, fn: (c: Client) => Promise<T>): Promise<T> {
  await client.query("begin");
  await client.query("set local role authenticated");
  if (userId) {
    await client.query("select set_config('app.test_current_user_id', $1, true)", [userId]);
  }
  try {
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

beforeAll(async () => {
  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  await applyTestSchema(client);

  await client.query("insert into public.companies (id, name) values ($1, 'Company A')", [
    COMPANY_A,
  ]);
  await client.query("insert into auth.users (id) values ($1), ($2)", [USER_A, HURKL_ADMIN]);
  await client.query(
    "insert into public.profiles (id, company_id, role) values ($1, $2, 'owner'), ($3, $4, 'hurkl_admin')",
    [USER_A, COMPANY_A, HURKL_ADMIN, HURKL_INTERNAL_COMPANY_ID],
  );
});

afterAll(async () => {
  await client.end();
});

describe("company account types", () => {
  it("the internal HURKL company is seeded with account_type = internal_hurkl", async () => {
    const result = await client.query("select account_type from public.companies where id = $1", [
      HURKL_INTERNAL_COMPANY_ID,
    ]);
    expect(result.rows).toEqual([{ account_type: "internal_hurkl" }]);
  });

  it("a newly created company defaults to production_customer", async () => {
    const result = await client.query(
      "insert into public.companies (name) values ('New Co') returning account_type",
    );
    expect(result.rows).toEqual([{ account_type: "production_customer" }]);
  });

  it("a hurkl_admin can change a company's account_type via the function, and it's audit-logged", async () => {
    await asUser(HURKL_ADMIN, (c) =>
      c.query("select public.set_company_account_type($1, $2)", [COMPANY_A, "demo"]),
    );

    const company = await client.query("select account_type from public.companies where id = $1", [
      COMPANY_A,
    ]);
    expect(company.rows).toEqual([{ account_type: "demo" }]);

    const audit = await client.query(
      "select action, autonomy_tier, metadata from public.audit_log where company_id = $1 and action = 'company_account_type_changed'",
      [COMPANY_A],
    );
    expect(audit.rows).toEqual([
      {
        action: "company_account_type_changed",
        autonomy_tier: "tier_1_automatic",
        metadata: { from: "production_customer", to: "demo" },
      },
    ]);
  });

  it("an ordinary company owner cannot change their own account_type via the function", async () => {
    await expect(
      asUser(USER_A, (c) =>
        c.query("select public.set_company_account_type($1, $2)", [COMPANY_A, "internal_hurkl"]),
      ),
    ).rejects.toThrow(/only a hurkl admin/i);

    const company = await client.query("select account_type from public.companies where id = $1", [
      COMPANY_A,
    ]);
    // Unchanged from the previous test's result — the rejected call had no effect.
    expect(company.rows).toEqual([{ account_type: "demo" }]);
  });

  it("an ordinary company owner cannot change account_type via a raw UPDATE either", async () => {
    const result = await asUser(USER_A, (c) =>
      c.query("update public.companies set account_type = 'internal_hurkl' where id = $1", [
        COMPANY_A,
      ]),
    );
    // companies has no UPDATE policy for any ordinary role at all — RLS
    // default-denies, affecting zero rows, same as every other
    // ordinary-role mutation attempt against this table.
    expect(result.rowCount).toBe(0);
  });

  it("the CHECK constraint rejects an invalid account_type even from a hurkl_admin", async () => {
    await expect(
      asUser(HURKL_ADMIN, (c) =>
        c.query("select public.set_company_account_type($1, $2)", [COMPANY_A, "not_a_real_type"]),
      ),
    ).rejects.toThrow(/violates check constraint/i);
  });
});

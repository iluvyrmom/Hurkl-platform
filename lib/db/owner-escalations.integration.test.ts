/**
 * Proves the discount-authority/owner-escalation schema
 * (supabase/migrations/00000000000009_mason_discount_authority_and_escalations.sql)
 * does what its comments claim: the discretionary-discount ceiling is
 * additive/defaulted-to-zero and hard-capped at 5% by a real CHECK
 * constraint, A-1 is really seeded at 5%, and owner_escalations has no
 * INSERT policy for any role (only this platform's own service-role
 * pipeline ever writes one) while staff can read/update their own
 * company's rows and hurkl_admin can read across tenants. Same
 * pattern as lib/db/leads.integration.test.ts — real SQL against a
 * real, local, disposable Postgres.
 */
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyTestSchema } from "./test-support/apply-schema";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/hurkl_test";

const A1_SLUG = "a1-best-moving";
const COMPANY_A = "00000000-0000-0000-0000-0000000000ca";
const COMPANY_B = "00000000-0000-0000-0000-0000000000cb";
const USER_A = "00000000-0000-0000-0000-0000000000aa";
const USER_B = "00000000-0000-0000-0000-0000000000bb";
const HURKL_ADMIN = "00000000-0000-0000-0000-0000000000ad";

let client: Client;

async function asRole<T>(
  role: "anon" | "authenticated",
  userId: string | null,
  fn: (c: Client) => Promise<T>,
): Promise<T> {
  await client.query("begin");
  await client.query(`set local role ${role}`);
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

  await client.query(
    "insert into public.companies (id, name, website_slug) values ($1, 'Company A', 'company-a-owner-esc'), ($2, 'Company B', 'company-b-owner-esc')",
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
});

afterAll(async () => {
  await client.end();
});

describe("discretionary_discount_max_percent", () => {
  it("defaults to zero for a company that hasn't configured one", async () => {
    const result = await client.query(
      "select discretionary_discount_max_percent from public.companies where id = $1",
      [COMPANY_A],
    );
    expect(Number(result.rows[0].discretionary_discount_max_percent)).toBe(0);
  });

  it("A-1 Best Moving is seeded at the founder-approved 5% ceiling", async () => {
    const result = await client.query(
      "select discretionary_discount_max_percent from public.companies where website_slug = $1",
      [A1_SLUG],
    );
    expect(Number(result.rows[0].discretionary_discount_max_percent)).toBe(5);
  });

  it("a real CHECK constraint rejects a value above the 5% hard ceiling", async () => {
    await expect(
      client.query(
        "update public.companies set discretionary_discount_max_percent = 6 where id = $1",
        [COMPANY_A],
      ),
    ).rejects.toThrow(/check constraint/i);
  });

  it("a real CHECK constraint rejects a negative value", async () => {
    await expect(
      client.query(
        "update public.companies set discretionary_discount_max_percent = -1 where id = $1",
        [COMPANY_A],
      ),
    ).rejects.toThrow(/check constraint/i);
  });
});

describe("owner_escalations", () => {
  it("no role can directly INSERT — only the trusted server-side pipeline writes these, via the service role", async () => {
    // anon has no table-level INSERT grant at all — fails at the
    // privilege-grant layer, before RLS even evaluates. Same pattern
    // as leads.integration.test.ts.
    await expect(
      asRole("anon", null, (c) =>
        c.query(
          "insert into public.owner_escalations (company_id, reason, customer_summary) values ($1, 'owner_review_requested', 'x')",
          [COMPANY_A],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);

    // authenticated has table-level INSERT (migration 6's default
    // privileges), so this reaches RLS — and is blocked there, since
    // owner_escalations has no INSERT policy for any role.
    await expect(
      asRole("authenticated", USER_A, (c) =>
        c.query(
          "insert into public.owner_escalations (company_id, reason, customer_summary) values ($1, 'owner_review_requested', 'x')",
          [COMPANY_A],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("a company's own staff cannot see another company's escalation, but hurkl_admin can", async () => {
    const escalationId = (
      await client.query(
        "insert into public.owner_escalations (company_id, reason, customer_summary) values ($1, 'owner_review_requested', 'Customer reported damage') returning id",
        [COMPANY_A],
      )
    ).rows[0].id as string;

    const crossRead = await asRole("authenticated", USER_B, (c) =>
      c.query("select id from public.owner_escalations where id = $1", [escalationId]),
    );
    expect(crossRead.rows).toEqual([]);

    const ownRead = await asRole("authenticated", USER_A, (c) =>
      c.query("select id from public.owner_escalations where id = $1", [escalationId]),
    );
    expect(ownRead.rows).toHaveLength(1);

    const adminRead = await asRole("authenticated", HURKL_ADMIN, (c) =>
      c.query("select id from public.owner_escalations where id = $1", [escalationId]),
    );
    expect(adminRead.rows).toHaveLength(1);
  });

  it("staff can update their own company's escalation status, but there is no DELETE policy", async () => {
    const escalationId = (
      await client.query(
        "insert into public.owner_escalations (company_id, reason, customer_summary) values ($1, 'customer_requested_owner_contact', 'y') returning id",
        [COMPANY_A],
      )
    ).rows[0].id as string;

    const update = await asRole("authenticated", USER_A, (c) =>
      c.query("update public.owner_escalations set status = 'resolved' where id = $1", [
        escalationId,
      ]),
    );
    expect(update.rowCount).toBe(1);

    const del = await asRole("authenticated", USER_A, (c) =>
      c.query("delete from public.owner_escalations where id = $1", [escalationId]),
    );
    expect(del.rowCount).toBe(0);
  });
});

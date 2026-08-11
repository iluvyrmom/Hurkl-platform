/**
 * Proves the leads/company-profile schema
 * (supabase/migrations/00000000000008_leads_and_company_profile.sql)
 * does what its comments claim: A-1 is really seeded, an anonymous
 * caller can submit a lead and read a public company profile ONLY
 * through the two SECURITY DEFINER functions (never a bare table
 * read/write), tenant isolation holds for the resulting rows, and
 * `leads` has no DELETE policy. Same pattern as
 * lib/db/communications.integration.test.ts — real SQL against a
 * real, local, disposable Postgres.
 */
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyTestSchema } from "./test-support/apply-schema";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/hurkl_test";

const A1_COMPANY_ID = "10000000-0000-0000-0000-000000000001";
const A1_SLUG = "a1-best-moving";
const COMPANY_A = "00000000-0000-0000-0000-0000000000ca";
const USER_A = "00000000-0000-0000-0000-0000000000aa";
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
    "insert into public.companies (id, name, website_slug) values ($1, 'Company A', 'company-a-test')",
    [COMPANY_A],
  );
  await client.query("insert into auth.users (id) values ($1), ($2)", [USER_A, HURKL_ADMIN]);
  await client.query(
    "insert into public.profiles (id, company_id, role) values ($1, $2, 'owner'), ($3, null, 'hurkl_admin')",
    [USER_A, COMPANY_A, HURKL_ADMIN],
  );
});

afterAll(async () => {
  await client.end();
});

describe("leads and company-profile schema", () => {
  it("A-1 Best Moving is seeded by the migration, with real public profile fields", async () => {
    const result = await client.query(
      "select name, phone, email, slogan from public.companies where website_slug = $1",
      [A1_SLUG],
    );
    expect(result.rows).toEqual([
      {
        name: "A-1 Best Moving LLC",
        phone: "971-777-6660",
        email: "A1BESTMOVING@gmail.com",
        slogan: "The best move you'll make.",
      },
    ]);
  });

  it("anon can look up a company's public profile by slug via get_company_public_profile", async () => {
    const result = await asRole("anon", null, (c) =>
      c.query("select * from public.get_company_public_profile($1)", [A1_SLUG]),
    );
    expect(result.rows).toEqual([
      {
        name: "A-1 Best Moving LLC",
        phone: "971-777-6660",
        email: "A1BESTMOVING@gmail.com",
        slogan: "The best move you'll make.",
      },
    ]);
  });

  it("anon can submit a lead for a real company via submit_lead()", async () => {
    const result = await asRole("anon", null, (c) =>
      c.query("select public.submit_lead($1, $2, $3) as id", [
        A1_SLUG,
        "Jane Prospect",
        "555-123-4567",
      ]),
    );
    expect(result.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("submit_lead rejects an unknown company slug", async () => {
    await expect(
      asRole("anon", null, (c) =>
        c.query("select public.submit_lead($1, $2, $3)", ["no-such-company", "Jane", "555-0000"]),
      ),
    ).rejects.toThrow(/unknown company/i);
  });

  it("submit_lead requires a name", async () => {
    await expect(
      asRole("anon", null, (c) => c.query("select public.submit_lead($1, $2)", [A1_SLUG, ""])),
    ).rejects.toThrow(/name is required/i);
  });

  it("submit_lead requires a phone or email", async () => {
    await expect(
      asRole("anon", null, (c) =>
        c.query("select public.submit_lead($1, $2)", [A1_SLUG, "No Contact"]),
      ),
    ).rejects.toThrow(/phone or email is required/i);
  });

  it("no role can directly INSERT into leads — every insert must go through submit_lead()", async () => {
    // anon has no table-level INSERT grant at all (migration 6 grants
    // it only SELECT) — this fails at the privilege-grant layer,
    // before RLS even evaluates.
    await expect(
      asRole("anon", null, (c) =>
        c.query("insert into public.leads (company_id, name, phone) values ($1, 'x', '555')", [
          A1_COMPANY_ID,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);

    // authenticated DOES have table-level INSERT (migration 6), so this
    // reaches RLS — and is blocked there, since leads has no INSERT
    // policy for any role.
    await expect(
      asRole("authenticated", USER_A, (c) =>
        c.query("insert into public.leads (company_id, name, phone) values ($1, 'x', '555')", [
          COMPANY_A,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("anon cannot SELECT leads directly — RLS blocks every row regardless of the table-level grant", async () => {
    const result = await asRole("anon", null, (c) => c.query("select * from public.leads"));
    expect(result.rows).toEqual([]);
  });

  it("a company's own staff cannot see another company's lead, but hurkl_admin can (the one documented cross-tenant exception)", async () => {
    const leadId = (
      await asRole("anon", null, (c) =>
        c.query("select public.submit_lead($1, $2, $3) as id", [
          A1_SLUG,
          "Cross-Tenant Test",
          "555-999-0000",
        ]),
      )
    ).rows[0].id as string;

    const crossRead = await asRole("authenticated", USER_A, (c) =>
      c.query("select id from public.leads where id = $1", [leadId]),
    );
    expect(crossRead.rows).toEqual([]);

    const adminRead = await asRole("authenticated", HURKL_ADMIN, (c) =>
      c.query("select id from public.leads where id = $1", [leadId]),
    );
    expect(adminRead.rows).toHaveLength(1);
  });

  it("staff can update their own company's lead status, but there is no DELETE policy", async () => {
    const leadId = (
      await client.query(
        "insert into public.leads (company_id, name, phone) values ($1, 'Update Test', '555-1') returning id",
        [COMPANY_A],
      )
    ).rows[0].id as string;

    const update = await asRole("authenticated", USER_A, (c) =>
      c.query("update public.leads set status = 'contacted' where id = $1", [leadId]),
    );
    expect(update.rowCount).toBe(1);

    const del = await asRole("authenticated", USER_A, (c) =>
      c.query("delete from public.leads where id = $1", [leadId]),
    );
    expect(del.rowCount).toBe(0);
  });
});

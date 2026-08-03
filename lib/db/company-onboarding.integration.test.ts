/**
 * Proves create_company_and_assign_owner (supabase/migrations/00000000000003_company_onboarding.sql)
 * is atomic and safe against partial creation, against a real local
 * Postgres — same pattern as tenant-isolation.integration.test.ts.
 */
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyTestSchema } from "./test-support/apply-schema";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/hurkl_test";

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
    await client.query("commit");
  }
}

async function countCompanies(): Promise<number> {
  const result = await client.query("select count(*)::int as count from public.companies");
  return result.rows[0].count;
}

beforeAll(async () => {
  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

beforeEach(async () => {
  await applyTestSchema(client);
});

describe("create_company_and_assign_owner", () => {
  it("creates a company, attaches the caller's profile, assigns owner, and writes an audit entry", async () => {
    const userResult = await client.query("insert into auth.users default values returning id");
    const userId = userResult.rows[0].id as string;

    const companyId = await asUser(userId, async (c) => {
      const result = await c.query(
        "select public.create_company_and_assign_owner($1, $2, $3, $4, $5, $6) as company_id",
        [
          "A-1 Best Moving LLC",
          "Jane Owner",
          "555-000-0000",
          "owner@a1movers.test",
          "moving",
          "America/Los_Angeles",
        ],
      );
      return result.rows[0].company_id as string;
    });

    expect(companyId).toBeTruthy();

    const profile = await client.query(
      "select company_id, role, full_name from public.profiles where id = $1",
      [userId],
    );
    expect(profile.rows[0]).toEqual({
      company_id: companyId,
      role: "owner",
      full_name: "Jane Owner",
    });

    const auditEntry = await client.query(
      "select action, autonomy_tier, subject_type, subject_id, actor_user_id from public.audit_log where company_id = $1",
      [companyId],
    );
    expect(auditEntry.rows).toEqual([
      {
        action: "company_created_owner_assigned",
        autonomy_tier: "tier_1_automatic",
        subject_type: "company",
        subject_id: companyId,
        actor_user_id: userId,
      },
    ]);
  });

  it("rejects an unauthenticated call", async () => {
    await expect(
      asUser(null, (c) =>
        c.query("select public.create_company_and_assign_owner($1, $2)", ["Acme", "Owner"]),
      ),
    ).rejects.toThrow(/must be authenticated/i);
  });

  it("rejects an empty company name without leaving an orphaned company row", async () => {
    const userResult = await client.query("insert into auth.users default values returning id");
    const userId = userResult.rows[0].id as string;
    const before = await countCompanies();

    await expect(
      asUser(userId, (c) =>
        c.query("select public.create_company_and_assign_owner($1, $2)", ["   ", "Owner"]),
      ),
    ).rejects.toThrow(/company name is required/i);

    expect(await countCompanies()).toBe(before);
  });

  it("prevents a user who already has a company from creating a second one, and leaves no orphaned company behind", async () => {
    const userResult = await client.query("insert into auth.users default values returning id");
    const userId = userResult.rows[0].id as string;

    const firstCompanyId = await asUser(userId, async (c) => {
      const result = await c.query("select public.create_company_and_assign_owner($1, $2) as id", [
        "First Co",
        "Owner",
      ]);
      return result.rows[0].id as string;
    });

    const before = await countCompanies();

    await expect(
      asUser(userId, (c) =>
        c.query("select public.create_company_and_assign_owner($1, $2)", ["Second Co", "Owner"]),
      ),
    ).rejects.toThrow(/already belongs to a company/i);

    // No orphaned second company was left behind by the rejected call.
    expect(await countCompanies()).toBe(before);

    // The user's profile still points at their original company.
    const profile = await client.query("select company_id from public.profiles where id = $1", [
      userId,
    ]);
    expect(profile.rows[0].company_id).toBe(firstCompanyId);
  });

  it("prevents duplicate owner/company creation from two concurrent submissions by the same user", async () => {
    const userResult = await client.query("insert into auth.users default values returning id");
    const userId = userResult.rows[0].id as string;

    // A second, independent connection simulates a genuinely concurrent
    // request (e.g. a double-clicked submit button), rather than two
    // sequential calls on the same connection.
    const secondClient = new Client({ connectionString: DATABASE_URL });
    await secondClient.connect();

    async function callAsUser(c: Client, name: string) {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query("select set_config('app.test_current_user_id', $1, true)", [userId]);
      try {
        const result = await c.query(
          "select public.create_company_and_assign_owner($1, $2) as id",
          [name, "Owner"],
        );
        await c.query("commit");
        return { ok: true as const, id: result.rows[0].id as string };
      } catch (error) {
        await c.query("rollback");
        return { ok: false as const, error };
      }
    }

    const [first, second] = await Promise.all([
      callAsUser(client, "Race Co A"),
      callAsUser(secondClient, "Race Co B"),
    ]);
    await secondClient.end();

    const results = [first, second];
    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    // Exactly one of the two concurrent submissions wins; the other is
    // rejected, and no orphaned company is left behind by the loser.
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(await countCompanies()).toBe(1);
  });
});

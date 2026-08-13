import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Client } from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "..", "..", "..", "supabase", "migrations");

const MIGRATION_FILES = [
  "00000000000001_tenant_foundation.sql",
  "00000000000002_customers_and_audit_log.sql",
  "00000000000003_company_onboarding.sql",
  "00000000000004_communications.sql",
  "00000000000005_company_account_types.sql",
  "00000000000006_grant_table_privileges.sql",
  "00000000000007_mason_reasoning.sql",
  "00000000000008_leads_and_company_profile.sql",
  "00000000000009_mason_discount_authority_and_escalations.sql",
];

/**
 * Resets a local test database to a clean slate and applies the local
 * auth stub, the `authenticated` role, the real migrations (unmodified
 * — the same files a real Supabase project would run), and finally
 * that role's table/function privileges. Test-only: never used against
 * a real Supabase project.
 *
 * Order matters: the role must exist BEFORE the migrations run (one of
 * them grants EXECUTE on a function to it), but its blanket table/
 * function privileges can only be granted AFTER the migrations create
 * those tables/functions — see local-role-create.sql and
 * local-role-grants.sql's comments.
 */
export async function applyTestSchema(client: Client): Promise<void> {
  await client.query("drop schema if exists public cascade;");
  await client.query("drop schema if exists auth cascade;");
  await client.query("create schema public;");

  const authStub = readFileSync(path.join(here, "auth-stub.sql"), "utf8");
  await client.query(authStub);

  const roleCreate = readFileSync(path.join(here, "local-role-create.sql"), "utf8");
  await client.query(roleCreate);

  for (const file of MIGRATION_FILES) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    await client.query(sql);
  }

  const roleGrants = readFileSync(path.join(here, "local-role-grants.sql"), "utf8");
  await client.query(roleGrants);
}

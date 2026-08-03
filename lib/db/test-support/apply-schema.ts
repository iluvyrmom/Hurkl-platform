import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Client } from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "..", "..", "..", "supabase", "migrations");

const MIGRATION_FILES = [
  "00000000000001_tenant_foundation.sql",
  "00000000000002_customers_and_audit_log.sql",
];

/**
 * Resets a local test database to a clean slate and applies the local
 * auth stub, the real migrations (unmodified — the same files a real
 * Supabase project would run), and the local-only `authenticated` role
 * setup. Test-only: never used against a real Supabase project.
 */
export async function applyTestSchema(client: Client): Promise<void> {
  await client.query("drop schema if exists public cascade;");
  await client.query("drop schema if exists auth cascade;");
  await client.query("create schema public;");

  const authStub = readFileSync(path.join(here, "auth-stub.sql"), "utf8");
  await client.query(authStub);

  for (const file of MIGRATION_FILES) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    await client.query(sql);
  }

  const roles = readFileSync(path.join(here, "local-roles.sql"), "utf8");
  await client.query(roles);
}

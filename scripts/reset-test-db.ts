#!/usr/bin/env node
/**
 * `npm run db:test-reset` — resets the local integration-test Postgres
 * database to a clean slate (auth stub + real migrations + local role
 * setup), the same schema lib/db/tenant-isolation.integration.test.ts
 * applies in its own beforeAll. Useful for manually poking at the
 * schema with psql during development. Never touches a real Supabase
 * project — TEST_DATABASE_URL should always point at a local, disposable
 * database.
 */
import { Client } from "pg";
import { applyTestSchema } from "../lib/db/test-support/apply-schema.ts";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/hurkl_test";

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();
await applyTestSchema(client);
await client.end();

console.log(`Test schema applied to ${DATABASE_URL.replace(/:[^:@]+@/, ":***@")}`);

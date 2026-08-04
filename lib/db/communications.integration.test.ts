/**
 * Proves the communications schema (supabase/migrations/00000000000004_communications.sql)
 * enforces tenant isolation the same way customers/audit_log already do,
 * that telegram_links is genuinely admin-only (no ordinary-role access
 * at all), and that messages is structurally append-only. Same pattern
 * as lib/db/tenant-isolation.integration.test.ts — real SQL against a
 * real, local, disposable Postgres.
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

// Commits (not rolls back): unlike tenant-isolation.integration.test.ts's
// single-action-per-call tests, several tests here need data from one
// asUser() call to be visible in a later one (create a conversation as
// one user, read it back as another) — same reasoning as
// company-onboarding.integration.test.ts's asUser helper.
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
    "insert into public.profiles (id, company_id, role) values ($1, $2, 'owner'), ($3, null, 'hurkl_admin')",
    [USER_A, COMPANY_A, HURKL_ADMIN],
  );
});

afterAll(async () => {
  await client.end();
});

describe("communications schema", () => {
  it("the internal HURKL company is seeded by the migration", async () => {
    const result = await client.query("select name from public.companies where id = $1", [
      HURKL_INTERNAL_COMPANY_ID,
    ]);
    expect(result.rows).toEqual([{ name: "HURKL (Internal)" }]);
  });

  it("a hurkl_admin can create and read a conversation/message tagged with the internal company", async () => {
    const conversation = await asUser(HURKL_ADMIN, (c) =>
      c.query(
        "insert into public.conversations (company_id, channel, external_conversation_id) values ($1, 'telegram', 'chat-int-1') returning id",
        [HURKL_INTERNAL_COMPANY_ID],
      ),
    );
    expect(conversation.rowCount).toBe(1);
    const conversationId = conversation.rows[0].id as string;

    const message = await asUser(HURKL_ADMIN, (c) =>
      c.query(
        "insert into public.messages (conversation_id, company_id, direction, body) values ($1, $2, 'inbound', 'hi') returning id",
        [conversationId, HURKL_INTERNAL_COMPANY_ID],
      ),
    );
    expect(message.rowCount).toBe(1);

    const readBack = await asUser(HURKL_ADMIN, (c) =>
      c.query("select body from public.messages where conversation_id = $1", [conversationId]),
    );
    expect(readBack.rows).toEqual([{ body: "hi" }]);
  });

  it("an ordinary tenant user cannot see the internal HURKL company's conversations, and vice versa their own tenant conversation is invisible to a different tenant", async () => {
    const tenantConversation = await asUser(USER_A, (c) =>
      c.query(
        "insert into public.conversations (company_id, channel, external_conversation_id) values ($1, 'telegram', 'chat-tenant-1') returning id",
        [COMPANY_A],
      ),
    );
    const tenantConversationId = tenantConversation.rows[0].id as string;

    // Company A's own user can read their own conversation.
    const ownRead = await asUser(USER_A, (c) =>
      c.query("select id from public.conversations where id = $1", [tenantConversationId]),
    );
    expect(ownRead.rows).toHaveLength(1);

    // Company A's user cannot see the internal HURKL company's conversations.
    const crossRead = await asUser(USER_A, (c) =>
      c.query("select id from public.conversations where company_id = $1", [
        HURKL_INTERNAL_COMPANY_ID,
      ]),
    );
    expect(crossRead.rows).toEqual([]);

    // hurkl_admin, by contrast, can see Company A's conversation too —
    // the one documented cross-tenant exception, same as customers/audit_log.
    const adminRead = await asUser(HURKL_ADMIN, (c) =>
      c.query("select id from public.conversations where id = $1", [tenantConversationId]),
    );
    expect(adminRead.rows).toHaveLength(1);
  });

  it("telegram_links is inaccessible to the ordinary authenticated role — no select, no insert", async () => {
    const selectResult = await asUser(HURKL_ADMIN, (c) =>
      c.query("select * from public.telegram_links"),
    );
    expect(selectResult.rows).toEqual([]);

    await expect(
      asUser(HURKL_ADMIN, (c) =>
        c.query(
          "insert into public.telegram_links (profile_id, telegram_user_id) values ($1, $2)",
          [HURKL_ADMIN, 123456],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("messages has no UPDATE or DELETE policy — both affect zero rows, proving the transcript is append-only", async () => {
    const conversation = await asUser(HURKL_ADMIN, (c) =>
      c.query(
        "insert into public.conversations (company_id, channel, external_conversation_id) values ($1, 'telegram', 'chat-int-2') returning id",
        [HURKL_INTERNAL_COMPANY_ID],
      ),
    );
    const conversationId = conversation.rows[0].id as string;
    const message = await asUser(HURKL_ADMIN, (c) =>
      c.query(
        "insert into public.messages (conversation_id, company_id, direction, body) values ($1, $2, 'inbound', 'original') returning id",
        [conversationId, HURKL_INTERNAL_COMPANY_ID],
      ),
    );
    const messageId = message.rows[0].id as string;

    const update = await asUser(HURKL_ADMIN, (c) =>
      c.query("update public.messages set body = 'tampered' where id = $1", [messageId]),
    );
    expect(update.rowCount).toBe(0);

    const del = await asUser(HURKL_ADMIN, (c) =>
      c.query("delete from public.messages where id = $1", [messageId]),
    );
    expect(del.rowCount).toBe(0);
  });

  it("conversations DOES allow update (e.g. bumping last_message_at) by the owning company's user", async () => {
    const conversation = await asUser(USER_A, (c) =>
      c.query(
        "insert into public.conversations (company_id, channel, external_conversation_id) values ($1, 'telegram', 'chat-tenant-2') returning id, last_message_at",
        [COMPANY_A],
      ),
    );
    const conversationId = conversation.rows[0].id as string;

    const update = await asUser(USER_A, (c) =>
      c.query(
        "update public.conversations set last_message_at = now() where id = $1 returning last_message_at",
        [conversationId],
      ),
    );
    expect(update.rowCount).toBe(1);
  });
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { MockCommunicationAdapter } from "./adapter";
import { receiveMessage } from "./inbound";
import { HURKL_INTERNAL_COMPANY_ID } from "./internal-company";

interface FakeRow {
  [key: string]: unknown;
}

/**
 * A tiny in-memory fake standing in for the service-role admin client —
 * exercises the pipeline's actual sequencing (find-or-create,
 * insert-then-select) rather than mocking each call shape individually,
 * so tests like "a second message reuses the same conversation row"
 * are proven by real state, not by asserting call counts.
 */
function createFakeAdmin(seed: { telegramLinks?: FakeRow[]; profiles?: FakeRow[] } = {}) {
  const tables: Record<string, FakeRow[]> = {
    telegram_links: seed.telegramLinks ?? [],
    profiles: seed.profiles ?? [],
    conversations: [],
    messages: [],
    audit_log: [],
  };

  function matches(row: FakeRow, filters: [string, unknown][]) {
    return filters.every(([col, val]) => row[col] === val);
  }

  function from(table: string) {
    const rows = tables[table];

    return {
      select() {
        const filters: [string, unknown][] = [];
        const builder = {
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            return builder;
          },
          async maybeSingle() {
            const found = rows.find((r) => matches(r, filters));
            return { data: found ?? null, error: null };
          },
        };
        return builder;
      },
      insert(row: FakeRow) {
        const withId = { id: `${table}-${rows.length + 1}`, ...row };
        rows.push(withId);
        return {
          select() {
            return {
              async single() {
                return { data: withId, error: null };
              },
            };
          },
          then(resolve: (value: { data: null; error: null }) => void) {
            resolve({ data: null, error: null });
          },
        };
      },
      update(patch: FakeRow) {
        return {
          eq(col: string, val: unknown) {
            const row = rows.find((r) => r[col] === val);
            if (row) Object.assign(row, patch);
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    };
  }

  return { admin: { from } as unknown as SupabaseClient, tables };
}

const HURKL_ADMIN_PROFILE = { id: "profile-1", company_id: null, role: "hurkl_admin" };
const LINKED_TELEGRAM_ID = "555000111";

describe("receiveMessage", () => {
  it("authenticates the sender, persists history, audit-logs both legs, and replies once", async () => {
    const { admin, tables } = createFakeAdmin({
      telegramLinks: [{ profile_id: "profile-1", telegram_user_id: LINKED_TELEGRAM_ID }],
      profiles: [HURKL_ADMIN_PROFILE],
    });
    const adapter = new MockCommunicationAdapter("telegram");

    const result = await receiveMessage(
      { admin, adapter },
      {
        channel: "telegram",
        externalUserId: LINKED_TELEGRAM_ID,
        externalConversationId: "chat-1",
        text: "status check",
        receivedAt: new Date().toISOString(),
      },
    );

    expect(result.handled).toBe(true);

    expect(tables.conversations).toHaveLength(1);
    expect(tables.conversations[0]).toMatchObject({
      company_id: HURKL_INTERNAL_COMPANY_ID,
      channel: "telegram",
      external_conversation_id: "chat-1",
    });

    expect(tables.messages).toHaveLength(2);
    expect(tables.messages[0]).toMatchObject({ direction: "inbound", body: "status check" });
    expect(tables.messages[1]).toMatchObject({ direction: "outbound" });

    expect(tables.audit_log).toHaveLength(2);
    expect(tables.audit_log.map((row) => row.action)).toEqual(["message_received", "message_sent"]);

    expect(adapter.sentMessages).toHaveLength(1);
    expect(adapter.sentMessages[0].externalConversationId).toBe("chat-1");
  });

  it("drops a message from an unrecognized sender with no reply and no audit entry", async () => {
    const { admin, tables } = createFakeAdmin();
    const adapter = new MockCommunicationAdapter("telegram");

    const result = await receiveMessage(
      { admin, adapter },
      {
        channel: "telegram",
        externalUserId: "not-linked",
        externalConversationId: "chat-2",
        text: "hello?",
        receivedAt: new Date().toISOString(),
      },
    );

    expect(result.handled).toBe(false);
    expect(adapter.sentMessages).toHaveLength(0);
    expect(tables.messages).toHaveLength(0);
    expect(tables.audit_log).toHaveLength(0);
  });

  it("reuses the same conversation row for a second message in the same external conversation", async () => {
    const { admin, tables } = createFakeAdmin({
      telegramLinks: [{ profile_id: "profile-1", telegram_user_id: LINKED_TELEGRAM_ID }],
      profiles: [HURKL_ADMIN_PROFILE],
    });
    const adapter = new MockCommunicationAdapter("telegram");

    const inbound = {
      channel: "telegram" as const,
      externalUserId: LINKED_TELEGRAM_ID,
      externalConversationId: "chat-3",
      receivedAt: new Date().toISOString(),
    };

    await receiveMessage({ admin, adapter }, { ...inbound, text: "first" });
    await receiveMessage({ admin, adapter }, { ...inbound, text: "second" });

    expect(tables.conversations).toHaveLength(1);
    expect(tables.messages).toHaveLength(4);
  });
});

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
 * insert-then-select, history fetch, dedupe-on-insert) rather than
 * mocking each call shape individually, so tests like "a second message
 * reuses the same conversation row" are proven by real state, not by
 * asserting call counts.
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
        let limitCount: number | undefined;
        let descending = false;
        const builder = {
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            return builder;
          },
          order(_col: string, opts?: { ascending?: boolean }) {
            descending = opts?.ascending === false;
            return builder;
          },
          limit(n: number) {
            limitCount = n;
            return builder;
          },
          async maybeSingle() {
            const found = rows.find((r) => matches(r, filters));
            return { data: found ?? null, error: null };
          },
          // List-query terminal — used when the chain is awaited directly
          // (e.g. history fetch's .order().limit()) rather than via
          // .maybeSingle().
          then(resolve: (value: { data: FakeRow[]; error: null }) => void) {
            let result = rows.filter((r) => matches(r, filters));
            if (descending) result = result.slice().reverse();
            if (limitCount !== undefined) result = result.slice(0, limitCount);
            resolve({ data: result, error: null });
          },
        };
        return builder;
      },
      insert(row: FakeRow) {
        if (
          table === "messages" &&
          row.external_message_id != null &&
          rows.some(
            (r) =>
              r.conversation_id === row.conversation_id &&
              r.direction === row.direction &&
              r.external_message_id === row.external_message_id,
          )
        ) {
          const duplicateResult = {
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          };
          return {
            select() {
              return {
                async single() {
                  return duplicateResult;
                },
              };
            },
            then(resolve: (value: typeof duplicateResult) => void) {
              resolve(duplicateResult);
            },
          };
        }

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

  it("drops a redelivered message (same external message id) without a second AI call or reply", async () => {
    const { admin, tables } = createFakeAdmin({
      telegramLinks: [{ profile_id: "profile-1", telegram_user_id: LINKED_TELEGRAM_ID }],
      profiles: [HURKL_ADMIN_PROFILE],
    });
    const adapter = new MockCommunicationAdapter("telegram");

    const inbound = {
      channel: "telegram" as const,
      externalUserId: LINKED_TELEGRAM_ID,
      externalConversationId: "chat-4",
      externalMessageId: "telegram-msg-1",
      text: "hi",
      receivedAt: new Date().toISOString(),
    };

    const first = await receiveMessage({ admin, adapter }, inbound);
    const second = await receiveMessage({ admin, adapter }, inbound);

    expect(first.handled).toBe(true);
    expect(second.handled).toBe(false);
    expect(tables.messages).toHaveLength(2); // one inbound + one outbound, not four
    expect(adapter.sentMessages).toHaveLength(1);
    expect(tables.audit_log).toHaveLength(2); // no second message_received/message_sent pair
  });

  it("falls back to a safe reply and still responds when the AI model throws", async () => {
    const { admin, tables } = createFakeAdmin({
      telegramLinks: [{ profile_id: "profile-1", telegram_user_id: LINKED_TELEGRAM_ID }],
      profiles: [HURKL_ADMIN_PROFILE],
    });
    const adapter = new MockCommunicationAdapter("telegram");
    const failingAiModel = {
      complete: async () => {
        throw new Error("Anthropic request failed: 500");
      },
    };

    const result = await receiveMessage(
      { admin, adapter, aiModel: failingAiModel },
      {
        channel: "telegram",
        externalUserId: LINKED_TELEGRAM_ID,
        externalConversationId: "chat-5",
        text: "hi",
        receivedAt: new Date().toISOString(),
      },
    );

    expect(result.handled).toBe(true);
    expect(adapter.sentMessages).toHaveLength(1);
    expect(adapter.sentMessages[0].text).toMatch(/trouble responding/i);
    expect(tables.messages[1]).toMatchObject({ direction: "outbound" });
  });

  it("passes prior messages as history to the AI model on a later turn", async () => {
    const { admin } = createFakeAdmin({
      telegramLinks: [{ profile_id: "profile-1", telegram_user_id: LINKED_TELEGRAM_ID }],
      profiles: [HURKL_ADMIN_PROFILE],
    });
    const adapter = new MockCommunicationAdapter("telegram");
    const seenRequests: { history?: { role: string; text: string }[] }[] = [];
    const recordingAiModel = {
      complete: async (request: { history?: { role: string; text: string }[] }) => {
        seenRequests.push(request);
        return {
          text: "ok",
          tier: "low_cost" as const,
          modelId: "test",
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
          latencyMs: 0,
        };
      },
    };

    const inbound = {
      channel: "telegram" as const,
      externalUserId: LINKED_TELEGRAM_ID,
      externalConversationId: "chat-6",
      receivedAt: new Date().toISOString(),
    };

    await receiveMessage(
      { admin, adapter, aiModel: recordingAiModel },
      { ...inbound, text: "first" },
    );
    await receiveMessage(
      { admin, adapter, aiModel: recordingAiModel },
      { ...inbound, text: "second" },
    );

    expect(seenRequests[0].history).toEqual([]);
    expect(seenRequests[1].history).toEqual([
      { role: "user", text: "first" },
      { role: "assistant", text: "ok" },
    ]);
  });
});

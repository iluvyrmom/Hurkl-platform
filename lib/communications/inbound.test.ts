import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
function createFakeAdmin(
  seed: { telegramLinks?: FakeRow[]; profiles?: FakeRow[]; companies?: FakeRow[] } = {},
) {
  const tables: Record<string, FakeRow[]> = {
    telegram_links: seed.telegramLinks ?? [],
    profiles: seed.profiles ?? [],
    companies: seed.companies ?? [],
    conversations: [],
    messages: [],
    audit_log: [],
    leads: [],
  };

  function matches(row: FakeRow, filters: ["eq" | "gte", string, unknown][]) {
    return filters.every(([kind, col, val]) =>
      kind === "eq" ? row[col] === val : String(row[col] ?? "") >= String(val),
    );
  }

  function from(table: string) {
    const rows = tables[table];

    return {
      select() {
        const filters: ["eq" | "gte", string, unknown][] = [];
        let limitCount: number | undefined;
        let descending = false;
        const builder = {
          eq(col: string, val: unknown) {
            filters.push(["eq", col, val]);
            return builder;
          },
          gte(col: string, val: unknown) {
            filters.push(["gte", col, val]);
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

        const withId = {
          id: `${table}-${rows.length + 1}`,
          created_at: new Date().toISOString(),
          ...row,
        };
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

  // Minimal stand-in for submit_lead()'s RPC — real validation already
  // happened client-side in lib/leads/leads.ts#submitLead before this
  // is ever called, so this just records the lead and hands back an id.
  async function rpc(fn: string, args: Record<string, unknown>) {
    if (fn === "submit_lead") {
      const id = `lead-${tables.leads.length + 1}`;
      tables.leads.push({ id, ...args });
      return { data: id, error: null };
    }
    return { data: null, error: { message: `unhandled rpc in test fake: ${fn}` } };
  }

  return { admin: { from, rpc } as unknown as SupabaseClient, tables };
}

const HURKL_ADMIN_PROFILE = { id: "profile-1", company_id: null, role: "hurkl_admin" };
const LINKED_TELEGRAM_ID = "555000111";

describe("receiveMessage", () => {
  // Every call now checks the hard spend guard (lib/mason/spend-guard.ts),
  // which reads getServerEnv() — stub the one required var so tests that
  // aren't specifically about budget behavior don't have to know that.
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  describe("hard spend guard", () => {
    it("blocks the Anthropic call and returns the fallback once a spend ceiling is already met", async () => {
      vi.stubEnv("ANTHROPIC_COMPANY_DAILY_SPEND_CEILING_USD", "1");

      const { admin, tables } = createFakeAdmin({
        telegramLinks: [{ profile_id: "profile-1", telegram_user_id: LINKED_TELEGRAM_ID }],
        profiles: [HURKL_ADMIN_PROFILE],
      });
      // Already spent the full $1 company-daily ceiling today.
      tables.messages.push({
        id: "seed-1",
        conversation_id: "unrelated-conversation",
        company_id: HURKL_INTERNAL_COMPANY_ID,
        direction: "outbound",
        estimated_cost_usd: 1,
        created_at: new Date().toISOString(),
      });

      const adapter = new MockCommunicationAdapter("telegram");
      const seenRequests: unknown[] = [];
      const recordingAiModel = {
        complete: async (request: unknown) => {
          seenRequests.push(request);
          throw new Error("should never be called once the budget is exhausted");
        },
      };

      const result = await receiveMessage(
        { admin, adapter, aiModel: recordingAiModel },
        {
          channel: "telegram",
          externalUserId: LINKED_TELEGRAM_ID,
          externalConversationId: "chat-budget-1",
          text: "hi",
          receivedAt: new Date().toISOString(),
        },
      );

      expect(result.handled).toBe(true);
      expect(seenRequests).toHaveLength(0); // no Anthropic request attempted at all
      expect(adapter.sentMessages).toHaveLength(1);
      expect(adapter.sentMessages[0].text).toMatch(/trouble responding/i);

      const outbound = tables.messages.find(
        (row) => row.direction === "outbound" && row.conversation_id !== "unrelated-conversation",
      );
      expect(outbound).toMatchObject({ model_id: "budget_limit" });

      // Recorded as a budget refusal, distinct from a provider failure —
      // never counted as one.
      const auditActions = tables.audit_log.map((row) => row.action);
      expect(auditActions).toContain("message_budget_blocked");
    });

    it("downgrades an advanced_reasoning task to low_cost rather than blocking, when the projected cost would tip a ceiling", async () => {
      // Tiny ceiling with no prior spend: Gate A (already over budget)
      // passes, but Gate B (this specific call's projected cost) does
      // not — the call should be downgraded, not blocked.
      vi.stubEnv("ANTHROPIC_COMPANY_DAILY_SPEND_CEILING_USD", "0.0001");

      const { admin, tables } = createFakeAdmin({
        telegramLinks: [{ profile_id: "profile-1", telegram_user_id: LINKED_TELEGRAM_ID }],
        profiles: [HURKL_ADMIN_PROFILE],
      });

      const adapter = new MockCommunicationAdapter("telegram");
      const seenRequests: { tier: string }[] = [];
      const recordingAiModel = {
        complete: async (request: { tier: string }) => {
          seenRequests.push(request);
          return {
            text: "ok",
            tier: request.tier as "low_cost" | "advanced_reasoning",
            modelId: "test",
            inputTokens: 0,
            outputTokens: 0,
            estimatedCostUsd: 0,
            latencyMs: 0,
          };
        },
      };

      const result = await receiveMessage(
        { admin, adapter, aiModel: recordingAiModel },
        {
          channel: "telegram",
          externalUserId: LINKED_TELEGRAM_ID,
          externalConversationId: "chat-budget-2",
          // Contains a complexity signal word — routeModelTier would
          // normally pick advanced_reasoning for this.
          text: "what's your recommendation on pricing strategy?",
          receivedAt: new Date().toISOString(),
        },
      );

      expect(result.handled).toBe(true);
      expect(seenRequests).toHaveLength(1);
      expect(seenRequests[0].tier).toBe("low_cost"); // downgraded, not blocked

      const auditActions = tables.audit_log.map((row) => row.action);
      expect(auditActions).not.toContain("message_budget_blocked");
    });
  });

  describe("web_public channel (Mason's public chat)", () => {
    const A1_COMPANY = {
      id: "company-a1",
      name: "A-1 Best Moving LLC",
      known_facts: ["1 mover is $50/hour."],
    };

    it("resolves the company directly (no linked identity) and uses its real name and facts in the system prompt", async () => {
      const { admin, tables } = createFakeAdmin({ companies: [A1_COMPANY] });
      const adapter = new MockCommunicationAdapter("web_public");
      const seenRequests: { systemPrompt: string }[] = [];
      const recordingAiModel = {
        complete: async (request: { systemPrompt: string }) => {
          seenRequests.push(request);
          return {
            text: "Sure, happy to help!",
            tier: "low_cost" as const,
            modelId: "test",
            inputTokens: 0,
            outputTokens: 0,
            estimatedCostUsd: 0,
            latencyMs: 0,
          };
        },
      };

      const result = await receiveMessage(
        { admin, adapter, aiModel: recordingAiModel },
        {
          channel: "web_public",
          externalUserId: "session-1",
          externalConversationId: "session-1",
          text: "how much for 2 movers?",
          receivedAt: new Date().toISOString(),
          companyId: A1_COMPANY.id,
          companySlug: "a1-best-moving",
        },
      );

      expect(result.handled).toBe(true);
      expect(tables.conversations[0]).toMatchObject({ company_id: A1_COMPANY.id, channel: "web_public" });
      expect(seenRequests[0].systemPrompt).toContain("A-1 Best Moving LLC");
      expect(seenRequests[0].systemPrompt).toContain("1 mover is $50/hour.");
      expect(seenRequests[0].systemPrompt).toContain("LEAD_READY:");
      expect(seenRequests[0].systemPrompt).not.toContain("HURKL's own AI Office Manager");
    });

    it("extracts a LEAD_READY marker, submits a real lead, links it to the conversation, and hides the marker from the customer", async () => {
      const { admin, tables } = createFakeAdmin({ companies: [A1_COMPANY] });
      const adapter = new MockCommunicationAdapter("web_public");
      const aiModel = {
        complete: async () => ({
          text: 'Great, I have everything I need!\nLEAD_READY: {"name":"Jane Doe","phone":"555-1234"}',
          tier: "low_cost" as const,
          modelId: "test",
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
          latencyMs: 0,
        }),
      };

      const result = await receiveMessage(
        { admin, adapter, aiModel },
        {
          channel: "web_public",
          externalUserId: "session-2",
          externalConversationId: "session-2",
          text: "I'm Jane, 555-1234, moving next month",
          receivedAt: new Date().toISOString(),
          companyId: A1_COMPANY.id,
          companySlug: "a1-best-moving",
        },
      );

      expect(result.handled).toBe(true);
      expect(result.leadId).toBeDefined();
      expect(tables.leads).toHaveLength(1);
      expect(tables.leads[0]).toMatchObject({ p_company_slug: "a1-best-moving", p_name: "Jane Doe" });
      expect(tables.conversations[0].lead_id).toBe(result.leadId);

      // The marker line never reaches the customer.
      expect(adapter.sentMessages[0].text).toBe("Great, I have everything I need!");
      expect(adapter.sentMessages[0].text).not.toContain("LEAD_READY");

      const auditActions = tables.audit_log.map((row) => row.action);
      expect(auditActions).toContain("lead_submitted");
    });

    it("never submits a second lead for the same conversation once one is already linked", async () => {
      const { admin, tables } = createFakeAdmin({ companies: [A1_COMPANY] });
      const adapter = new MockCommunicationAdapter("web_public");
      const aiModel = {
        complete: async () => ({
          text: 'ok\nLEAD_READY: {"name":"Jane Doe","phone":"555-1234"}',
          tier: "low_cost" as const,
          modelId: "test",
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
          latencyMs: 0,
        }),
      };

      const inbound = {
        channel: "web_public" as const,
        externalUserId: "session-3",
        externalConversationId: "session-3",
        receivedAt: new Date().toISOString(),
        companyId: A1_COMPANY.id,
        companySlug: "a1-best-moving",
      };

      const first = await receiveMessage({ admin, adapter, aiModel }, { ...inbound, text: "first" });
      const second = await receiveMessage({ admin, adapter, aiModel }, { ...inbound, text: "second" });

      expect(first.leadId).toBeDefined();
      expect(second.leadId).toBeUndefined();
      expect(tables.leads).toHaveLength(1);
    });

    it("caps a public conversation's total turns and stops calling the AI model once the cap is hit", async () => {
      const { admin, tables } = createFakeAdmin({ companies: [A1_COMPANY] });
      const adapter = new MockCommunicationAdapter("web_public");
      let callCount = 0;
      const aiModel = {
        complete: async () => {
          callCount += 1;
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
        channel: "web_public" as const,
        externalUserId: "session-4",
        externalConversationId: "session-4",
        receivedAt: new Date().toISOString(),
        companyId: A1_COMPANY.id,
        companySlug: "a1-best-moving",
      };

      // 40 is the hard cap (see MAX_WEB_PUBLIC_CONVERSATION_MESSAGES) —
      // 20 exchanges (inbound+outbound each) reaches it exactly.
      for (let i = 0; i < 20; i++) {
        await receiveMessage({ admin, adapter, aiModel }, { ...inbound, text: `turn ${i}` });
      }
      expect(callCount).toBe(20);

      const result = await receiveMessage({ admin, adapter, aiModel }, { ...inbound, text: "one more" });

      expect(result.handled).toBe(true);
      expect(callCount).toBe(20); // no new AI call once the cap is hit
      const lastSent = adapter.sentMessages.at(-1);
      expect(lastSent?.text).toMatch(/wrap this up/i);

      const auditActions = tables.audit_log.map((row) => row.action);
      expect(auditActions).toContain("message_turn_limit_blocked");
    });
  });
});

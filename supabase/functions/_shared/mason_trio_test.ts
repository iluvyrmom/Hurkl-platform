import { deepStrictEqual as eq, ok } from "node:assert";
import {
  DEFAULT_TRIO_PROVIDERS,
  runTrio,
  type TrioContext,
  type TrioEnvelope,
  type TrioPorts,
  type TrioReceipt,
  type TrioRequest,
} from "./mason_trio.ts";

const scope = { kind: "company" as const, companyId: "example-company" };
const request: TrioRequest = {
  id: "example-request",
  question: "What are our approved opening hours?",
  scope,
};
const context: TrioContext = {
  version: "example-version",
  scope,
  evidence: [{ id: "approved-hours", body: "Weekdays, nine to five.", status: "active", scope }],
};
const receipt = (reviewerId: string, e: TrioEnvelope): TrioReceipt => ({
  reviewerId,
  provider: reviewerId === "verifier" ? "openai" : "anthropic",
  approved: true,
  digest: e.digest,
  contextVersion: e.contextVersion,
  checkedEvidenceIds: ["approved-hours"],
  reasons: [],
});
function fixture(overrides: Partial<TrioPorts> = {}) {
  const events: string[] = [];
  const ports: TrioPorts = {
    actors: { mason: "mason", memory: "memory", verifier: "verifier" },
    providers: DEFAULT_TRIO_PROVIDERS,
    authorizeStep: async (name) => {
      events.push(`budget:${name}`);
      return true;
    },
    gather: async () => {
      events.push("memory:gather");
      return context;
    },
    draft: async () => {
      events.push("mason:draft");
      return { text: "Weekdays, nine to five.", speechText: "Weekdays, nine to five." };
    },
    reviewMemory: async (e) => {
      events.push("memory:review");
      return receipt("memory", e);
    },
    verify: async (e) => {
      events.push("verifier:review");
      return receipt("verifier", e);
    },
    commit: async (e) => {
      events.push("memory:commit");
      return { recordId: "verified-record", digest: e.digest, contextVersion: e.contextVersion };
    },
    ...overrides,
  };
  return { ports, events };
}

Deno.test(
  "trio releases exact checked text/speech only after all roles and the memory commit",
  async () => {
    const { ports, events } = fixture();
    const r = await runTrio(request, ports);
    eq(r.status, "verified");
    ok(
      r.status === "verified" &&
        r.response.text === r.response.speechText &&
        r.receipts.length === 2,
    );
    eq(
      events.filter((x) => !x.startsWith("budget:")),
      ["memory:gather", "mason:draft", "memory:review", "verifier:review", "memory:commit"],
    );
    ok(events.every((e, i) => e.startsWith("budget:") || events[i - 1].startsWith("budget:")));
  },
);

Deno.test(
  "rejected work is corrected once and fresh checks bind the corrected wording",
  async () => {
    let drafts = 0,
      reviews = 0;
    const { ports } = fixture({
      draft: async (_r, _c, feedback) => {
        drafts++;
        if (drafts === 2) ok(feedback.includes("Wrong opening hours"));
        return {
          text: drafts === 1 ? "Unverified first draft" : "Corrected opening hours",
          speechText: "Checked spoken wording",
        };
      },
      verify: async (e) => {
        reviews++;
        return reviews === 1
          ? { ...receipt("verifier", e), approved: false, reasons: ["Wrong opening hours"] }
          : receipt("verifier", e);
      },
    });
    const r = await runTrio(request, ports);
    ok(
      r.status === "verified" && r.response.text === "Corrected opening hours" && r.attempts === 2,
    );
    eq(drafts, 2);
  },
);

Deno.test("missing evidence or stale/reused receipts cannot pass the release gate", async () => {
  for (const change of [
    { checkedEvidenceIds: [] },
    { checkedEvidenceIds: ["invented-source"] },
    { contextVersion: "old-version" },
    { digest: "unchecked-wording" },
    { reviewerId: "mason" },
    { provider: "anthropic" },
  ]) {
    const { ports, events } = fixture({
      verify: async (e) => ({ ...receipt("verifier", e), ...change }),
    });
    const r = await runTrio(request, ports, { maxCorrections: 0 });
    eq(r.status, "blocked");
    ok(!("response" in r));
    ok(!events.includes("memory:commit"));
  }
});

Deno.test("a worker cannot change text or spoken wording after checks begin", async () => {
  const { ports } = fixture({
    verify: async (e) => {
      (e as any).speechText = "Unchecked replacement";
      return receipt("verifier", e);
    },
  });
  const r = await runTrio(request, ports);
  eq(r.status, "blocked");
  ok(!("response" in r));
});

Deno.test("tenant/source isolation and approval status are checked before drafting", async () => {
  for (const invalid of [
    { ...context, scope: { kind: "company" as const, companyId: "another-company" } },
    {
      ...context,
      evidence: [
        {
          ...context.evidence[0],
          scope: { kind: "company" as const, companyId: "another-company" },
        },
      ],
    },
    {
      ...context,
      evidence: [{ ...context.evidence[0], scope: { kind: "founder" as const, companyId: null } }],
    },
    { ...context, evidence: [{ ...context.evidence[0], status: "pending_approval" }] },
  ]) {
    const { ports, events } = fixture({ gather: async () => invalid });
    const r = await runTrio(request, ports);
    eq(r.status, "blocked");
    ok(!events.includes("mason:draft"));
  }
});

Deno.test(
  "company work may use approved core context but separate reviewers are mandatory",
  async () => {
    const { ports } = fixture({
      gather: async () => ({
        ...context,
        evidence: [{ ...context.evidence[0], scope: { kind: "hurkl_core", companyId: null } }],
      }),
    });
    eq((await runTrio(request, ports)).status, "verified");
    ports.actors = { mason: "same-worker", memory: "memory", verifier: "same-worker" };
    eq((await runTrio(request, ports)).status, "blocked");
  },
);

Deno.test(
  "the pilot defaults to OpenAI verification and rejects a shared provider before work",
  async () => {
    eq(DEFAULT_TRIO_PROVIDERS.verifier, "openai");
    for (const provider of ["anthropic", " ANTHROPIC "]) {
      const { ports, events } = fixture({
        providers: { ...DEFAULT_TRIO_PROVIDERS, verifier: provider },
      });
      const r = await runTrio(request, ports);
      eq(r.status, "blocked");
      eq(events, []);
    }
    const missing = fixture({ providers: undefined as any });
    eq((await runTrio(request, missing.ports)).status, "blocked");
  },
);

Deno.test(
  "budget denial, invocation cap and review exhaustion all stop without a draft leak",
  async () => {
    const denied = fixture({ authorizeStep: async (name) => name !== "verification" });
    eq((await runTrio(request, denied.ports)).status, "blocked");
    ok(!denied.events.includes("verifier:review"));
    eq((await runTrio(request, fixture().ports, { maxRoleInvocations: 2 })).status, "blocked");
    let reviews = 0;
    const failed = fixture({
      verify: async (e) => {
        reviews++;
        return { ...receipt("verifier", e), approved: false, reasons: ["Needs evidence"] };
      },
    });
    const r = await runTrio(request, failed.ports);
    eq(r.status, "blocked");
    eq(reviews, 2);
    ok(!("response" in r));
  },
);

Deno.test("a failed/stale memory commit or unavailable reviewer prevents release", async () => {
  for (const overrides of [
    {
      commit: async () => {
        throw new Error("stale context");
      },
    },
    {
      commit: async () => ({ recordId: "wrong", digest: "other", contextVersion: context.version }),
    },
    {
      verify: async () => {
        throw new Error("provider outage; private details must not escape");
      },
    },
  ]) {
    const r = await runTrio(request, fixture(overrides).ports);
    eq(r.status, "blocked");
    ok(!("response" in r));
    ok(!JSON.stringify(r).includes("private details"));
  }
});

Deno.test("a stalled role times out and receives an aborted signal", async () => {
  let signal: AbortSignal | undefined;
  const { ports } = fixture({
    gather: (_r, c) => {
      signal = c.signal;
      return new Promise(() => {});
    },
  });
  const r = await runTrio(request, ports, { deadlineMs: 10 });
  eq(r.status, "blocked");
  ok(signal?.aborted);
});

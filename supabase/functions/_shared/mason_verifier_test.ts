import { deepStrictEqual as eq, ok, rejects } from "node:assert";
import { runTrio, type TrioContext, type TrioEnvelope, type TrioReceipt } from "./mason_trio.ts";
import {
  createOpenAIVerifier,
  modelAccepted,
  type VerifierPlan,
  type VerifierSettlement,
} from "./mason_verifier.ts";

const scope = { kind: "company" as const, companyId: "test-company" };
const context: TrioContext = {
  version: "context-1",
  scope,
  evidence: [
    { id: "hours", body: "Monday through Friday, nine to five.", status: "active", scope },
  ],
};
const envelope: TrioEnvelope = {
  requestId: "request-1",
  contextVersion: context.version,
  scope,
  digest: "a".repeat(64),
  text: "Monday through Friday, nine to five.",
  speechText: "Monday through Friday, nine to five.",
};
const control = () => ({ signal: new AbortController().signal, attempt: 1 });

function modelVerdict(e: TrioEnvelope = envelope, changes: Record<string, unknown> = {}) {
  return {
    approved: true,
    requestId: e.requestId,
    digest: e.digest,
    contextVersion: e.contextVersion,
    checkedEvidenceIds: ["hours"],
    writtenVerified: true,
    speechVerified: true,
    reasons: [],
    ...changes,
  };
}
function providerBody(v = modelVerdict(), changes: Record<string, unknown> = {}) {
  return {
    id: "response-1",
    model: "gpt-6.1-terra",
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(v) }],
      },
    ],
    usage: { input_tokens: 800, output_tokens: 160 },
    ...changes,
  };
}
function setup(
  opts: {
    fetcher?: typeof fetch;
    approveBudget?: boolean;
    failSettlement?: boolean;
    overrides?: Partial<Parameters<typeof createOpenAIVerifier>[0]>;
  } = {},
) {
  const events: string[] = [],
    plans: VerifierPlan[] = [],
    settlements: VerifierSettlement[] = [];
  const fetcher: typeof fetch =
    opts.fetcher ??
    (async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      const e = JSON.parse(request.input[0].content).envelope;
      return Response.json(providerBody(modelVerdict(e)));
    });
  const config = {
    apiKey: "synthetic-test-credential",
    model: "gpt-6.1-terra",
    reviewerId: "independent-verifier",
    question: "What are our approved opening hours?",
    budget: {
      reserve: async (plan: VerifierPlan) => {
        events.push("reserve");
        plans.push(plan);
        return opts.approveBudget === false ? null : { id: "reservation-1" };
      },
      settle: async (settlement: VerifierSettlement) => {
        events.push("settle");
        settlements.push(settlement);
        if (opts.failSettlement) throw new Error("private accounting failure");
      },
    },
    fetcher: (async (url, init) => {
      events.push("fetch");
      return await fetcher(url, init);
    }) as typeof fetch,
    ...opts.overrides,
  };
  return { verify: createOpenAIVerifier(config), events, plans, settlements, config };
}

Deno.test(
  "verifier sends exact text/speech to a fixed endpoint after reservation, then settles before returning",
  async () => {
    let sent!: {
      input: { content: string }[];
      store: boolean;
      stream: boolean;
      tools: unknown[];
      tool_choice: string;
      max_output_tokens: number;
      text: { format: { strict: boolean; type: string } };
    };
    const test = setup({
      fetcher: async (url, init) => {
        eq(url, "https://api.openai.com/v1/responses");
        eq(init?.redirect, "error");
        sent = JSON.parse(String(init?.body));
        const headers = new Headers(init?.headers);
        eq(headers.get("authorization"), "Bearer synthetic-test-credential");
        const payload = JSON.parse(sent.input[0].content);
        eq(payload.envelope, envelope);
        eq(payload.evidence, context.evidence);
        ok(!String(init?.body).includes("synthetic-test-credential"));
        return Response.json(providerBody());
      },
    });
    const result = await test.verify(envelope, context, control());
    eq(result.provider, "openai");
    eq(result.reviewerId, "independent-verifier");
    eq(result.approved, true);
    eq(test.events, ["reserve", "fetch", "settle"]);
    eq(sent.store, false);
    eq(sent.stream, false);
    eq(sent.tools, []);
    eq(sent.tool_choice, "none");
    eq(sent.text.format.strict, true);
    eq(sent.text.format.type, "json_schema");
    eq(sent.max_output_tokens, 2000);
    ok(
      test.plans[0].inputTokenUpperBound >
        new TextEncoder().encode(JSON.stringify(sent)).byteLength,
    );
    eq(test.settlements[0].inputTokens, 800);
    eq(test.settlements[0].outputTokens, 160);
    eq(test.settlements[0].status, "approved");
    eq(test.settlements[0].chargeReservedMaximum, false);
    ok(Object.isFrozen(result));
    ok(Object.isFrozen(result.checkedEvidenceIds));
  },
);

Deno.test(
  "missing key/configuration, budget refusal and prior cancellation prevent provider calls",
  async () => {
    const valid = setup();
    for (const change of [
      { apiKey: "" },
      { model: "" },
      { question: "" },
      { budget: undefined },
      { maxCalls: 4 },
      { maxOutputTokens: 5000 },
      { timeoutMs: 60_000 },
    ]) {
      await rejects(
        async () =>
          createOpenAIVerifier({ ...valid.config, ...change } as unknown as Parameters<
            typeof createOpenAIVerifier
          >[0]),
        /configuration/,
      );
    }
    const denied = setup({ approveBudget: false });
    await rejects(() => denied.verify(envelope, context, control()), /budget_denied/);
    eq(denied.events, ["reserve"]);
    const cancelled = setup(),
      abort = new AbortController();
    abort.abort();
    await rejects(
      () => cancelled.verify(envelope, context, { signal: abort.signal, attempt: 1 }),
      /cancelled/,
    );
    eq(cancelled.events, []);
  },
);

Deno.test(
  "scope isolation, pending sources and oversized inputs fail before reservation",
  async () => {
    for (const invalid of [
      { ...context, version: "stale" },
      { ...context, evidence: [] },
      { ...context, evidence: [{ ...context.evidence[0], status: "pending_approval" }] },
      {
        ...context,
        evidence: [
          { ...context.evidence[0], scope: { kind: "founder" as const, companyId: null } },
        ],
      },
      {
        ...context,
        evidence: [{ ...context.evidence[0], scope: { ...scope, companyId: "another-company" } }],
      },
    ]) {
      const test = setup();
      await rejects(() => test.verify(envelope, invalid, control()), /invalid_context/);
      eq(test.events, []);
    }
    const big = setup();
    await rejects(
      () =>
        big.verify(
          envelope,
          {
            ...context,
            evidence: [0, 1, 2, 3].map((i) => ({
              ...context.evidence[0],
              id: `source-${i}`,
              body: "語".repeat(8000),
            })),
          },
          control(),
        ),
      /request_too_large/,
    );
    eq(big.events, []);
  },
);

Deno.test(
  "a supported rejection reaches Mason as correction reasons and is still metered",
  async () => {
    const test = setup({
      fetcher: async () =>
        Response.json(
          providerBody(
            modelVerdict(envelope, {
              approved: false,
              speechVerified: false,
              reasons: ["Spoken hours are unsupported."],
            }),
          ),
        ),
    });
    const result = await test.verify(envelope, context, control());
    eq(result.approved, false);
    eq(result.reasons, ["Spoken hours are unsupported."]);
    eq(test.settlements[0].status, "rejected");
  },
);

Deno.test(
  "stale, forged, unsupported or partial checks never become approval receipts",
  async () => {
    for (const change of [
      { digest: "b".repeat(64) },
      { requestId: "another-request" },
      { contextVersion: "old" },
      { checkedEvidenceIds: ["fabricated"] },
      { checkedEvidenceIds: [] },
      { checkedEvidenceIds: ["hours", "hours"] },
      { speechVerified: false },
      { writtenVerified: false },
      { approved: "true" },
      { reasons: ["Actually unsupported"] },
      { provider: "made-up" },
      { approved: false, reasons: [] },
    ]) {
      const test = setup({
        fetcher: async () => Response.json(providerBody(modelVerdict(envelope, change))),
      });
      await rejects(() => test.verify(envelope, context, control()), /verifier_check_failed/);
      eq(test.settlements.length, 1);
      eq(test.settlements[0].status, "failed");
    }
  },
);

Deno.test(
  "refusals, incomplete results, wrong models and tool calls fail without exposing provider text",
  async () => {
    for (const change of [
      { status: "incomplete" },
      { model: "unexpected-model" },
      { output: [{ type: "function_call", name: "send_message" }] },
      {
        output: [
          {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "refusal", refusal: "private provider detail" }],
          },
        ],
      },
      {
        output: [
          {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: "invalid private JSON" }],
          },
        ],
      },
    ]) {
      const test = setup({
        fetcher: async () => Response.json(providerBody(modelVerdict(), change)),
      });
      await rejects(
        () => test.verify(envelope, context, control()),
        /^Error: verifier_check_failed$/,
      );
      eq(test.settlements.length, 1);
    }
  },
);

Deno.test(
  "unknown usage, network errors and HTTP failures retain the full reserve and are never retried",
  async () => {
    for (const fetcher of [
      async () => Response.json(providerBody(modelVerdict(), { usage: undefined })),
      async () =>
        Response.json(
          providerBody(modelVerdict(), { usage: { input_tokens: -1, output_tokens: 1 } }),
        ),
      async () => new Response("private upstream failure", { status: 429 }),
      async () => {
        throw new Error("a private provider error containing a credential");
      },
    ]) {
      const test = setup({ fetcher });
      await rejects(
        () => test.verify(envelope, context, control()),
        /^Error: verifier_check_failed$/,
      );
      eq(test.events, ["reserve", "fetch", "settle"]);
      eq(test.settlements[0].chargeReservedMaximum, true);
    }
  },
);

Deno.test("failed accounting prevents an otherwise approved answer from escaping", async () => {
  const test = setup({ failSettlement: true });
  await rejects(() => test.verify(envelope, context, control()), /verifier_accounting_failed/);
  eq(test.settlements[0].status, "approved");
});

Deno.test("call/output caps and bounded response bytes cannot be bypassed", async () => {
  const test = setup({ overrides: { maxCalls: 1 } });
  await test.verify(envelope, context, control());
  await rejects(() => test.verify(envelope, context, control()), /call_limit/);
  eq(test.events.filter((e) => e === "fetch").length, 1);
  for (const body of [
    providerBody(modelVerdict(), { usage: { input_tokens: 800, output_tokens: 2001 } }),
    { oversized: "x".repeat(64_001) },
  ]) {
    const capped = setup({ fetcher: async () => Response.json(body) });
    await rejects(() => capped.verify(envelope, context, control()), /verifier_check_failed/);
    eq(capped.settlements.length, 1);
  }
});

Deno.test("timeouts abort the request and cancelled replies cannot become verified", async () => {
  const test = setup({
    overrides: { timeoutMs: 5 },
    fetcher: async (_url, init) => {
      await new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
      );
      return Response.json({});
    },
  });
  await rejects(() => test.verify(envelope, context, control()), /verifier_check_failed/);
  eq(test.settlements[0].chargeReservedMaximum, true);
});

Deno.test(
  "the coordinator releases only after the real HTTP adapter's verdict, accounting and memory commit",
  async () => {
    const test = setup();
    const result = await runTrio(
      { id: "request-1", question: test.config.question, scope },
      {
        actors: { mason: "mason", memory: "memory", verifier: "independent-verifier" },
        providers: { mason: "anthropic", memory: "anthropic", verifier: "openai" },
        authorizeStep: async () => true,
        gather: async () => context,
        draft: async () => ({ text: envelope.text, speechText: envelope.speechText }),
        reviewMemory: async (e): Promise<TrioReceipt> => ({
          reviewerId: "memory",
          provider: "anthropic",
          approved: true,
          digest: e.digest,
          contextVersion: e.contextVersion,
          checkedEvidenceIds: ["hours"],
          reasons: [],
        }),
        verify: test.verify,
        commit: async (e) => {
          eq(test.settlements.length, 1);
          test.events.push("commit");
          return { recordId: "record-1", digest: e.digest, contextVersion: e.contextVersion };
        },
      },
    );
    eq(result.status, "verified");
    eq(test.events, ["reserve", "fetch", "settle", "commit"]);
    // This is a deterministic transport/contract check, not a live provider/database test.
  },
);

Deno.test("founder requests may cite company evidence; company requests still may not cite another company", async () => {
  const founder = { kind: "founder" as const, companyId: null };
  const fCtx: TrioContext = { ...context, scope: founder };
  const fEnv: TrioEnvelope = { ...envelope, scope: founder };
  const test = setup({ fetcher: async () => Response.json(providerBody(modelVerdict(fEnv))) });
  const r = await test.verify(fEnv, fCtx, control());
  eq(r.approved, true); // the evidence is company-scoped, the request is the founder's
  const other = setup();
  await rejects(
    () => other.verify(envelope, { ...context, evidence: [{ ...context.evidence[0], scope: { ...scope, companyId: "another-company" } }] }, control()),
    /invalid_context/,
  );
  eq(other.events, []);
});

Deno.test("a dated snapshot of the chosen model is accepted; any other model is not", () => {
  const a = new Set(["gpt-6.1-terra"]);
  ok(modelAccepted(a, "gpt-6.1-terra"));
  ok(modelAccepted(a, "gpt-6.1-terra-2026-10-26"));
  ok(!modelAccepted(a, "gpt-6.1-terra-pro"));
  ok(!modelAccepted(a, "gpt-6-luna"));
  ok(!modelAccepted(a, "gpt-6.1-terra-2026-10-26-evil"));
});

import { deepStrictEqual as eq, ok } from "node:assert";
import { buildEvidence, HOLDING_REPLY, memoryReasons, parseVerdict, talkThroughTrio, type TrioTalkDeps } from "./mason_trio_talk.ts";
import { spokenVersion } from "./speech_text.ts";

function deps(over: Partial<TrioTalkDeps> = {}) {
  const log: string[] = [];
  const d: TrioTalkDeps = {
    requestId: "00000000-0000-0000-0000-000000000042",
    question: "When does Travis go live?",
    briefing: "OPEN TASKS: Travis (Executive Drains) goes live December 1.",
    conversation: "Josh: hi\nMason: Hi Josh.",
    searchMemory: async () => [
      { id: "m1", title: "Travis go-live", body: "December 1", scope: "company", company_id: "c-ed", status: "active" },
      { id: "m2", title: "Draft rule", body: "not approved", scope: "hurkl_core", company_id: null, status: "pending_approval" },
    ],
    doWork: async () => { log.push("work"); return { reply: "Travis goes live December 1.", toolResults: [{ name: "search_memory", text: "Travis go-live: December 1" }], costUsd: 0.002 }; },
    rewrite: async ({ feedback }) => { log.push(`rewrite:${feedback.length}`); return { reply: "Travis goes live on December 1.", costUsd: 0.001 }; },
    verifyModel: async () => { log.push("verify"); return { approved: true, evidenceIds: ["briefing", "m1"], reasons: [], costUsd: 0.01 }; },
    spoken: spokenVersion,
    canSpend: async () => true,
    commit: async () => { log.push("commit"); return "msg-1"; },
    providers: { mason: "anthropic", memory: "hurkl-code", verifier: "anthropic" },
    allowSameProviderVerifier: true,
    ...over,
  };
  return { d, log };
}

Deno.test("a checked reply goes out with its receipts, cost and the temporary-provider label", async () => {
  const { d, log } = deps();
  const r = await talkThroughTrio(d);
  eq(r.status, "verified");
  eq(r.reply, "Travis goes live December 1.");
  eq(r.independence, "same_provider_temporary");
  eq(log, ["work", "verify", "commit"]);
  ok(Math.abs(r.costUsd - 0.012) < 1e-9);
  eq(r.receipts.map((x) => x.reviewerId), ["memory", "verifier"]);
});

Deno.test("a rejected reply is corrected once and checked again", async () => {
  let n = 0;
  const { d, log } = deps({
    verifyModel: async () => (++n === 1
      ? { approved: false, evidenceIds: ["m1"], reasons: ["Say the date exactly as in memory."], costUsd: 0.01 }
      : { approved: true, evidenceIds: ["m1"], reasons: [], costUsd: 0.01 }),
  });
  const r = await talkThroughTrio(d);
  eq(r.status, "verified");
  eq(r.reply, "Travis goes live on December 1.");
  eq(r.attempts, 2);
  ok(log.includes("rewrite:2"));
});

Deno.test("a reply that keeps failing never goes out; Josh gets the holding reply", async () => {
  const { d, log } = deps({ verifyModel: async () => ({ approved: false, evidenceIds: [], reasons: ["Invented date."], costUsd: 0.01 }) });
  const r = await talkThroughTrio(d);
  eq(r.status, "blocked");
  eq(r.reply, HOLDING_REPLY);
  ok(!log.includes("commit"));
});

Deno.test("spending ceilings stop the trio before any further AI call", async () => {
  const { d, log } = deps({ canSpend: async () => false });
  const r = await talkThroughTrio(d);
  eq(r.status, "blocked");
  eq(log, []);
});

Deno.test("an approval that names no evidence does not count", async () => {
  const { d } = deps({ verifyModel: async () => ({ approved: true, evidenceIds: ["made-up"], reasons: [], costUsd: 0 }) });
  eq((await talkThroughTrio(d)).status, "blocked");
});

Deno.test("an unreadable verdict is a rejection, never an approval", () => {
  eq(parseVerdict("sure, looks fine").approved, false);
  eq(parseVerdict('{"approved": true, "evidence_ids": ["m1"], "reasons": ["x"]}').approved, false);
  eq(parseVerdict('Here: {"approved": true, "evidence_ids": ["m1"], "reasons": []}'), { approved: true, evidenceIds: ["m1"], reasons: [] });
});

Deno.test("pending rules are never evidence; tool results and the conversation are", async () => {
  const { d } = deps();
  const ev = await buildEvidence(d, d.question, { reply: "", toolResults: [{ name: "add_task", text: "Saved (id 9)." }], costUsd: 0 });
  const ids = ev.map((e) => e.id);
  ok(ids.includes("briefing") && ids.includes("conversation") && ids.includes("tool-1-add_task") && ids.includes("m1"));
  ok(!ids.includes("m2"));
  ok(ev.reduce((n, e) => n + e.body.length, 0) <= 32_000);
});

Deno.test("Memory's own check catches changed speech and secrets", () => {
  const env = (text: string, speechText: string) => ({ text, speechText, requestId: "r", contextVersion: "v", digest: "d", scope: { kind: "founder" as const, companyId: null } });
  eq(memoryReasons(env("Vancouver, WA", "Vancouver, Washington"), spokenVersion), []);
  eq(memoryReasons(env("Vancouver, WA", "Vancouver WA"), spokenVersion).length, 1);
  eq(memoryReasons(env("key sk-abcdefghijklmnopqrstuv", spokenVersion("key sk-abcdefghijklmnopqrstuv")), spokenVersion).length, 1);
});

Deno.test("a crash in Mason's work becomes the holding reply, not an error", async () => {
  const { d } = deps({ doWork: async () => { throw new Error("claude down"); } });
  const r = await talkThroughTrio(d);
  eq(r.status, "blocked");
  eq(r.reply, HOLDING_REPLY);
});

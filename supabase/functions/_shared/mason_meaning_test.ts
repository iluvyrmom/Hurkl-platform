import { deepStrictEqual as eq, ok, rejects } from "node:assert";
import { DIMENSIONS, entryText, fillMissingMeaning, fuseRankings, meaningHits, parseVoyage, saveMeaning, voyageEmbed } from "./mason_meaning.ts";

const vec = () => Array.from({ length: DIMENSIONS }, () => 1 / Math.sqrt(DIMENSIONS));
const embedOk = (texts: string[]) => Promise.resolve(texts.map(vec));

// A tiny stand-in for the Supabase client: records what was called.
function fakeSb(opts: { missing?: unknown[]; rpcError?: string; upsertError?: string; hits?: unknown[] } = {}) {
  const calls: { rpc: [string, Record<string, unknown>][]; upserts: Record<string, unknown>[][] } = { rpc: [], upserts: [] };
  const sb = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.rpc.push([name, args]);
      if (opts.rpcError) return Promise.resolve({ data: null, error: { message: opts.rpcError } });
      if (name === "mason_memory_missing_meaning") return Promise.resolve({ data: opts.missing ?? [], error: null });
      return Promise.resolve({ data: opts.hits ?? [], error: null });
    },
    from: () => ({
      upsert: (rows: Record<string, unknown>[]) => {
        calls.upserts.push(rows);
        return Promise.resolve({ error: opts.upsertError ? { message: opts.upsertError } : null });
      },
    }),
  };
  // deno-lint-ignore no-explicit-any
  return { sb: sb as any, calls };
}

Deno.test("entry text: kind, title and body, capped", () => {
  eq(entryText({ kind: "fact", title: "Travis owns Executive Drains", body: "Plumbing company." }), "fact: Travis owns Executive Drains\nPlumbing company.");
  eq(entryText({ kind: "note", title: "t", body: null }), "note: t");
  ok(entryText({ kind: "note", title: "t", body: "x".repeat(9000) }).length <= 4000);
});

Deno.test("rankings combine: found by both searches ranks first, no repeats, limit kept", () => {
  eq(fuseRankings(["a", "b", "c"], ["c", "d"], 10)[0], "c");
  eq(new Set(fuseRankings(["a", "b"], ["b", "a"], 10)).size, 2);
  eq(fuseRankings(["a", "b", "c"], ["d", "e"], 2).length, 2);
  eq(fuseRankings([], [], 5), []);
  eq(fuseRankings([], ["x"], 5), ["x"]); // meaning alone still finds it ("the drain guy" → Travis)
});

Deno.test("no Voyage key means meaning search is off", () => {
  eq(voyageEmbed(fetch, ""), null);
});

Deno.test("Voyage call: right model, input type and size; vectors come back in input order", async () => {
  let sent: Record<string, unknown> = {};
  let auth = "";
  const fakeFetch = ((_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    auth = String((init.headers as Record<string, string>).Authorization);
    const a = vec(); const b = vec(); b[0] = 0.5;
    return Promise.resolve(new Response(JSON.stringify({ data: [{ embedding: b, index: 1 }, { embedding: a, index: 0 }], usage: { total_tokens: 12 } })));
  }) as typeof fetch;
  const out = await voyageEmbed(fakeFetch, "test-key")!(["one", "two"], "document");
  eq([sent.model, sent.input_type, sent.output_dimension], ["voyage-4-lite", "document", DIMENSIONS]);
  eq(auth, "Bearer test-key");
  eq(out[1][0], 0.5);
});

Deno.test("a Voyage refusal is an error (callers fall back to word search)", async () => {
  const limited = (() => Promise.resolve(new Response("{}", { status: 429 }))) as typeof fetch;
  await rejects(voyageEmbed(limited, "k")!(["q"], "query"), /voyage_429/);
});

Deno.test("a reply with the wrong size or a missing vector is rejected", () => {
  let threw = 0;
  try { parseVoyage({ data: [{ embedding: [1, 2, 3] }] }, 1); } catch { threw++; }
  try { parseVoyage({ data: [] }, 1); } catch { threw++; }
  eq(threw, 2);
});

Deno.test("a failed fingerprint never breaks a save", async () => {
  const { sb } = fakeSb();
  eq(await saveMeaning(sb, () => Promise.reject(new Error("voyage_429")), [{ id: "1", kind: "note", title: "t", body: "" }]), 0);
  const { sb: sb2 } = fakeSb({ upsertError: "db down" });
  eq(await saveMeaning(sb2, embedOk, [{ id: "1", kind: "note", title: "t", body: "" }]), 0);
});

Deno.test("fingerprints are saved together with their model and a content hash", async () => {
  const { sb, calls } = fakeSb();
  eq(await saveMeaning(sb, embedOk, [{ id: "a", kind: "fact", title: "t", body: "b" }, { id: "b", kind: "note", title: "u", body: "" }]), 2);
  eq(calls.upserts.length, 1); // one database write for the batch
  eq(calls.upserts[0].map((r) => r.memory_id), ["a", "b"]);
  eq(calls.upserts[0][0].model, "voyage-4-lite");
  eq(String(calls.upserts[0][0].content_hash).length, 64);
});

Deno.test("filling missing fingerprints makes one batched call", async () => {
  const missing = Array.from({ length: 5 }, (_, i) => ({ id: String(i), kind: "note", title: `t${i}`, body: "" }));
  const { sb } = fakeSb({ missing });
  let calls = 0;
  const counting = (texts: string[]) => { calls++; return embedOk(texts); };
  eq(await fillMissingMeaning(sb, counting), 5);
  eq(calls, 1);
});

Deno.test("meaning search passes the walls to the database and fails quietly", async () => {
  const { sb, calls } = fakeSb({ hits: [{ memory_id: "m1", similarity: 0.9 }] });
  const hits = await meaningHits(sb, embedOk, "the drain guy", { scope: "company", companyId: "c1", kind: "fact" }, 5);
  eq(hits, [{ id: "m1", similarity: 0.9 }]);
  const args = calls.rpc[0][1];
  eq([args.p_scope, args.p_company_id, args.p_kind, args.p_include_history], ["company", "c1", "fact", false]);
  const { sb: bad } = fakeSb({ rpcError: "boom" });
  eq(await meaningHits(bad, embedOk, "q", {}, 5), []);
  eq(await meaningHits(sb, () => Promise.reject(new Error("voyage_429")), "q", {}, 5), []);
});

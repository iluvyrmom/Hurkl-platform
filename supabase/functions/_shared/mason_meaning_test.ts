import { deepStrictEqual as eq, ok } from "node:assert";
import { builtInEmbed, entryText, fillMissingMeaning, fuseRankings, meaningHits, saveMeaning } from "./mason_meaning.ts";

const vec = () => Array.from({ length: 384 }, () => 1 / Math.sqrt(384));

// A tiny stand-in for the Supabase client: records what was called.
function fakeSb(opts: { missing?: unknown[]; rpcError?: string; upsertError?: string; hits?: unknown[] } = {}) {
  const calls: { rpc: [string, Record<string, unknown>][]; upserts: Record<string, unknown>[] } = { rpc: [], upserts: [] };
  const sb = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.rpc.push([name, args]);
      if (opts.rpcError) return Promise.resolve({ data: null, error: { message: opts.rpcError } });
      if (name === "mason_memory_missing_meaning") return Promise.resolve({ data: opts.missing ?? [], error: null });
      return Promise.resolve({ data: opts.hits ?? [], error: null });
    },
    from: () => ({
      upsert: (row: Record<string, unknown>) => {
        calls.upserts.push(row);
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
  ok(entryText({ kind: "note", title: "t", body: "x".repeat(5000) }).length <= 2000);
});

Deno.test("rankings combine: found by both searches ranks first, no repeats, limit kept", () => {
  eq(fuseRankings(["a", "b", "c"], ["c", "d"], 10)[0], "c");
  eq(new Set(fuseRankings(["a", "b"], ["b", "a"], 10)).size, 2);
  eq(fuseRankings(["a", "b", "c"], ["d", "e"], 2).length, 2);
  eq(fuseRankings([], [], 5), []);
  eq(fuseRankings([], ["x"], 5), ["x"]); // meaning alone still finds it ("the drain guy" → Travis)
});

Deno.test("outside Supabase's runtime there is no built-in model, so meaning search is off", () => {
  eq(builtInEmbed(), null);
});

Deno.test("a failed fingerprint never breaks a save", async () => {
  const { sb } = fakeSb();
  eq(await saveMeaning(sb, () => Promise.reject(new Error("model down")), { id: "1", kind: "note", title: "t", body: "" }), false);
  const { sb: sb2 } = fakeSb({ upsertError: "db down" });
  eq(await saveMeaning(sb2, () => Promise.resolve(vec()), { id: "1", kind: "note", title: "t", body: "" }), false);
});

Deno.test("a fingerprint is saved with its model and a content hash", async () => {
  const { sb, calls } = fakeSb();
  ok(await saveMeaning(sb, () => Promise.resolve(vec()), { id: "abc", kind: "fact", title: "t", body: "b" }));
  eq(calls.upserts[0].memory_id, "abc");
  eq(calls.upserts[0].model, "gte-small");
  eq(String(calls.upserts[0].content_hash).length, 64);
});

Deno.test("filling missing fingerprints stops at its time budget", async () => {
  const missing = Array.from({ length: 8 }, (_, i) => ({ id: String(i), kind: "note", title: `t${i}`, body: "" }));
  const { sb, calls } = fakeSb({ missing });
  const slow = () => new Promise<number[]>((r) => setTimeout(() => r(vec()), 30));
  const done = await fillMissingMeaning(sb, slow, { budgetMs: 50 });
  ok(done >= 1 && done < 8, `filled ${done}`);
  eq(calls.upserts.length, done);
});

Deno.test("meaning search passes the walls to the database and fails quietly", async () => {
  const { sb, calls } = fakeSb({ hits: [{ memory_id: "m1", similarity: 0.9 }] });
  const hits = await meaningHits(sb, () => Promise.resolve(vec()), "the drain guy", { scope: "company", companyId: "c1", kind: "fact" }, 5);
  eq(hits, [{ id: "m1", similarity: 0.9 }]);
  const args = calls.rpc[0][1];
  eq([args.p_scope, args.p_company_id, args.p_kind, args.p_include_history], ["company", "c1", "fact", false]);
  const { sb: bad } = fakeSb({ rpcError: "boom" });
  eq(await meaningHits(bad, () => Promise.resolve(vec()), "q", {}, 5), []);
});

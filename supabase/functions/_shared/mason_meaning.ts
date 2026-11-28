// HURKL — search Mason's memory by meaning (build map Part A, piece 1).
//
// Each memory entry gets a meaning fingerprint (embedding) from OpenAI's text-embedding-3-small,
// shortened to 1024 numbers. Searches use both word matching and meaning, combined by rank, so
// "the drain guy" finds entries that only say "Travis".
//
// Provider history (2026-11-28): Supabase's built-in gte-small failed the live test (HTTP 546 on
// the per-request processing limit, and Supabase logged it may be deprecated). The founder then
// chose Voyage, and once the OpenAI account worked he put in one OpenAI key for both the Verifier
// and this, so HURKL has one fewer account and key. Voyage was never switched on.
//
// One copy, used by the toolbox (search_memory) and by the trio's Memory step in mason-talk.
// Walls (scope, company, status, kind) are applied inside both searches, never after.
// Off unless the secret OPENAI_API_KEY is set, or MASON_MEANING_SEARCH is "off". Any failure (no
// key, limit reached, timeout) falls back to word search; a search never fails because of it.
// Limits per request: at most 2 calls (one batch of missing fingerprints, one question),
// BACKFILL_BATCH entries per batch, an 8-second timeout, no retries. Token use is logged.
// Cost: $0.02 per million tokens (OpenAI pricing, checked 2026-11-28); all 160 entries about
// a tenth of a cent. It comes out of the same prepaid OpenAI credit as the Verifier.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

/** Fingerprints for several texts at once. "document" = a memory entry, "query" = a question. */
export type Embed = (texts: string[], kind: "document" | "query") => Promise<number[][]>;
export type MemoryEntry = { id: string; kind: string; title: string; body: string | null; [k: string]: unknown };
export type SearchFilters = { scope?: string | null; companyId?: string | null; kind?: string | null; includeHistory?: boolean };

export const MEANING_MODEL = "text-embedding-3-small";
export const DIMENSIONS = 1024;
/** Lowest similarity counted as related (1 = same meaning). Provisional: tuned on real entries at the
 * first live test through the setting MASON_MEANING_MIN_SIMILARITY (a number between 0 and 1). */
export const MIN_SIMILARITY = 0.35;
export function minSimilarity(): number {
  try {
    // deno-lint-ignore no-explicit-any
    const v = Number((globalThis as any).Deno?.env?.get?.("MASON_MEANING_MIN_SIMILARITY"));
    return Number.isFinite(v) && v >= 0 && v < 1 ? v : MIN_SIMILARITY;
  } catch {
    return MIN_SIMILARITY;
  }
}
export const BACKFILL_BATCH = 25;
const TIMEOUT_MS = 8000;
const MAX_TEXT = 4000;

/** The words that describe an entry: what kind it is, its title, then its body. */
export function entryText(e: Pick<MemoryEntry, "kind" | "title" | "body">): string {
  return `${e.kind}: ${e.title}\n${e.body ?? ""}`.slice(0, MAX_TEXT).trim();
}

export async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function env(name: string): string {
  try {
    // deno-lint-ignore no-explicit-any
    return String((globalThis as any).Deno?.env?.get?.(name) ?? "").trim();
  } catch {
    return "";
  }
}

/** Read the vectors out of an embeddings reply, in input order. Throws on anything unexpected. */
export function parseEmbeddings(body: unknown, count: number): number[][] {
  // deno-lint-ignore no-explicit-any
  const b = body as any;
  const rows: { embedding: number[]; index?: number }[] = Array.isArray(b?.data) ? b.data : [];
  const out = new Array<number[]>(count);
  rows.forEach((r, i) => { out[typeof r.index === "number" ? r.index : i] = r.embedding; });
  for (let i = 0; i < count; i++) {
    const v = out[i];
    if (!Array.isArray(v) || v.length !== DIMENSIONS || v.some((x) => typeof x !== "number" || !Number.isFinite(x))) {
      throw new Error("bad_embedding");
    }
  }
  return out;
}

/** OpenAI text-embedding-3-small at 1024 numbers, or null when switched off or no key is set. */
export function openaiEmbed(fetchFn: typeof fetch = fetch, key = env("OPENAI_API_KEY")): Embed | null {
  if (!key || env("MASON_MEANING_SEARCH") === "off") return null;
  return async (texts, kind) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetchFn("https://api.openai.com/v1/embeddings", {
        method: "POST",
        redirect: "error",
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ input: texts.map((t) => t.slice(0, MAX_TEXT)), model: MEANING_MODEL, dimensions: DIMENSIONS }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`embeddings_${res.status}`);
      console.log(JSON.stringify({ msg: "mason_meaning_embed", kind, inputs: texts.length, tokens: body?.usage?.total_tokens ?? null }));
      return parseEmbeddings(body, texts.length);
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Give fingerprints to entries that don't have one yet: one batched call, newest entries first. */
export async function fillMissingMeaning(sb: SupabaseClient, embed: Embed, batch = BACKFILL_BATCH): Promise<number> {
  const { data, error } = await sb.rpc("mason_memory_missing_meaning", { p_limit: batch });
  if (error || !data?.length) return 0;
  return await saveMeaning(sb, embed, data as MemoryEntry[]);
}

/** Fingerprint entries in one call. Never throws: an entry without one is still found by words. */
export async function saveMeaning(sb: SupabaseClient, embed: Embed, entries: MemoryEntry[]): Promise<number> {
  if (!entries.length) return 0;
  try {
    const texts = entries.map(entryText);
    const vectors = await embed(texts, "document");
    const rows = await Promise.all(entries.map(async (e, i) => ({
      memory_id: e.id, embedding: JSON.stringify(vectors[i]), model: MEANING_MODEL, content_hash: await sha256(texts[i]),
    })));
    const { error } = await sb.from("mason_memory_meaning").upsert(rows, { onConflict: "memory_id" });
    if (error) {
      console.warn(JSON.stringify({ msg: "mason_meaning_save_failed", error: error.message.slice(0, 200) }));
      return 0;
    }
    return rows.length;
  } catch (err) {
    console.warn(JSON.stringify({ msg: "mason_meaning_embed_failed", error: String(err).slice(0, 200) }));
    return 0;
  }
}

/** Entry ids closest in meaning to the question, inside the given walls. Empty on any failure. */
export async function meaningHits(sb: SupabaseClient, embed: Embed, query: string, f: SearchFilters, limit: number): Promise<{ id: string; similarity: number }[]> {
  try {
    const [embedding] = await embed([query], "query");
    const { data, error } = await sb.rpc("mason_memory_meaning_search", {
      p_embedding: JSON.stringify(embedding), p_limit: limit, p_min_similarity: minSimilarity(),
      p_scope: f.scope ?? null, p_company_id: f.companyId ?? null, p_kind: f.kind ?? null, p_include_history: !!f.includeHistory,
    });
    if (error) throw new Error(error.message);
    const hits = (data ?? []).map((r: { memory_id: string; similarity: number }) => ({ id: r.memory_id, similarity: Number(r.similarity) }));
    // Scores only (no memory text), so the match level can be tuned from the logs.
    console.log(JSON.stringify({ msg: "mason_meaning_hits", count: hits.length, top: hits.slice(0, 5).map((h: { similarity: number }) => Number(h.similarity.toFixed(3))) }));
    return hits;
  } catch (err) {
    console.warn(JSON.stringify({ msg: "mason_meaning_search_failed", error: String(err).slice(0, 200) }));
    return [];
  }
}

/**
 * Combine word-search and meaning-search rankings (reciprocal rank fusion): an entry ranked high
 * by either search rises; one ranked high by both rises most. Returns ids, best first, no repeats.
 */
export function fuseRankings(wordIds: readonly string[], meaningIds: readonly string[], limit: number, k = 60): string[] {
  const score = new Map<string, number>();
  const add = (ids: readonly string[]) => ids.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (k + i + 1)));
  add(wordIds);
  add(meaningIds);
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, Math.max(0, limit));
}

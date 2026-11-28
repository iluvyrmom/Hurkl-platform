// HURKL — search Mason's memory by meaning (build map Part A, piece 1).
//
// Each memory entry gets a meaning fingerprint from gte-small, the small model Supabase runs free
// inside Edge Functions (no outside AI call, no bill). Searches use both word matching and
// meaning, combined by rank, so "the drain guy" finds entries that only say "Travis".
//
// One copy, used by the toolbox (search_memory) and by the trio's Memory step in mason-talk.
// Walls (scope, company, status, kind) are applied inside both searches, never after.
// Limits: at most BACKFILL_BATCH fingerprints and BACKFILL_BUDGET_MS per request, so a search can
// never run long; missing fingerprints fill in over the next few searches.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export type Embed = (text: string) => Promise<number[]>;
export type MemoryEntry = { id: string; kind: string; title: string; body: string | null; [k: string]: unknown };
export type SearchFilters = { scope?: string | null; companyId?: string | null; kind?: string | null; includeHistory?: boolean };

export const MEANING_MODEL = "gte-small";
export const DIMENSIONS = 384;
/** Lowest similarity counted as "means the same thing" (1 = identical meaning). Tuned on real entries. */
export const MIN_SIMILARITY = 0.8;
export const BACKFILL_BATCH = 8;
export const BACKFILL_BUDGET_MS = 1200;
const MAX_TEXT = 2000; // gte-small reads about 512 tokens; the start of an entry carries its meaning

/** The words that describe an entry: what kind it is, its title, then its body. */
export function entryText(e: Pick<MemoryEntry, "kind" | "title" | "body">): string {
  return `${e.kind}: ${e.title}\n${e.body ?? ""}`.slice(0, MAX_TEXT).trim();
}

export async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

let session: { run: (t: string, o: Record<string, unknown>) => Promise<unknown> } | null = null;
/**
 * Supabase's built-in gte-small, or null when meaning search is switched off or unavailable.
 * OFF unless the secret MASON_MEANING_SEARCH is "on": on 2026-11-28 a search that fingerprinted
 * several entries hit Supabase's per-request processing limit (HTTP 546), and Supabase logged that
 * built-in inference "is being considered for deprecation". Kept as an off switch, not deleted,
 * while the fingerprint source is decided.
 */
export function builtInEmbed(): Embed | null {
  let on = false;
  // deno-lint-ignore no-explicit-any
  try { on = (globalThis as any).Deno?.env?.get?.("MASON_MEANING_SEARCH") === "on"; } catch { /* no env access: off */ }
  if (!on) return null;
  // deno-lint-ignore no-explicit-any
  const ai = (globalThis as any).Supabase?.ai;
  if (!ai?.Session) return null;
  return async (text: string) => {
    session ??= new ai.Session(MEANING_MODEL);
    const out = await session!.run(text.slice(0, MAX_TEXT), { mean_pool: true, normalize: true });
    const v = Array.from(out as ArrayLike<number>);
    if (v.length !== DIMENSIONS || v.some((x) => !Number.isFinite(x))) throw new Error("bad_embedding");
    return v;
  };
}

/** Give fingerprints to entries that don't have one yet, newest first, within a small time budget. */
export async function fillMissingMeaning(sb: SupabaseClient, embed: Embed, opts: { batch?: number; budgetMs?: number } = {}): Promise<number> {
  const started = Date.now();
  const { data, error } = await sb.rpc("mason_memory_missing_meaning", { p_limit: opts.batch ?? BACKFILL_BATCH });
  if (error || !data?.length) return 0;
  let done = 0;
  for (const e of data as MemoryEntry[]) {
    if (Date.now() - started > (opts.budgetMs ?? BACKFILL_BUDGET_MS)) break;
    if (await saveMeaning(sb, embed, e)) done++;
  }
  return done;
}

/** Fingerprint one entry. Never throws: a missing fingerprint only means word search finds it. */
export async function saveMeaning(sb: SupabaseClient, embed: Embed, e: MemoryEntry): Promise<boolean> {
  try {
    const text = entryText(e);
    const embedding = await embed(text);
    const { error } = await sb.from("mason_memory_meaning").upsert({
      memory_id: e.id, embedding: JSON.stringify(embedding), model: MEANING_MODEL, content_hash: await sha256(text),
    }, { onConflict: "memory_id" });
    if (error) console.warn(JSON.stringify({ msg: "mason_meaning_save_failed", error: error.message.slice(0, 200) }));
    return !error;
  } catch (err) {
    console.warn(JSON.stringify({ msg: "mason_meaning_embed_failed", error: String(err).slice(0, 200) }));
    return false;
  }
}

/** Entry ids closest in meaning to the question, inside the given walls. Empty on any failure. */
export async function meaningHits(sb: SupabaseClient, embed: Embed, query: string, f: SearchFilters, limit: number): Promise<{ id: string; similarity: number }[]> {
  try {
    const embedding = await embed(query);
    const { data, error } = await sb.rpc("mason_memory_meaning_search", {
      p_embedding: JSON.stringify(embedding), p_limit: limit, p_min_similarity: MIN_SIMILARITY,
      p_scope: f.scope ?? null, p_company_id: f.companyId ?? null, p_kind: f.kind ?? null, p_include_history: !!f.includeHistory,
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: { memory_id: string; similarity: number }) => ({ id: r.memory_id, similarity: Number(r.similarity) }));
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

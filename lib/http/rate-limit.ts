/**
 * Best-effort, single-process in-memory rate limiter — a real safety
 * net against basic abuse of public, unauthenticated endpoints (e.g.
 * POST /api/leads), not a distributed/production-grade limiter. A
 * Netlify Function can run as multiple concurrent instances, each with
 * its own copy of this state, so the effective limit under real
 * traffic is "this limit, times however many instances are warm" —
 * documented here rather than silently overclaimed. Revisit with a
 * shared store (e.g. Postgres or Upstash) if abuse becomes real.
 */

interface Bucket {
  count: number;
  windowStartMs: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if the request is allowed, false if the key has exceeded its limit for the current window. */
  allow(key: string, now: number = Date.now()): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStartMs >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStartMs: now });
      return true;
    }
    if (bucket.count >= this.maxRequests) {
      return false;
    }
    bucket.count += 1;
    return true;
  }
}

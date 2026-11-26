// Minimal Stripe REST client + webhook signature check (WebCrypto only, no SDK).
// API version is pinned so response shapes (e.g. invoice.payment_intent) never change underneath us.

export const STRIPE_API_VERSION = "2024-06-20";

export type StripeResult<T = any> = { ok: true; data: T } | { ok: false; status: number; error: string; code?: string };

/** Encode nested params the way Stripe expects: a[b][0][c]=x */
export function formEncode(params: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") out.push(...formEncode(item as Record<string, unknown>, `${key}[${i}]`));
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === "object") {
      out.push(...formEncode(v as Record<string, unknown>, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

export async function stripe<T = any>(
  secretKey: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, unknown> = {},
  idempotencyKey?: string,
): Promise<StripeResult<T>> {
  const body = formEncode(params).join("&");
  const url = `https://api.stripe.com/v1${path}${method === "GET" && body ? `?${body}` : ""}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Stripe-Version": STRIPE_API_VERSION,
        ...(method !== "GET" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: method !== "GET" ? body : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = (json as any)?.error ?? {};
      return { ok: false, status: res.status, error: String(e.message ?? `stripe_${res.status}`).slice(0, 300), code: e.code ?? e.decline_code };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, status: 0, error: "stripe_request: " + String(e).slice(0, 200) };
  }
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Verify a Stripe-Signature header (v1 scheme). Rejects events older than `toleranceSecs`. */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSecs = Math.floor(Date.now() / 1000), toleranceSecs = 300): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length) return false;
  if (Math.abs(nowSecs - t) > toleranceSecs) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${rawBody}`)));
  return sigs.some((s) => safeEqual(s, expected));
}

export function keyMode(secretKey: string): "test" | "live" {
  return secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_") ? "live" : "test";
}

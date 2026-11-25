// Minimal Web Push sender (RFC 8291 aes128gcm payload encryption + RFC 8292 VAPID), WebCrypto only.
// No npm dependencies, so it runs the same in Supabase Edge (Deno) and in Node tests.

export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey }; // publicKey = base64url uncompressed point (65 bytes)
export type PushSubscription = { endpoint: string; p256dh: string; auth: string };

const enc = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/** New VAPID key pair (P-256). */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const privateJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { publicKey: b64urlEncode(raw), privateJwk };
}

/** Encrypt a payload for one subscription (RFC 8291, single record). */
export async function encryptPayload(sub: PushSubscription, payload: Uint8Array, salt?: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(sub.p256dh);
  const authSecret = b64urlDecode(sub.auth);
  salt = salt ?? crypto.getRandomValues(new Uint8Array(16));

  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  // IKM = HKDF(auth, shared, "WebPush: info\0" || ua_public || as_public, 32)
  const prkKey = await hmac(authSecret, shared);
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1]));
  const ikm = (await hmac(prkKey, keyInfo)).slice(0, 32);

  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);

  const plaintext = concat(payload, new Uint8Array([2])); // 0x02 = last record
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, plaintext));

  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

/** VAPID Authorization header value for an endpoint. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, nowSecs = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud, exp: nowSecs + 12 * 3600, sub: subject })));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey("jwk", keys.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${keys.publicKey}`;
}

export type PushResult = { ok: boolean; status: number; gone: boolean; error?: string };

/** Send one notification. `gone` = subscription expired/unsubscribed and should be deleted. */
export async function sendPush(sub: PushSubscription, payload: unknown, keys: VapidKeys, subject: string, ttlSecs = 86400): Promise<PushResult> {
  try {
    const body = await encryptPayload(sub, enc.encode(JSON.stringify(payload)));
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidAuthorization(sub.endpoint, keys, subject),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttlSecs),
        Urgency: "high",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const gone = res.status === 404 || res.status === 410;
    if (!res.ok) return { ok: false, status: res.status, gone, error: (await res.text().catch(() => "")).slice(0, 200) };
    return { ok: true, status: res.status, gone: false };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: String(e).slice(0, 200) };
  }
}

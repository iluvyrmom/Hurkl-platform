// Job Rooms — pure helpers shared by the job-room Edge Function and its tests.
// No Deno- or npm-specific imports, so this file runs the same in Supabase
// Edge (Deno) and in the repo's Vitest suite.

export const PHOTO_BUCKET = "job-room-photos";
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB
export const SIGNED_URL_SECONDS = 15 * 60;
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif"] as const;
export type PhotoType = (typeof ALLOWED_PHOTO_TYPES)[number];

/** Link tokens and guest secrets are 43-char base64url strings. */
export function isSecretShaped(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{40,100}$/.test(value);
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

/**
 * What the browser says the file is. Some Android phones report HEIC photos
 * with an empty type, so fall back to the file name. Anything else is refused.
 */
export function declaredPhotoType(type: unknown, fileName?: unknown): PhotoType | null {
  const t = typeof type === "string" ? type.toLowerCase().trim() : "";
  if (t === "image/jpg") return "image/jpeg";
  if ((ALLOWED_PHOTO_TYPES as readonly string[]).includes(t)) return t as PhotoType;
  if (t === "" || t === "application/octet-stream") {
    const name = typeof fileName === "string" ? fileName.toLowerCase() : "";
    if (/\.(jpe?g)$/.test(name)) return "image/jpeg";
    if (/\.png$/.test(name)) return "image/png";
    if (/\.heic$/.test(name)) return "image/heic";
    if (/\.heif$/.test(name)) return "image/heif";
  }
  return null;
}

const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
  "heif",
]);

/**
 * What the file really is, from its first bytes. A renamed PDF or script with
 * a .jpg name is caught here, not trusted.
 */
export function sniffPhotoType(bytes: Uint8Array): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) {
    return "image/png";
  }
  if (bytes.length >= 12) {
    const box = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    if (box === "ftyp" && HEIF_BRANDS.has(brand)) return "image/heic";
  }
  return null;
}

/** True when the real content matches an allowed type (HEIC and HEIF are one family). */
export function contentMatches(declared: PhotoType, actual: PhotoType | null): boolean {
  if (!actual) return false;
  const family = (t: PhotoType) => (t === "image/heif" ? "image/heic" : t);
  return family(declared) === family(actual);
}

/** Database error codes from the jr_* functions -> words a customer understands. */
const FRIENDLY: Record<string, { status: number; message: string }> = {
  not_found: { status: 404, message: "This link doesn't work. Ask for a new one." },
  link_unavailable: {
    status: 403,
    message: "This link has been turned off or has expired. Ask for a new one.",
  },
  name_needed: { status: 401, message: "Please enter your name first." },
  bad_name: { status: 400, message: "Please enter a name (up to 60 letters)." },
  bad_message: { status: 400, message: "Messages can be up to 2,000 characters." },
  bad_photo_type: { status: 400, message: "Photos only: JPG, PNG, or HEIC." },
  photo_too_big: { status: 400, message: "That photo is over 10 MB. Try a smaller one." },
  rate_limited: {
    status: 429,
    message: "That's a lot at once. Please wait a few minutes and try again.",
  },
  upload_not_found: { status: 404, message: "That upload expired. Please try again." },
  room_not_found: { status: 404, message: "That Job Room wasn't found." },
  message_not_found: { status: 404, message: "That message was already deleted." },
  owner_only: { status: 403, message: "Only the business owner can do that." },
  not_signed_in: { status: 401, message: "Please sign in again." },
  job_rooms_off: { status: 403, message: "Job Rooms isn't turned on for this business." },
  too_many_rooms: { status: 400, message: "You've reached the Job Room limit. Contact HURKL." },
};

export function friendlyError(raw: unknown): { status: number; code: string; message: string } {
  const text = typeof raw === "string" ? raw : ((raw as { message?: string })?.message ?? "");
  for (const [code, info] of Object.entries(FRIENDLY)) {
    if (new RegExp(`\\b${code}\\b`).test(text)) return { code, ...info };
  }
  return { status: 500, code: "server_error", message: "Something went wrong. Please try again." };
}

/**
 * Best-effort per-IP limiter for one function instance. The real limits live
 * in the database (per guest / per room); this just blunts floods cheaply.
 */
export class IpLimiter {
  private hits = new Map<string, { n: number; start: number }>();
  private readonly max: number;
  private readonly windowMs: number;
  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }
  allow(key: string, now = Date.now()): boolean {
    const b = this.hits.get(key);
    if (!b || now - b.start >= this.windowMs) {
      if (this.hits.size > 5000) this.hits.clear();
      this.hits.set(key, { n: 1, start: now });
      return true;
    }
    if (b.n >= this.max) return false;
    b.n += 1;
    return true;
  }
}

export interface RoomMessage {
  id: string;
  author_kind: "owner" | "guest";
  author_name: string | null;
  body: string | null;
  photo_path: string | null;
  photo_mime: string | null;
  created_at: string;
  mine?: boolean;
}

/** What a browser receives for a message: never the storage path, only a short-lived URL. */
export function publicMessage(m: RoomMessage, signed: Map<string, string>) {
  return {
    id: m.id,
    author_kind: m.author_kind,
    author_name: m.author_name ?? "",
    body: m.body,
    photo_url: m.photo_path ? (signed.get(m.photo_path) ?? null) : null,
    photo_type: m.photo_mime,
    created_at: m.created_at,
    mine: Boolean(m.mine),
  };
}

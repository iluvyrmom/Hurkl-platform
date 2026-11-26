// Pure helpers for the Angi lead webhook (no I/O) so they can be unit-tested.

export function text(value: unknown, max = 500): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

export function money(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** US/Canada numbers only for now. Returns E.164 or null. */
export function toE164NorthAmerica(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function minutesOfDay(hhmmss: string): number {
  const [h, m] = hhmmss.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** True if `now` is inside the company's calling window. A window whose start equals its end
 *  (e.g. 00:00–00:00) means "any time, 24/7". */
export function isWithinCallingHours(org: { timezone: string; callback_window_start: string; callback_window_end: string }, now = new Date()): boolean {
  if (minutesOfDay(org.callback_window_start) === minutesOfDay(org.callback_window_end)) return true;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: org.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const current = h * 60 + m;
  return current >= minutesOfDay(org.callback_window_start) && current < minutesOfDay(org.callback_window_end);
}

/** Map Angi's documented payload to HURKL `leads` columns. Unknown fields stay in raw_payload. */
export function mapAngiPayload(p: Record<string, unknown>) {
  const interview = Array.isArray(p.interview)
    ? (p.interview as unknown[]).slice(0, 50).map((qa) => {
        const o = (qa ?? {}) as Record<string, unknown>;
        return { question: text(o.question, 300), answer: text(o.answer, 1000) };
      })
    : null;
  const phoneDetails = (p.primaryPhoneDetails ?? {}) as Record<string, unknown>;
  const firstName = text(p.firstName, 100);
  const lastName = text(p.lastName, 100);
  const fullName = text(p.name, 200) ?? text([firstName, lastName].filter(Boolean).join(" "), 200);
  return {
    external_id: text(p.leadOid, 64),
    name: fullName ?? "Angi customer", // leads.name is NOT NULL
    first_name: firstName,
    last_name: lastName,
    phone: text(p.primaryPhone, 32),
    secondary_phone: text(p.secondaryPhone, 32),
    phone_masked: typeof phoneDetails.maskedNumber === "boolean" ? phoneDetails.maskedNumber : null,
    email: text(p.email, 320),
    service_address: text(p.address, 300),
    city: text(p.city, 120),
    state: text(p.stateProvince, 64),
    postal_code: text(p.postalCode, 20),
    service_requested: text(p.taskName, 200),
    comments: text(p.comments, 4000),
    interview,
    lead_fee: money(p.fee),
  };
}

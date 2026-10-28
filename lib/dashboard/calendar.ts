/**
 * Pure calendar logic for the owner dashboard: building a month grid and
 * validating "block these days" requests. No database, no clock, no
 * framework — everything takes its inputs as arguments so it can be tested
 * without a database.
 *
 * Dates are plain "YYYY-MM-DD" calendar dates with no time zone, matching
 * company_calendar_blocks.service_date and booking_reservations.requested_dates.
 */

export const BLOCK_STATUSES = ["unavailable", "limited"] as const;
export type BlockStatus = (typeof BLOCK_STATUSES)[number];

export const MAX_DAYS_PER_REQUEST = 60;
export const MAX_DAYS_AHEAD = 366;
export const MAX_REASON_LENGTH = 120;

const MS_DAY = 24 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export interface BlockInput {
  service_date: string;
  status: string;
  reason: string | null;
}

export interface BookingInput {
  status: string;
  requested_dates: string[];
  expires_at: string;
  customerName: string;
}

export type DayState = "open" | "limited" | "unavailable";

export interface DayBooking {
  customerName: string;
  paid: boolean;
}

export interface CalendarCell {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  state: DayState;
  reason: string | null;
  bookings: DayBooking[];
}

export interface MonthView {
  month: string; // YYYY-MM
  label: string; // "November 2026"
  prev: string;
  next: string;
  weeks: CalendarCell[][];
}

// ---------- date helpers (UTC, calendar dates only) ----------

export function isValidDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return toDateString(new Date(new Date(`${date}T00:00:00Z`).getTime() + days * MS_DAY));
}

/** Parse "YYYY-MM"; fall back to the month of `fallbackDate` if missing/invalid. */
export function parseMonth(value: string | undefined, fallbackDate: string): string {
  if (value) {
    const m = MONTH_RE.exec(value);
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return value;
  }
  return fallbackDate.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const m = MONTH_RE.exec(month);
  if (!m) return month;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel(month: string): string {
  const m = MONTH_RE.exec(month);
  if (!m) return month;
  return `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}`;
}

/**
 * "Today" for the owner. The company's time zone is not configured anywhere
 * yet, so — like the Overview page — we start from yesterday's UTC date so a
 * job happening this evening is never treated as already past.
 */
export function calendarToday(now: Date): string {
  return toDateString(new Date(now.getTime() - MS_DAY));
}

// ---------- month grid ----------

export function buildMonth(
  month: string,
  blocks: readonly BlockInput[],
  bookings: readonly BookingInput[],
  now: Date,
): MonthView {
  const today = calendarToday(now);
  const first = `${month}-01`;
  const firstDow = new Date(`${first}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const gridStart = addDays(first, -firstDow);

  const blockByDate = new Map(blocks.map((b) => [b.service_date, b]));
  const bookingsByDate = new Map<string, DayBooking[]>();
  for (const booking of bookings) {
    const paid = booking.status === "paid";
    const holding =
      booking.status === "payment_pending" &&
      new Date(booking.expires_at).getTime() > now.getTime();
    if (!paid && !holding) continue;
    for (const date of booking.requested_dates) {
      const list = bookingsByDate.get(date) ?? [];
      list.push({ customerName: booking.customerName, paid });
      bookingsByDate.set(date, list);
    }
  }

  const weeks: CalendarCell[][] = [];
  let cursor = gridStart;
  do {
    const week: CalendarCell[] = [];
    for (let i = 0; i < 7; i += 1) {
      const block = blockByDate.get(cursor);
      week.push({
        date: cursor,
        day: Number(cursor.slice(8, 10)),
        inMonth: cursor.slice(0, 7) === month,
        isToday: cursor === today,
        isPast: cursor < today,
        state: block ? (block.status === "unavailable" ? "unavailable" : "limited") : "open",
        reason: block?.reason ?? null,
        bookings: bookingsByDate.get(cursor) ?? [],
      });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  } while (cursor.slice(0, 7) === month);

  return {
    month,
    label: monthLabel(month),
    prev: shiftMonth(month, -1),
    next: shiftMonth(month, 1),
    weeks,
  };
}

// ---------- block requests ----------

export type BlockRequestResult =
  | { ok: true; dates: string[]; status: BlockStatus; reason: string | null }
  | { ok: false; error: string };

/** Every date from `from` to `to` inclusive. Assumes both are valid and from <= to. */
export function expandRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Validate a "block these days" request. `paidOrHeldDates` are days a
 * customer has already paid for (or is currently paying a deposit for) —
 * those can never be blocked from here, because that would silently
 * double-promise a day. The server is the final authority: the form's own
 * checks are a convenience only.
 */
export function validateBlockRequest(
  raw: { from: string; to: string; status: string; reason: string },
  context: { today: string; paidOrHeldDates: ReadonlySet<string> },
): BlockRequestResult {
  const from = raw.from.trim();
  const to = (raw.to.trim() || from).trim();

  if (!isValidDate(from) || !isValidDate(to)) {
    return { ok: false, error: "Pick a start day and an end day." };
  }
  if (to < from) return { ok: false, error: "The last day can't be before the first day." };
  if (from < context.today) return { ok: false, error: "Those days have already passed." };

  const lastAllowed = addDays(context.today, MAX_DAYS_AHEAD);
  if (to > lastAllowed)
    return { ok: false, error: "That's too far ahead. Pick a date within a year." };

  const dates = expandRange(from, to);
  if (dates.length > MAX_DAYS_PER_REQUEST) {
    return {
      ok: false,
      error: `That's more than ${MAX_DAYS_PER_REQUEST} days at once. Split it into smaller blocks.`,
    };
  }

  if (!(BLOCK_STATUSES as readonly string[]).includes(raw.status)) {
    return { ok: false, error: "Choose whether the day is off or limited." };
  }

  const conflicts = dates.filter((d) => context.paidOrHeldDates.has(d));
  if (conflicts.length > 0) {
    return {
      ok: false,
      error: `A customer has already booked ${conflicts.slice(0, 5).join(", ")}${
        conflicts.length > 5 ? " and more" : ""
      }. Those days can't be blocked here.`,
    };
  }

  const reason = raw.reason.replace(/\s+/g, " ").trim();
  if (reason.length > MAX_REASON_LENGTH) {
    return { ok: false, error: `Keep the note under ${MAX_REASON_LENGTH} characters.` };
  }

  return { ok: true, dates, status: raw.status as BlockStatus, reason: reason || null };
}

/** Dates a customer has paid for or is currently holding with a pending deposit. */
export function paidOrHeldDates(bookings: readonly BookingInput[], now: Date): Set<string> {
  const out = new Set<string>();
  for (const booking of bookings) {
    const paid = booking.status === "paid";
    const holding =
      booking.status === "payment_pending" &&
      new Date(booking.expires_at).getTime() > now.getTime();
    if (!paid && !holding) continue;
    for (const date of booking.requested_dates) out.add(date);
  }
  return out;
}

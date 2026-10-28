/**
 * Pure rules for employee time-off requests. An employee may only (a) ask
 * for a day off, and (b) cancel their own request when they'd rather work
 * that day. The owner decides requests. No database, no clock.
 */
import { addDays, expandRange, isValidDate } from "./calendar";

export const TIME_OFF_STATUSES = ["requested", "approved", "denied", "cancelled"] as const;
export type TimeOffStatus = (typeof TIME_OFF_STATUSES)[number];

export const TIME_OFF_STATUS_LABEL: Readonly<Record<TimeOffStatus, string>> = {
  requested: "Waiting for approval",
  approved: "Approved",
  denied: "Not approved",
  cancelled: "Cancelled",
};

export const MAX_TIME_OFF_DAYS_PER_REQUEST = 14;
export const MAX_TIME_OFF_DAYS_AHEAD = 366;
export const MAX_TIME_OFF_NOTE_LENGTH = 120;

/** Statuses that still count as "this person is (or may be) off that day". */
const ACTIVE: ReadonlySet<string> = new Set(["requested", "approved"]);

export interface TimeOffRow {
  id: string;
  profile_id: string;
  service_date: string;
  status: string;
  note: string | null;
}

export type TimeOffRequestResult =
  { ok: true; dates: string[]; note: string | null } | { ok: false; error: string };

export function validateTimeOffRequest(
  raw: { from: string; to: string; note: string },
  context: { today: string; alreadyActiveDates: ReadonlySet<string> },
): TimeOffRequestResult {
  const from = raw.from.trim();
  const to = (raw.to.trim() || from).trim();
  if (!isValidDate(from) || !isValidDate(to)) {
    return { ok: false, error: "Pick the first day and the last day." };
  }
  if (to < from) return { ok: false, error: "The last day can't be before the first day." };
  if (from < context.today) return { ok: false, error: "Those days have already passed." };
  if (to > addDays(context.today, MAX_TIME_OFF_DAYS_AHEAD)) {
    return { ok: false, error: "That's too far ahead. Pick a date within a year." };
  }
  const all = expandRange(from, to);
  if (all.length > MAX_TIME_OFF_DAYS_PER_REQUEST) {
    return {
      ok: false,
      error: `Ask for up to ${MAX_TIME_OFF_DAYS_PER_REQUEST} days at a time.`,
    };
  }
  const note = raw.note.replace(/\s+/g, " ").trim();
  if (note.length > MAX_TIME_OFF_NOTE_LENGTH) {
    return { ok: false, error: `Keep the note under ${MAX_TIME_OFF_NOTE_LENGTH} characters.` };
  }
  const dates = all.filter((d) => !context.alreadyActiveDates.has(d));
  if (dates.length === 0) {
    return { ok: false, error: "You've already asked for those days off." };
  }
  return { ok: true, dates, note: note || null };
}

/** A person can take back their own request (or approved day) until the day has passed. */
export function canCancelTimeOff(row: TimeOffRow, userId: string, today: string): boolean {
  return row.profile_id === userId && ACTIVE.has(row.status) && row.service_date >= today;
}

/** The owner can decide only requests still waiting, and not ones already in the past. */
export function canDecideTimeOff(row: TimeOffRow, today: string): boolean {
  return row.status === "requested" && row.service_date >= today;
}

export function activeDatesFor(rows: readonly TimeOffRow[], userId: string): Set<string> {
  return new Set(
    rows.filter((r) => r.profile_id === userId && ACTIVE.has(r.status)).map((r) => r.service_date),
  );
}

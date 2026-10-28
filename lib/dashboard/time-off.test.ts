import { describe, expect, it } from "vitest";
import {
  activeDatesFor,
  canCancelTimeOff,
  canDecideTimeOff,
  validateTimeOffRequest,
  type TimeOffRow,
} from "./time-off";

const TODAY = "2026-10-27";
const none = new Set<string>();
const req = (over: Partial<Parameters<typeof validateTimeOffRequest>[0]> = {}) => ({
  from: "2026-11-10",
  to: "2026-11-11",
  note: "Family trip",
  ...over,
});
const row = (over: Partial<TimeOffRow> = {}): TimeOffRow => ({
  id: "r1",
  profile_id: "u1",
  service_date: "2026-11-10",
  status: "requested",
  note: null,
  ...over,
});

describe("validateTimeOffRequest", () => {
  it("expands a range and keeps the note", () => {
    expect(validateTimeOffRequest(req(), { today: TODAY, alreadyActiveDates: none })).toEqual({
      ok: true,
      dates: ["2026-11-10", "2026-11-11"],
      note: "Family trip",
    });
  });
  it("treats a missing last day as one day and a blank note as null", () => {
    const r = validateTimeOffRequest(req({ to: "", note: " " }), {
      today: TODAY,
      alreadyActiveDates: none,
    });
    expect(r).toEqual({ ok: true, dates: ["2026-11-10"], note: null });
  });
  it("rejects bad, backwards, past, too-far and too-long requests", () => {
    const ctx = { today: TODAY, alreadyActiveDates: none };
    expect(validateTimeOffRequest(req({ from: "x" }), ctx).ok).toBe(false);
    expect(validateTimeOffRequest(req({ from: "2026-11-12", to: "2026-11-10" }), ctx).ok).toBe(
      false,
    );
    expect(validateTimeOffRequest(req({ from: "2026-10-01", to: "2026-10-02" }), ctx).ok).toBe(
      false,
    );
    expect(validateTimeOffRequest(req({ from: "2028-01-01", to: "2028-01-02" }), ctx).ok).toBe(
      false,
    );
    expect(validateTimeOffRequest(req({ from: "2026-11-01", to: "2026-11-30" }), ctx).ok).toBe(
      false,
    );
    expect(validateTimeOffRequest(req({ note: "x".repeat(121) }), ctx).ok).toBe(false);
  });
  it("skips days already requested and errors if nothing new is left", () => {
    const some = validateTimeOffRequest(req(), {
      today: TODAY,
      alreadyActiveDates: new Set(["2026-11-10"]),
    });
    expect(some.ok && some.dates).toEqual(["2026-11-11"]);
    const all = validateTimeOffRequest(req(), {
      today: TODAY,
      alreadyActiveDates: new Set(["2026-11-10", "2026-11-11"]),
    });
    expect(all.ok).toBe(false);
  });
});

describe("cancel and decide rules", () => {
  it("lets people cancel only their own waiting or approved future days", () => {
    expect(canCancelTimeOff(row(), "u1", TODAY)).toBe(true);
    expect(canCancelTimeOff(row({ status: "approved" }), "u1", TODAY)).toBe(true);
    expect(canCancelTimeOff(row(), "someone-else", TODAY)).toBe(false);
    expect(canCancelTimeOff(row({ status: "denied" }), "u1", TODAY)).toBe(false);
    expect(canCancelTimeOff(row({ status: "cancelled" }), "u1", TODAY)).toBe(false);
    expect(canCancelTimeOff(row({ service_date: "2026-10-01" }), "u1", TODAY)).toBe(false);
  });
  it("lets the owner decide only waiting, non-past requests", () => {
    expect(canDecideTimeOff(row(), TODAY)).toBe(true);
    expect(canDecideTimeOff(row({ status: "approved" }), TODAY)).toBe(false);
    expect(canDecideTimeOff(row({ service_date: "2026-10-01" }), TODAY)).toBe(false);
  });
  it("only counts a person's own active requests as already asked", () => {
    const rows = [
      row(),
      row({ id: "r2", service_date: "2026-11-11", status: "cancelled" }),
      row({ id: "r3", service_date: "2026-11-12", profile_id: "u2" }),
    ];
    expect([...activeDatesFor(rows, "u1")]).toEqual(["2026-11-10"]);
  });
});

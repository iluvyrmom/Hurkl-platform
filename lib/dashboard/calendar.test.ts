import { describe, expect, it } from "vitest";
import {
  addDays,
  buildMonth,
  calendarToday,
  expandRange,
  isValidDate,
  paidOrHeldDates,
  parseMonth,
  shiftMonth,
  validateBlockRequest,
  type BookingInput,
} from "./calendar";

const NOW = new Date("2026-10-28T12:00:00Z");
const TODAY = calendarToday(NOW); // 2026-10-27 (yesterday UTC)

const paid = (dates: string[], name = "Pat"): BookingInput => ({
  status: "paid",
  requested_dates: dates,
  expires_at: "2026-01-01T00:00:00Z",
  customerName: name,
});
const pending = (dates: string[], expires: string): BookingInput => ({
  status: "payment_pending",
  requested_dates: dates,
  expires_at: expires,
  customerName: "Sam",
});

describe("date helpers", () => {
  it("validates real calendar dates only", () => {
    expect(isValidDate("2026-02-28")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-2-3")).toBe(false);
    expect(isValidDate("nope")).toBe(false);
  });
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("parses months and falls back safely", () => {
    expect(parseMonth("2026-11", "2026-10-27")).toBe("2026-11");
    expect(parseMonth("2026-13", "2026-10-27")).toBe("2026-10");
    expect(parseMonth("junk", "2026-10-27")).toBe("2026-10");
    expect(parseMonth(undefined, "2026-10-27")).toBe("2026-10");
  });
  it("shifts months across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("buildMonth", () => {
  it("builds full Sunday-first weeks that cover the month", () => {
    const view = buildMonth("2026-11", [], [], NOW);
    expect(view.label).toBe("November 2026");
    expect(view.weeks.every((w) => w.length === 7)).toBe(true);
    expect(view.weeks[0][0].date).toBe("2026-11-01"); // Nov 1 2026 is a Sunday
    const inMonth = view.weeks.flat().filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(30);
  });
  it("pads with neighbouring days when the month starts mid-week", () => {
    const view = buildMonth("2026-10", [], [], NOW); // Oct 1 2026 is a Thursday
    expect(view.weeks[0][0].date).toBe("2026-09-27");
    expect(view.weeks[0][0].inMonth).toBe(false);
  });
  it("marks today and past days", () => {
    const view = buildMonth("2026-10", [], [], NOW);
    const cells = view.weeks.flat();
    expect(cells.find((c) => c.date === TODAY)?.isToday).toBe(true);
    expect(cells.find((c) => c.date === "2026-10-20")?.isPast).toBe(true);
    expect(cells.find((c) => c.date === "2026-10-30")?.isPast).toBe(false);
  });
  it("shows blocks as off or limited with their note", () => {
    const view = buildMonth(
      "2026-11",
      [
        { service_date: "2026-11-11", status: "unavailable", reason: "Holiday" },
        { service_date: "2026-11-12", status: "limited", reason: null },
      ],
      [],
      NOW,
    );
    const cells = view.weeks.flat();
    const off = cells.find((c) => c.date === "2026-11-11");
    expect(off?.state).toBe("unavailable");
    expect(off?.reason).toBe("Holiday");
    expect(cells.find((c) => c.date === "2026-11-12")?.state).toBe("limited");
    expect(cells.find((c) => c.date === "2026-11-13")?.state).toBe("open");
  });
  it("shows paid bookings and live deposit holds, but not expired holds", () => {
    const view = buildMonth(
      "2026-11",
      [],
      [
        paid(["2026-11-03", "2026-11-04"]),
        pending(["2026-11-05"], "2026-10-29T00:00:00Z"),
        pending(["2026-11-06"], "2026-10-01T00:00:00Z"),
        { ...paid(["2026-11-07"]), status: "cancelled" },
      ],
      NOW,
    );
    const cells = view.weeks.flat();
    const get = (d: string) => cells.find((c) => c.date === d)!;
    expect(get("2026-11-03").bookings).toEqual([{ customerName: "Pat", paid: true }]);
    expect(get("2026-11-04").bookings).toHaveLength(1);
    expect(get("2026-11-05").bookings).toEqual([{ customerName: "Sam", paid: false }]);
    expect(get("2026-11-06").bookings).toHaveLength(0);
    expect(get("2026-11-07").bookings).toHaveLength(0);
  });
  it("provides previous and next month links", () => {
    const view = buildMonth("2026-01", [], [], NOW);
    expect(view.prev).toBe("2025-12");
    expect(view.next).toBe("2026-02");
  });
});

describe("validateBlockRequest", () => {
  const ctx = { today: TODAY, paidOrHeldDates: new Set<string>() };
  const req = (over: Partial<Parameters<typeof validateBlockRequest>[0]> = {}) => ({
    from: "2026-11-10",
    to: "2026-11-12",
    status: "unavailable",
    reason: "Vacation",
    ...over,
  });

  it("accepts a normal range and expands every day", () => {
    const r = validateBlockRequest(req(), ctx);
    expect(r).toEqual({
      ok: true,
      dates: ["2026-11-10", "2026-11-11", "2026-11-12"],
      status: "unavailable",
      reason: "Vacation",
    });
  });
  it("treats an empty last day as a single day", () => {
    const r = validateBlockRequest(req({ to: "" }), ctx);
    expect(r.ok && r.dates).toEqual(["2026-11-10"]);
  });
  it("stores an empty note as null and collapses spaces", () => {
    expect(validateBlockRequest(req({ reason: "   " }), ctx)).toMatchObject({ reason: null });
    expect(validateBlockRequest(req({ reason: "a   b" }), ctx)).toMatchObject({ reason: "a b" });
  });
  it("rejects invalid, backwards and past dates", () => {
    expect(validateBlockRequest(req({ from: "bad" }), ctx).ok).toBe(false);
    expect(validateBlockRequest(req({ from: "2026-11-12", to: "2026-11-10" }), ctx).ok).toBe(false);
    expect(validateBlockRequest(req({ from: "2026-10-01", to: "2026-10-02" }), ctx).ok).toBe(false);
  });
  it("allows blocking today's date", () => {
    expect(validateBlockRequest(req({ from: TODAY, to: TODAY }), ctx).ok).toBe(true);
  });
  it("caps range length and how far ahead", () => {
    expect(validateBlockRequest(req({ from: "2026-11-01", to: "2027-02-15" }), ctx).ok).toBe(false);
    expect(validateBlockRequest(req({ from: "2028-01-01", to: "2028-01-02" }), ctx).ok).toBe(false);
  });
  it("rejects unknown statuses", () => {
    expect(validateBlockRequest(req({ status: "closed" }), ctx).ok).toBe(false);
  });
  it("rejects over-long notes", () => {
    expect(validateBlockRequest(req({ reason: "x".repeat(121) }), ctx).ok).toBe(false);
  });
  it("refuses to block a day a customer has paid for or is paying for", () => {
    const held = paidOrHeldDates(
      [paid(["2026-11-11"]), pending(["2026-11-12"], "2026-10-29T00:00:00Z")],
      NOW,
    );
    const r = validateBlockRequest(req(), { today: TODAY, paidOrHeldDates: held });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("2026-11-11");
  });
  it("allows blocking over an expired deposit hold", () => {
    const held = paidOrHeldDates([pending(["2026-11-11"], "2026-10-01T00:00:00Z")], NOW);
    expect(validateBlockRequest(req(), { today: TODAY, paidOrHeldDates: held }).ok).toBe(true);
  });
});

describe("expandRange", () => {
  it("is inclusive on both ends", () => {
    expect(expandRange("2026-12-30", "2027-01-01")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
    ]);
  });
});

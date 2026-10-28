import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  ageLabel,
  buildAttention,
  formatCents,
  loadOverview,
  shapeBookings,
  shapeCalendar,
  shapeEscalations,
  shapeLeads,
  shapeMason,
  upcomingCutoff,
  type BookingRow,
  type EscalationRow,
  type LeadRow,
  type Section,
} from "./overview";

const NOW = new Date("2026-10-27T20:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const lead = (over: Partial<LeadRow> = {}): LeadRow => ({
  id: "l1",
  name: "Pat Smith",
  phone: "555-0100",
  email: null,
  status: "new",
  move_date: null,
  pickup_address: null,
  destination_address: null,
  created_at: ago(2 * HOUR),
  ...over,
});

const booking = (over: Partial<BookingRow> = {}): BookingRow => ({
  id: "b1",
  lead_id: "l1",
  requested_dates: ["2026-11-03"],
  status: "paid",
  amount_cents: 15000,
  expires_at: ago(-DAY),
  paid_at: ago(HOUR),
  created_at: ago(2 * HOUR),
  ...over,
});

describe("helpers", () => {
  it("formats cents as dollars, dropping .00 only for whole dollars", () => {
    expect(formatCents(15000)).toBe("$150");
    expect(formatCents(1250)).toBe("$12.50");
    expect(formatCents(0)).toBe("$0");
  });

  it("labels ages", () => {
    expect(ageLabel(ago(10_000), NOW)).toBe("just now");
    expect(ageLabel(ago(5 * 60_000), NOW)).toBe("5m ago");
    expect(ageLabel(ago(3 * HOUR), NOW)).toBe("3h ago");
    expect(ageLabel(ago(2 * DAY), NOW)).toBe("2d ago");
    expect(ageLabel(ago(60 * DAY), NOW)).toBe("2026-08-28");
  });

  it("starts 'upcoming' from yesterday's UTC date so today's job is never hidden", () => {
    expect(upcomingCutoff(NOW)).toBe("2026-10-26");
  });
});

describe("shapeLeads", () => {
  it("counts by status and ignores unknown statuses without crashing", () => {
    const rows = [
      lead({ id: "1" }),
      lead({ id: "2", status: "booked" }),
      lead({ id: "3", status: "weird" }),
    ];
    const s = shapeLeads(rows, NOW);
    expect(s.byStatus).toEqual({ new: 1, contacted: 0, quoted: 0, booked: 1, lost: 0 });
    expect(s.total).toBe(3);
  });

  it("counts leads from the last 7 days only", () => {
    const s = shapeLeads(
      [lead({ created_at: ago(6 * DAY) }), lead({ id: "2", created_at: ago(8 * DAY) })],
      NOW,
    );
    expect(s.newLast7Days).toBe(1);
  });

  it("returns the 8 most recent first", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      lead({ id: `l${i}`, created_at: ago(i * HOUR) }),
    );
    const s = shapeLeads(rows, NOW);
    expect(s.recent).toHaveLength(8);
    expect(s.recent[0].id).toBe("l0");
  });

  it("flags when the query hit its row limit", () => {
    expect(
      shapeLeads(
        Array.from({ length: 1000 }, (_, i) => lead({ id: `${i}` })),
        NOW,
      ).truncated,
    ).toBe(true);
    expect(shapeLeads([lead()], NOW).truncated).toBe(false);
  });
});

describe("shapeEscalations", () => {
  const esc = (over: Partial<EscalationRow> = {}): EscalationRow => ({
    id: "e1",
    reason: "customer_requested_owner_contact",
    customer_summary: "Wants to talk about a piano.",
    status: "open",
    created_at: ago(HOUR),
    ...over,
  });

  it("shows open and acknowledged, hides resolved, and counts only open", () => {
    const s = shapeEscalations(
      [
        esc({ id: "a" }),
        esc({ id: "b", status: "acknowledged" }),
        esc({ id: "c", status: "resolved" }),
      ],
      NOW,
    );
    expect(s.items.map((i) => i.id).sort()).toEqual(["a", "b"]);
    expect(s.openCount).toBe(1);
  });

  it("translates reasons to plain language and tolerates unknown ones", () => {
    const s = shapeEscalations([esc(), esc({ id: "x", reason: "something_new" })], NOW);
    expect(s.items.find((i) => i.id === "e1")?.reasonLabel).toBe("A customer asked to talk to you");
    expect(s.items.find((i) => i.id === "x")?.reasonLabel).toBe("Needs your attention");
  });

  it("shortens long summaries", () => {
    const s = shapeEscalations([esc({ customer_summary: "word ".repeat(100) })], NOW);
    expect(s.items[0].summary.length).toBeLessThanOrEqual(160);
    expect(s.items[0].summary.endsWith("…")).toBe(true);
  });
});

describe("shapeBookings", () => {
  const names = new Map([["l1", "Pat Smith"]]);

  it("totals paid deposits and lists upcoming paid moves, soonest first", () => {
    const s = shapeBookings(
      [
        booking({ id: "late", requested_dates: ["2026-12-01"], amount_cents: 10000 }),
        booking({ id: "soon", requested_dates: ["2026-11-03"], amount_cents: 15000 }),
        booking({ id: "past", requested_dates: ["2026-09-01"], amount_cents: 5000 }),
      ],
      names,
      NOW,
    );
    expect(s.paidCount).toBe(3);
    expect(s.paidCents).toBe(30000);
    expect(s.upcoming.map((u) => u.id)).toEqual(["soon", "late"]);
    expect(s.upcoming[0].customerName).toBe("Pat Smith");
  });

  it("counts a pending deposit only while it has not expired", () => {
    const s = shapeBookings(
      [
        booking({
          id: "live",
          status: "payment_pending",
          expires_at: ago(-HOUR),
          amount_cents: 7000,
        }),
        booking({
          id: "stale",
          status: "payment_pending",
          expires_at: ago(HOUR),
          amount_cents: 9000,
        }),
      ],
      names,
      NOW,
    );
    expect(s.pendingDeposits.map((p) => p.id)).toEqual(["live"]);
    expect(s.pendingCents).toBe(7000);
    expect(s.paidCents).toBe(0);
  });

  it("never counts cancelled, expired or refunded as paid", () => {
    const s = shapeBookings(
      [
        booking({ status: "cancelled" }),
        booking({ id: "r", status: "refunded" }),
        booking({ id: "x", status: "expired" }),
      ],
      names,
      NOW,
    );
    expect(s.paidCents).toBe(0);
    expect(s.refundedCount).toBe(1);
  });

  it("falls back to 'Customer' when the lead is not in the loaded set", () => {
    expect(
      shapeBookings([booking({ lead_id: "unknown" })], names, NOW).upcoming[0].customerName,
    ).toBe("Customer");
  });
});

describe("shapeCalendar", () => {
  it("sorts by date and labels status", () => {
    const items = shapeCalendar([
      { id: "2", service_date: "2026-11-09", status: "unavailable", reason: "Holiday" },
      { id: "1", service_date: "2026-11-02", status: "limited", reason: null },
    ]);
    expect(items.map((i) => [i.date, i.statusLabel])).toEqual([
      ["2026-11-02", "Limited"],
      ["2026-11-09", "Unavailable"],
    ]);
  });
});

describe("shapeMason", () => {
  it("summarizes recent chat activity and AI cost", () => {
    const s = shapeMason(
      [
        { id: "c1", lead_id: "l1", created_at: ago(DAY) },
        { id: "c2", lead_id: null, created_at: ago(2 * DAY) },
        { id: "c3", lead_id: "l2", created_at: ago(20 * DAY) },
      ],
      [
        {
          direction: "outbound",
          model_tier: "low_cost",
          estimated_cost_usd: "0.0100",
          created_at: ago(DAY),
        },
        {
          direction: "outbound",
          model_tier: "advanced_reasoning",
          estimated_cost_usd: 0.05,
          created_at: ago(2 * DAY),
        },
        {
          direction: "inbound",
          model_tier: null,
          estimated_cost_usd: null,
          created_at: ago(2 * DAY),
        },
        {
          direction: "outbound",
          model_tier: "low_cost",
          estimated_cost_usd: 0.4,
          created_at: ago(40 * DAY),
        },
      ],
      NOW,
    );
    expect(s.conversationsLast7Days).toBe(2);
    expect(s.leadsFromChatLast7Days).toBe(1);
    expect(s.messagesLast7Days).toBe(3);
    expect(s.aiCostLast30DaysUsd).toBeCloseTo(0.06, 5);
    expect(s.advancedShareLast30Days).toBeCloseTo(0.5, 5);
  });

  it("reports no advanced share when no AI replies exist, instead of dividing by zero", () => {
    expect(shapeMason([], [], NOW).advancedShareLast30Days).toBeNull();
  });
});

describe("buildAttention", () => {
  const ok = <T>(data: T): Section<T> => ({ ok: true, data });
  const bad = <T>(): Section<T> => ({ ok: false, error: "Couldn't load this section." });
  const emptyLeads = shapeLeads([], NOW);
  const emptyEsc = shapeEscalations([], NOW);
  const emptyBookings = shapeBookings([], new Map(), NOW);

  it("puts Mason's requests first, then deposits, then new leads", () => {
    const attention = buildAttention(
      ok(shapeLeads([lead()], NOW)),
      ok(
        shapeEscalations(
          [
            {
              id: "e",
              reason: "owner_review_requested",
              customer_summary: "Check this.",
              status: "open",
              created_at: ago(HOUR),
            },
          ],
          NOW,
        ),
      ),
      ok(
        shapeBookings(
          [booking({ status: "payment_pending", expires_at: ago(-HOUR) })],
          new Map(),
          NOW,
        ),
      ),
      NOW,
    );
    expect(attention.items.map((i) => i.kind)).toEqual([
      "escalation",
      "deposit_pending",
      "new_lead",
    ]);
    expect(attention.unchecked).toEqual([]);
  });

  it("only lists leads that are still new", () => {
    const attention = buildAttention(
      ok(shapeLeads([lead({ status: "booked" })], NOW)),
      ok(emptyEsc),
      ok(emptyBookings),
      NOW,
    );
    expect(attention.items).toHaveLength(0);
  });

  it("says which sources could not be checked rather than implying all clear", () => {
    const attention = buildAttention(bad(), ok(emptyEsc), bad(), NOW);
    expect(attention.unchecked).toEqual(["Booking deposits", "New leads"]);
    expect(attention.items).toHaveLength(0);
  });

  it("caps the list and reports how many were hidden", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      lead({ id: `l${i}`, created_at: ago(i * HOUR) }),
    );
    const escalations = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      reason: "owner_review_requested",
      customer_summary: "x",
      status: "open",
      created_at: ago(i * HOUR),
    }));
    const attention = buildAttention(
      ok(shapeLeads(rows, NOW)),
      ok(shapeEscalations(escalations, NOW)),
      ok(emptyBookings),
      NOW,
    );
    expect(attention.items).toHaveLength(12);
    expect(attention.hiddenCount).toBe(6);
    void emptyLeads;
  });
});

// ---- loader, with a tiny fake of the Supabase query builder ----

interface FakeTable {
  data?: unknown[] | null;
  error?: { message: string } | null;
}

function fakeSupabase(
  tables: Record<string, FakeTable>,
  calls: Array<{ table: string; eq: Array<[string, unknown]> }> = [],
) {
  return {
    from(table: string) {
      const call = { table, eq: [] as Array<[string, unknown]> };
      calls.push(call);
      const result = tables[table] ?? { data: [] };
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          call.eq.push([column, value]);
          return query;
        },
        in: () => query,
        gte: () => query,
        lte: () => query,
        order: () => query,
        limit: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve),
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

describe("loadOverview", () => {
  const company = { id: "co-1", name: "A-1 Best Moving", slogan: null };

  it("loads every section, scoped to the company", async () => {
    const calls: Array<{ table: string; eq: Array<[string, unknown]> }> = [];
    const overview = await loadOverview(
      fakeSupabase(
        { leads: { data: [lead()] }, booking_reservations: { data: [booking()] } },
        calls,
      ),
      company,
      NOW,
    );
    expect(overview.leads.ok && overview.leads.data.total).toBe(1);
    expect(overview.bookings.ok && overview.bookings.data.paidCents).toBe(15000);
    expect(overview.bookings.ok && overview.bookings.data.upcoming[0].customerName).toBe(
      "Pat Smith",
    );
    const tables = new Set(calls.map((c) => c.table));
    expect(tables).toEqual(
      new Set([
        "leads",
        "owner_escalations",
        "booking_reservations",
        "company_calendar_blocks",
        "conversations",
        "messages",
      ]),
    );
    for (const call of calls) expect(call.eq).toContainEqual(["company_id", "co-1"]);
  });

  it("queries leads once even though two sections need them", async () => {
    const calls: Array<{ table: string; eq: Array<[string, unknown]> }> = [];
    await loadOverview(fakeSupabase({}, calls), company, NOW);
    expect(calls.filter((c) => c.table === "leads")).toHaveLength(1);
  });

  it("a failing section reports an error and does not take down the others", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const overview = await loadOverview(
      fakeSupabase({
        booking_reservations: { error: { message: "boom: secret detail" } },
        leads: { data: [lead()] },
      }),
      company,
      NOW,
    );
    expect(overview.bookings).toEqual({ ok: false, error: "Couldn't load this section." });
    expect(overview.leads.ok).toBe(true);
    expect(overview.attention.unchecked).toContain("Booking deposits");
    // The error message is logged for diagnosis but never put on the page.
    expect(JSON.stringify(overview)).not.toContain("secret detail");
    spy.mockRestore();
  });

  it("a failing leads query marks both leads and booking names as degraded, not zero", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const overview = await loadOverview(
      fakeSupabase({
        leads: { error: { message: "nope" } },
        booking_reservations: { data: [booking()] },
      }),
      company,
      NOW,
    );
    expect(overview.leads.ok).toBe(false);
    expect(overview.bookings.ok && overview.bookings.data.upcoming[0].customerName).toBe(
      "Customer",
    );
    expect(overview.attention.unchecked).toContain("New leads");
    spy.mockRestore();
  });
});

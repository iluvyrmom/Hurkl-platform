import { deepStrictEqual as assertEquals } from "node:assert";
import { isWithinCallingHours, mapAngiPayload, money, text, toE164NorthAmerica } from "./lib.ts";

// Based on Angi's documented Lead Integration API sample fields.
const sampleAngiLead = {
  name: "Jane Doe",
  firstName: "Jane",
  lastName: "Doe",
  address: "123 Main Street",
  city: "Portland",
  stateProvince: "OR",
  postalCode: "97206",
  primaryPhone: "5031234567",
  primaryPhoneDetails: { maskedNumber: false },
  email: "janedoe@example.com",
  srOid: 123456789,
  leadOid: 987654321,
  fee: 25.67,
  taskName: "Repair or Install a Water Heater",
  comments: "Lukewarm water for 3 days",
  matchType: "Lead",
  leadDescription: "Standard",
  spCompanyName: "Executive Drains",
  interview: [{ question: "When do you need this?", answer: "Within 1 week" }],
};

Deno.test("maps Angi payload to lead columns", () => {
  const m = mapAngiPayload(sampleAngiLead);
  assertEquals(m.external_id, "987654321");
  assertEquals(m.name, "Jane Doe");
  assertEquals(m.phone, "5031234567");
  assertEquals(m.state, "OR");
  assertEquals(m.service_requested, "Repair or Install a Water Heater");
  assertEquals(m.lead_fee, 25.67);
  assertEquals(m.phone_masked, false);
  assertEquals(m.interview, [{ question: "When do you need this?", answer: "Within 1 week" }]);
});

Deno.test("missing leadOid maps to null (handler rejects with 400)", () => {
  assertEquals(mapAngiPayload({ name: "x" }).external_id, null);
});

Deno.test("name falls back to first+last, then placeholder (leads.name is NOT NULL)", () => {
  assertEquals(mapAngiPayload({ firstName: "Jo", lastName: "Ray" }).name, "Jo Ray");
  assertEquals(mapAngiPayload({}).name, "Angi customer");
});

Deno.test("address maps to service_address", () => {
  assertEquals(mapAngiPayload(sampleAngiLead).service_address, "123 Main Street");
});

Deno.test("phone normalization", () => {
  assertEquals(toE164NorthAmerica("5031234567"), "+15031234567");
  assertEquals(toE164NorthAmerica("(503) 123-4567"), "+15031234567");
  assertEquals(toE164NorthAmerica("1-503-123-4567"), "+15031234567");
  assertEquals(toE164NorthAmerica("12345"), null);
  assertEquals(toE164NorthAmerica(undefined), null);
});

Deno.test("text trims, truncates, and nulls empties", () => {
  assertEquals(text("  hi  "), "hi");
  assertEquals(text(""), null);
  assertEquals(text(null), null);
  assertEquals(text("abcdef", 3), "abc");
  assertEquals(text(42), "42");
});

Deno.test("money handles strings and junk", () => {
  assertEquals(money("25.674"), 25.67);
  assertEquals(money("abc"), null);
  assertEquals(money(null), null);
  assertEquals(money(undefined), null);
});

Deno.test("calling hours respect org timezone", () => {
  const org = { timezone: "America/Los_Angeles", callback_window_start: "08:00:00", callback_window_end: "20:00:00" };
  // 2026-11-12 18:00 UTC = 10:00 Pacific -> inside
  assertEquals(isWithinCallingHours(org, new Date("2026-11-12T18:00:00Z")), true);
  // 2026-11-12 06:00 UTC = 22:00 Pacific (prev day) -> outside
  assertEquals(isWithinCallingHours(org, new Date("2026-11-12T06:00:00Z")), false);
  // exactly 20:00 Pacific -> outside (end is exclusive)
  assertEquals(isWithinCallingHours(org, new Date("2026-11-13T04:00:00Z")), false);
  // start == end means 24/7: a 3am lead still gets called
  const always = { ...org, callback_window_start: "00:00:00", callback_window_end: "00:00:00" };
  assertEquals(isWithinCallingHours(always, new Date("2026-11-12T11:00:00Z")), true);
  assertEquals(isWithinCallingHours(always, new Date("2026-11-12T06:59:00Z")), true);
});

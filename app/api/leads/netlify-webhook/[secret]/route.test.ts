import { beforeEach, describe, expect, it, vi } from "vitest";

const submitLead = vi.fn();
vi.mock("../../../../../lib/leads/leads", async () => {
  const actual = await vi.importActual<typeof import("../../../../../lib/leads/leads")>(
    "../../../../../lib/leads/leads",
  );
  return { ...actual, submitLead };
});

const fakeSupabase = {};
vi.mock("../../../../../lib/supabase/server", () => ({
  createSupabaseServerClient: async () => fakeSupabase,
}));

const SECRET = "test-secret-abc123";

async function importRoute() {
  return import("./route");
}

function webhookRequest(
  body: unknown,
  { secret = SECRET, ip = "1.2.3.4" }: { secret?: string; ip?: string } = {},
) {
  return {
    request: new Request(`http://localhost/api/leads/netlify-webhook/${secret}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
    context: { params: Promise.resolve({ secret }) },
  };
}

const VALID_NETLIFY_PAYLOAD = {
  data: {
    name: "Jane Prospect",
    phone: "555-123-4567",
    email: "jane@example.com",
    from: "123 Main St, Portland, OR",
    to: "456 Oak Ave, Beaverton, OR",
    move_date: "2026-09-01",
    move_size: "2 Bedroom",
    rooms: "Living room, Kitchen",
    access: "Stairs, no elevator",
    parking: "Street parking only",
    notes: "Piano needs extra care",
    "bot-field": "",
  },
};

beforeEach(() => {
  submitLead.mockReset();
  submitLead.mockResolvedValue("lead-123");
  vi.stubEnv("NEXT_PUBLIC_APP_ENV", "test");
  vi.stubEnv("A1_NETLIFY_WEBHOOK_SECRET", SECRET);
});

describe("POST /api/leads/netlify-webhook/[secret]", () => {
  it("404s when the secret doesn't match", async () => {
    const { POST } = await importRoute();
    const { request, context } = webhookRequest(VALID_NETLIFY_PAYLOAD, { secret: "wrong" });
    const response = await POST(request, context);
    expect(response.status).toBe(404);
    expect(submitLead).not.toHaveBeenCalled();
  });

  it("submits a valid Netlify form payload as a lead for a1-best-moving", async () => {
    const { POST } = await importRoute();
    const { request, context } = webhookRequest(VALID_NETLIFY_PAYLOAD);
    const response = await POST(request, context);
    const body = (await response.json()) as { ok: boolean; leadId: string };

    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.leadId).toBe("lead-123");
    expect(submitLead).toHaveBeenCalledTimes(1);

    const [, submission] = submitLead.mock.calls[0];
    expect(submission.companySlug).toBe("a1-best-moving");
    expect(submission.name).toBe("Jane Prospect");
    expect(submission.pickupAddress).toBe("123 Main St, Portland, OR");
    expect(submission.destinationAddress).toBe("456 Oak Ave, Beaverton, OR");
    expect(submission.moveDate).toBe("2026-09-01");
    expect(submission.inventoryNotes).toBe("Move size: 2 Bedroom; Rooms: Living room, Kitchen");
    expect(submission.accessNotes).toBe("Access: Stairs, no elevator; Parking: Street parking only");
    expect(submission.source).toBe("a1-existing-website");
  });

  it("also accepts a payload wrapped in a top-level payload.data object", async () => {
    const { POST } = await importRoute();
    const { request, context } = webhookRequest({ payload: VALID_NETLIFY_PAYLOAD });
    const response = await POST(request, context);
    expect(response.status).toBe(201);
    expect(submitLead).toHaveBeenCalledTimes(1);
  });

  it("keeps an unparseable move_date in notes instead of dropping it", async () => {
    const { POST } = await importRoute();
    const { request, context } = webhookRequest({
      data: { ...VALID_NETLIFY_PAYLOAD.data, move_date: "next Tuesday" },
    });
    await POST(request, context);

    const [, submission] = submitLead.mock.calls[0];
    expect(submission.moveDate).toBeUndefined();
    expect(submission.notes).toContain("Requested move date (as entered): next Tuesday");
  });

  it("treats a tripped honeypot as spam without calling submitLead", async () => {
    const { POST } = await importRoute();
    const { request, context } = webhookRequest({
      data: { ...VALID_NETLIFY_PAYLOAD.data, "bot-field": "spammer filled this in" },
    });
    const response = await POST(request, context);
    const body = (await response.json()) as { ok: boolean; spam: boolean };

    expect(response.status).toBe(200);
    expect(body.spam).toBe(true);
    expect(submitLead).not.toHaveBeenCalled();
  });

  it("returns 502 (not silently 200) when submitLead throws an unexpected error", async () => {
    submitLead.mockRejectedValueOnce(new Error("connection refused"));
    const { POST } = await importRoute();
    const { request, context } = webhookRequest(VALID_NETLIFY_PAYLOAD);
    const response = await POST(request, context);
    expect(response.status).toBe(502);
  });

  it("rate-limits repeated calls from the same source IP", async () => {
    const { POST } = await importRoute();
    const ip = "10.0.0.9";

    for (let i = 0; i < 20; i++) {
      const { request, context } = webhookRequest(VALID_NETLIFY_PAYLOAD, { ip });
      const response = await POST(request, context);
      expect(response.status).toBe(201);
    }

    const { request, context } = webhookRequest(VALID_NETLIFY_PAYLOAD, { ip });
    const response = await POST(request, context);
    expect(response.status).toBe(429);
  });
});

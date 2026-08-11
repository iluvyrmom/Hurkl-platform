import { beforeEach, describe, expect, it, vi } from "vitest";

const submitLead = vi.fn();
vi.mock("../../../lib/leads/leads", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/leads/leads")>(
    "../../../lib/leads/leads",
  );
  return { ...actual, submitLead };
});

const requireAuthedProfile = vi.fn();
vi.mock("../../../lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/auth/session")>(
    "../../../lib/auth/session",
  );
  return { ...actual, requireAuthedProfile: (...args: unknown[]) => requireAuthedProfile(...args) };
});

const leadsQueryResult = { data: [{ id: "lead-1" }], error: null as { message: string } | null };
const fakeSupabase = {
  from: () => ({
    select: () => ({
      order: async () => leadsQueryResult,
    }),
  }),
};
vi.mock("../../../lib/supabase/server", () => ({
  createSupabaseServerClient: async () => fakeSupabase,
}));

async function importRoute() {
  return import("./route");
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  companySlug: "a1-best-moving",
  name: "Jane Prospect",
  phone: "555-123-4567",
};

beforeEach(() => {
  submitLead.mockReset();
  submitLead.mockResolvedValue("lead-123");
  requireAuthedProfile.mockReset();
  requireAuthedProfile.mockResolvedValue({
    user: { id: "u1" },
    profile: { companyId: "c1", role: "owner" },
  });
});

describe("POST /api/leads", () => {
  it("returns 400 when companySlug is missing", async () => {
    const { POST } = await importRoute();
    const response = await POST(jsonRequest({ name: "Jane" }));
    expect(response.status).toBe(400);
    expect(submitLead).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    const { POST } = await importRoute();
    const response = await POST(jsonRequest({ companySlug: "a1-best-moving" }));
    expect(response.status).toBe(400);
    expect(submitLead).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON", async () => {
    const { POST } = await importRoute();
    const response = await POST(
      new Request("http://localhost/api/leads", { method: "POST", body: "not json" }),
    );
    expect(response.status).toBe(400);
  });

  it("submits a valid lead and returns 201 with the new id", async () => {
    const { POST } = await importRoute();
    const response = await POST(jsonRequest(VALID_BODY, { "x-forwarded-for": "1.2.3.4" }));
    const body = (await response.json()) as { leadId: string };

    expect(response.status).toBe(201);
    expect(body.leadId).toBe("lead-123");
    expect(submitLead).toHaveBeenCalledTimes(1);
  });

  it("maps a LeadValidationError from submitLead to 400", async () => {
    const { LeadValidationError } = await import("../../../lib/leads/leads");
    submitLead.mockRejectedValueOnce(new LeadValidationError("email does not look valid"));

    const { POST } = await importRoute();
    const response = await POST(jsonRequest(VALID_BODY, { "x-forwarded-for": "5.6.7.8" }));

    expect(response.status).toBe(400);
  });

  it("maps an unexpected error to a generic 500 without leaking internals", async () => {
    submitLead.mockRejectedValueOnce(new Error("relation leads does not exist"));

    const { POST } = await importRoute();
    const response = await POST(jsonRequest(VALID_BODY, { "x-forwarded-for": "9.9.9.9" }));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).not.toMatch(/relation/i);
  });

  it("rate-limits repeated submissions from the same IP", async () => {
    const { POST } = await importRoute();
    const ip = "10.0.0.1";

    for (let i = 0; i < 5; i++) {
      const response = await POST(jsonRequest(VALID_BODY, { "x-forwarded-for": ip }));
      expect(response.status).toBe(201);
    }

    const sixth = await POST(jsonRequest(VALID_BODY, { "x-forwarded-for": ip }));
    expect(sixth.status).toBe(429);
  });

  it("does not rate-limit a different IP", async () => {
    const { POST } = await importRoute();
    for (let i = 0; i < 5; i++) {
      await POST(jsonRequest(VALID_BODY, { "x-forwarded-for": "20.0.0.1" }));
    }
    const response = await POST(jsonRequest(VALID_BODY, { "x-forwarded-for": "20.0.0.2" }));
    expect(response.status).toBe(201);
  });
});

describe("GET /api/leads", () => {
  it("requires an authenticated profile", async () => {
    const { UnauthorizedError } = await import("../../../lib/auth/session");
    requireAuthedProfile.mockRejectedValueOnce(new UnauthorizedError());

    const { GET } = await importRoute();
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns the caller's company leads", async () => {
    const { GET } = await importRoute();
    const response = await GET();
    const body = (await response.json()) as { leads: { id: string }[] };

    expect(response.status).toBe(200);
    expect(body.leads).toEqual([{ id: "lead-1" }]);
  });
});

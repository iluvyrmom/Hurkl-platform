import { describe, expect, it, vi } from "vitest";
import {
  NoCompanyError,
  UnauthorizedError,
  requireAuthedProfile,
  requireAuthedUser,
  requireCompanyProfile,
} from "./session";

function fakeSupabase(options: {
  user?: { id: string } | null;
  authError?: object | null;
  profile?: { company_id: string | null; role: string } | null;
  profileError?: object | null;
}) {
  const getUser = vi.fn().mockResolvedValue({
    data: { user: options.user ?? null },
    error: options.authError ?? null,
  });
  const single = vi.fn().mockResolvedValue({
    data: options.profile ?? null,
    error: options.profileError ?? null,
  });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return { auth: { getUser }, from } as never;
}

describe("requireAuthedUser", () => {
  it("returns the user when signed in", async () => {
    const supabase = fakeSupabase({ user: { id: "user-1" } });
    const user = await requireAuthedUser(supabase);
    expect(user).toEqual({ id: "user-1" });
  });

  it("throws UnauthorizedError when there is no user", async () => {
    const supabase = fakeSupabase({ user: null });
    await expect(requireAuthedUser(supabase)).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError when auth.getUser() errors", async () => {
    const supabase = fakeSupabase({ user: null, authError: { message: "expired" } });
    await expect(requireAuthedUser(supabase)).rejects.toThrow(UnauthorizedError);
  });
});

describe("requireCompanyProfile", () => {
  it("returns companyId and role when the profile has a company", async () => {
    const supabase = fakeSupabase({ profile: { company_id: "company-1", role: "owner" } });
    const profile = await requireCompanyProfile(supabase, "user-1");
    expect(profile).toEqual({ companyId: "company-1", role: "owner" });
  });

  it("throws NoCompanyError when the profile has no company_id", async () => {
    const supabase = fakeSupabase({ profile: { company_id: null, role: "owner" } });
    await expect(requireCompanyProfile(supabase, "user-1")).rejects.toThrow(NoCompanyError);
  });

  it("throws NoCompanyError when no profile row exists at all", async () => {
    const supabase = fakeSupabase({ profile: null });
    await expect(requireCompanyProfile(supabase, "user-1")).rejects.toThrow(NoCompanyError);
  });
});

describe("requireAuthedProfile", () => {
  it("composes requireAuthedUser and requireCompanyProfile", async () => {
    const supabase = fakeSupabase({
      user: { id: "user-1" },
      profile: { company_id: "company-1", role: "manager" },
    });
    const { user, profile } = await requireAuthedProfile(supabase);
    expect(user).toEqual({ id: "user-1" });
    expect(profile).toEqual({ companyId: "company-1", role: "manager" });
  });

  it("throws UnauthorizedError before ever checking for a company", async () => {
    const supabase = fakeSupabase({ user: null });
    await expect(requireAuthedProfile(supabase)).rejects.toThrow(UnauthorizedError);
  });
});

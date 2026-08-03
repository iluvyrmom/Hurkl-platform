import { describe, expect, it } from "vitest";
import { authErrorResponse } from "./http-errors";
import { PermissionDeniedError } from "./roles";
import { NoCompanyError, UnauthorizedError } from "./session";

describe("authErrorResponse", () => {
  it("maps UnauthorizedError to 401", async () => {
    const response = authErrorResponse(new UnauthorizedError());
    expect(response?.status).toBe(401);
  });

  it("maps NoCompanyError to 403", async () => {
    const response = authErrorResponse(new NoCompanyError());
    expect(response?.status).toBe(403);
  });

  it("maps PermissionDeniedError to 403", async () => {
    const response = authErrorResponse(
      new PermissionDeniedError({ role: "employee" }, "change_pricing"),
    );
    expect(response?.status).toBe(403);
  });

  it("returns null for an unrelated error, so the caller rethrows it", () => {
    expect(authErrorResponse(new Error("something else"))).toBeNull();
  });
});

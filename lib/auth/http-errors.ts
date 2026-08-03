import { NextResponse } from "next/server";
import { PermissionDeniedError } from "./roles";
import { NoCompanyError, UnauthorizedError } from "./session";

/**
 * Maps the known auth/permission error types to a clear, non-sensitive
 * HTTP response — used by every API route so error handling stays
 * consistent instead of each route inventing its own status mapping.
 * Returns null (meaning "not one of these, rethrow") for anything else.
 */
export function authErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (error instanceof NoCompanyError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof PermissionDeniedError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return null;
}

/**
 * Phase 1 ships one seeded business record for local development/demo —
 * not a hardcoded platform assumption. A real onboarding flow (business
 * settings in app/settings) is how this gets replaced per business; nothing
 * downstream imports "A-1" or "Portland" as a constant outside this file
 * and the seed data in lib/repository/facility-repository.ts.
 */
export const DEFAULT_BUSINESS = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "A-1 Dump Runs",
  slug: "a1-dump-runs",
  phone: "",
  email: "",
  primaryAddress: "Portland, OR",
  primaryLatitude: 45.5152,
  primaryLongitude: -122.6784,
  brandPrimaryColor: "#0b2545",
  brandAccentColor: "#f26522",
};

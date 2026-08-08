/**
 * Phase 1 ships one seeded business record for local development/demo —
 * not a hardcoded platform assumption. A real onboarding flow (business
 * settings in app/settings) is how this gets replaced per business; nothing
 * downstream imports "A-1" or "Portland" as a constant outside this file
 * and the seed data in lib/repository/facility-repository.ts.
 *
 * Name, phone, email, and tagline below were supplied directly by the
 * business owner and applied as given. `brandPrimaryColor`/
 * `brandAccentColor` come from real A-1 Best Moving LLC logo artwork the
 * owner supplied directly in-session (black/gold, "The best move you'll
 * make.") — a close visual match to the logo's metallic gold and near-black,
 * not a vendor-issued hex spec. See `app/globals.css`'s `@theme` block,
 * which these two values must stay in sync with.
 */
export const DEFAULT_BUSINESS = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "A-1 Best Moving",
  slug: "a1-best-moving",
  phone: "971-777-6660",
  email: "A1BESTMOVING@gmail.com",
  tagline: "The best move you'll make.",
  primaryAddress: "Portland, OR",
  primaryLatitude: 45.5152,
  primaryLongitude: -122.6784,
  brandPrimaryColor: "#141414",
  brandAccentColor: "#d4a72c",
};

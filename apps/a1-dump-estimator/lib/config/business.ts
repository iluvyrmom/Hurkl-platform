/**
 * Phase 1 ships one seeded business record for local development/demo —
 * not a hardcoded platform assumption. A real onboarding flow (business
 * settings in app/settings) is how this gets replaced per business; nothing
 * downstream imports "A-1" or "Portland" as a constant outside this file
 * and the seed data in lib/repository/facility-repository.ts.
 *
 * Name, phone, email, and tagline below were supplied directly by the
 * business owner and applied as given. `brandPrimaryColor`/
 * `brandAccentColor` are still a placeholder palette — this session could
 * not reach a1bestmoving.com (blocked by the site's own bot protection, not
 * a source we control) to confirm real brand hex codes, so the exact colors
 * are unverified. Swap them for the real values in `app/globals.css`'s
 * `@theme` block once supplied, and update the two color fields below to
 * match.
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
  // Placeholder — see file comment above. Not yet confirmed against A-1's
  // real brand assets.
  brandPrimaryColor: "#0b2545",
  brandAccentColor: "#f26522",
};

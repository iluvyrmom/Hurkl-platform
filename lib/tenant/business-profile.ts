/**
 * Tenant business-profile shape. This is a dev-time convenience for
 * seeding a local tenant during this build — it is NOT the production
 * tenant-configuration system. That's Phase 3 (`ROADMAP.md`): a real
 * `companies`/config table plus an owner-facing settings UI so the
 * owner "should be able to update this information without editing
 * source code" (per the founder's master prompt). Loading from a
 * git-ignored local JSON file is a placeholder for that, not a
 * substitute for it.
 */
import { existsSync, readFileSync } from "node:fs";

export interface BusinessOperatingRules {
  foremenHandleMoney: boolean;
  foremenChangePricing: boolean;
  foremenIssueDiscounts: boolean;
  invoiceCreatedBy: "mason_or_owner" | "owner_only";
  invoiceAutoEmailAfterValidation: boolean;
  invoiceOwnerCanTextOneAction: boolean;
  paymentGoesDirectlyToBusiness: boolean;
}

export interface BusinessProfileConfig {
  businessName: string;
  slogan?: string;
  phone: string;
  email: string;
  operatingRules: BusinessOperatingRules;
}

/**
 * Loads a tenant seed file from supabase/seed/<name>.json (git-ignored
 * — never the real file in this repo). Throws with a clear message
 * pointing at the .example.json template if the real file doesn't
 * exist locally yet, rather than silently falling back to placeholder
 * business data that could be mistaken for real configuration.
 */
export function loadBusinessProfileSeed(name: string, seedDir: string): BusinessProfileConfig {
  const path = `${seedDir}/${name}.json`;
  if (!existsSync(path)) {
    throw new Error(
      `No local seed file at ${path}. Copy ${seedDir}/${name}.example.json to ${path} and fill in real values — it's git-ignored and never committed (see .gitignore and CLAUDE.md's "Protect secrets").`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as BusinessProfileConfig;
}

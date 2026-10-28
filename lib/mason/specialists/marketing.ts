/**
 * Definition of the Marketing HAL specialist, following the shared
 * contract in lib/domain/hal.ts. A definition only: permissions and limits
 * written down so they can be enforced and audited. It makes no AI call.
 *
 * What Marketing is for: helping a company get found and chosen, in that
 * company's own voice. What it is NOT allowed to do, by construction: publish,
 * send, contact anyone, or spend money. It drafts. Drafts go Critic -> Mason ->
 * owner, and putting anything in front of the public is "Approval Required"
 * (SECURITY.md section 4) and needs a verified channel integration that does
 * not exist yet.
 *
 * Company-specific facts (services, claims such as licensed or insured, offers,
 * voice) are NOT written here. They come from each company's own Company
 * Package; a claim true for one company must never become global behavior.
 *
 * The reasoning behind how Mason decides WHAT to promote and WHEN is private
 * (see CLAUDE.md: proprietary growth methods stay out of this public repo).
 */
import type { SpecialistDefinition } from "../../domain/hal";

/**
 * Where a draft may be aimed. Deliberately contains only channels the company
 * owns or customers have opted into: there is no cold text, cold email, or
 * direct-message outreach channel. Adding one needs a platform-rules and legal
 * check first (CLAUDE.md, growth/outreach permanent rule).
 */
export const MARKETING_CHANNELS = [
  "website_copy",
  "business_profile_post",
  "social_post",
  "ad_copy",
  "review_request",
  "customer_email",
] as const;

export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

/** Channels that ask for nothing new from the market, so they stay allowed when the company is full. */
export const MAINTENANCE_CHANNELS: readonly MarketingChannel[] = ["review_request"];

export const MARKETING_DEFINITION: SpecialistDefinition = {
  type: "marketing_specialist",
  mission:
    "Help the company get found and chosen by the right customers, in the company's own voice, without promising anything the owner has not approved.",
  responsibility:
    "Draft website copy, posts, ads, review requests and customer emails from the company's verified facts. Never publishes, sends, contacts anyone, or spends money.",
  permissions: ["read_company_package", "draft_marketing_content"],
  requiredEvidenceCategories: ["verified_company_claims", "approved_offers", "brand_voice"],
  escalationTriggers: [
    "missing_required_evidence",
    "outside_approved_permissions",
    "exceeds_execution_limits",
    "strategic_decision_detected",
  ],
  executionLimits: { maxRequestsPerConversation: 10, maxConcurrentExecutions: 1 },
  auditRequired: true,
};

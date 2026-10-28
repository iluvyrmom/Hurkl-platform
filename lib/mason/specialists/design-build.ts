/**
 * Definitions for the Designer and Builder HAL specialists, following
 * the shared contract in lib/domain/hal.ts. These are definitions
 * only — permissions and limits written down so they can be enforced
 * and audited. Neither specialist makes an AI call here, and neither
 * has any permission to deploy to production: shipping is reachable
 * only through lib/mason/work-pipeline.ts (Designer sign-off, Critic
 * pass, then founder approval).
 *
 * Company-specific looks (colors, fonts, logos) are NOT written here.
 * They come from each company's own Company Package — a brand that is
 * true for one company must never become global Mason behavior.
 */
import type { SpecialistDefinition } from "../../domain/hal";

/** What the Designer must confirm, item by item, before it can sign off. */
export const DESIGN_CHECKLIST = [
  "phone_first_layout",
  "readable_text",
  "tap_targets",
  "loading_empty_error_states",
  "no_developer_language",
  "matches_company_brand",
] as const;

export type DesignChecklistItem = (typeof DESIGN_CHECKLIST)[number];

export const BUILDER_DEFINITION: SpecialistDefinition = {
  type: "builder_specialist",
  mission:
    "Build the requested change as a small, reviewable piece of work that protects everything already working.",
  responsibility:
    "Read the existing code first, build the change on a branch, and hand it off with proof. Never ships.",
  permissions: ["read_codebase", "write_code_to_branch", "publish_private_preview"],
  requiredEvidenceCategories: [
    "what_was_found",
    "what_changed",
    "what_was_tested",
    "screenshots",
    "remaining_risk",
  ],
  escalationTriggers: [
    "exceeds_execution_limits",
    "outside_approved_permissions",
    "missing_required_evidence",
  ],
  executionLimits: { maxRequestsPerConversation: 20, maxConcurrentExecutions: 1 },
  auditRequired: true,
};

export const DESIGNER_DEFINITION: SpecialistDefinition = {
  type: "designer_specialist",
  mission: "Make sure everything looks right and works on a phone before it can go further.",
  responsibility:
    "Review the Builder's work against the company's brand and the design checklist. Signs off or sends back specific changes. Never edits code and never signs off on its own work.",
  permissions: ["read_codebase", "view_private_preview", "record_design_decision"],
  requiredEvidenceCategories: ["phone_screenshot", "company_brand_standard"],
  escalationTriggers: ["missing_required_evidence", "outside_approved_permissions"],
  executionLimits: { maxRequestsPerConversation: 10, maxConcurrentExecutions: 1 },
  auditRequired: true,
};

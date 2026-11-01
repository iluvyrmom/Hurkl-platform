/**
 * Definition of the Support HAL specialist, following the shared contract in
 * lib/domain/hal.ts. A definition only: permissions and limits written down so
 * they can be enforced and audited. It makes no AI call.
 *
 * What Support is for: helping the owner answer customers who already wrote in,
 * quickly and in the company's own voice. What it is NOT allowed to do, by
 * construction: send anything, promise anything, admit fault, offer refunds or
 * compensation, give legal or insurance answers, or decide a complaint. It
 * drafts a reply for the owner. Anything sensitive is handed to the owner
 * untouched. Sending a reply is Approval Required (SECURITY.md section 4) and
 * no sending integration is connected to this specialist.
 *
 * Company-specific facts (prices, policies, hours) are NOT written here. They
 * come from each company's own Company Package.
 */
import type { SpecialistDefinition } from "../../domain/hal";

export const SUPPORT_DEFINITION: SpecialistDefinition = {
  type: "support_specialist",
  mission:
    "Help the owner answer customer questions quickly and honestly, in the company's own voice, without promising anything the owner has not approved.",
  responsibility:
    "Draft replies to customers who already wrote in, for the owner to approve. Hand sensitive messages (damage, refunds, injury, legal, complaints) to the owner untouched. Never sends, never promises, never admits fault.",
  permissions: ["read_company_package", "draft_customer_reply"],
  requiredEvidenceCategories: [
    "verified_company_policies",
    "verified_company_prices",
    "brand_voice",
  ],
  escalationTriggers: [
    "missing_required_evidence",
    "outside_approved_permissions",
    "exceeds_execution_limits",
  ],
  executionLimits: { maxRequestsPerConversation: 10, maxConcurrentExecutions: 1 },
  auditRequired: true,
};

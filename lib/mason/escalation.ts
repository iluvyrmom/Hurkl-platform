/**
 * Deterministic signals for when Mason should stop trying to resolve a
 * conversation turn purely with a reply and instead create a real,
 * durable owner-action item — see
 * supabase/migrations/00000000000009_mason_discount_authority_and_escalations.sql's
 * `owner_escalations` table. Keyword-based on purpose: cheap,
 * synchronous, testable without a model call, matching
 * lib/mason/task-classification.ts's existing style — not a trained
 * classifier.
 *
 * The point of these functions is NOT to decide what Mason says (that
 * stays the model's job, shaped by lib/mason/system-prompt.ts) — it's
 * to guarantee a real record exists for the owner even if the model's
 * free-text reply doesn't fully capture that a human needs to look at
 * this, per the founder's "capture the customer's information and
 * create an owner-action/escalation item... rather than immediately
 * telling the customer to call the owner" instruction.
 */

const EXPLICIT_OWNER_CONTACT_SIGNALS = [
  "owner's number",
  "owners number",
  "owner's phone",
  "owners phone",
  "phone number",
  "speak to the owner",
  "talk to the owner",
  "speak with the owner",
  "talk with the owner",
  "speak to a person",
  "talk to a person",
  "speak to a human",
  "talk to a human",
  "real person",
  "manager's number",
  "managers number",
  "call you back",
  "your email",
  "email address",
];

/** True when the customer's message itself is asking for the owner/a person/direct contact — see system-prompt.ts's use of this as permission to answer, not as an escalation trigger on its own. */
export function customerExplicitlyRequestedOwnerContact(text: string): boolean {
  const lower = text.toLowerCase();
  return EXPLICIT_OWNER_CONTACT_SIGNALS.some((phrase) => lower.includes(phrase));
}

const OWNER_APPROVAL_SIGNALS = [
  "damage",
  "broke",
  "broken",
  "injur",
  "insurance",
  "claim",
  "lawsuit",
  "sue",
  "attorney",
  "lawyer",
  "complaint",
  "refund",
  "compensat",
  "unhappy",
  "unacceptable",
  "cancel my",
  "legal",
];

/** True when the message describes something genuinely beyond routine intake/FAQ handling — a real owner decision, not just an uncertain answer. */
export function requiresOwnerApproval(text: string): boolean {
  const lower = text.toLowerCase();
  return OWNER_APPROVAL_SIGNALS.some((phrase) => lower.includes(phrase));
}

export type EscalationReason =
  | "unsupported_pricing_claim_blocked"
  | "owner_review_requested"
  | "customer_requested_owner_contact";

export interface EscalationInput {
  companyId: string;
  conversationId: string;
  reason: EscalationReason;
  customerSummary: string;
}

/**
 * Minimal shape this function needs from a Supabase client — same
 * pattern as lib/audit/log.ts's AuditLogWriter, so this stays
 * structurally compatible with both the real client and a test double.
 */
export interface EscalationWriter {
  from(table: "owner_escalations"): {
    insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  };
}

export async function recordOwnerEscalation(
  client: EscalationWriter,
  input: EscalationInput,
): Promise<void> {
  const { error } = await client.from("owner_escalations").insert({
    company_id: input.companyId,
    conversation_id: input.conversationId,
    reason: input.reason,
    customer_summary: input.customerSummary,
  });

  if (error) {
    throw new Error(`Failed to record owner escalation: ${error.message}`);
  }
}

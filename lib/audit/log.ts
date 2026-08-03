/**
 * Audit log recording — see SECURITY.md §6. Every meaningful autonomous
 * action Mason takes must be recorded here: which tenant, what action,
 * which autonomy tier it fell under, why, and what data it touched.
 *
 * The table itself (public.audit_log) has no UPDATE or DELETE RLS
 * policy — see supabase/migrations/00000000000002_customers_and_audit_log.sql
 * — so it is structurally append-only regardless of what this function
 * does; this module is the one recommended way to insert into it so
 * every call site shapes the row consistently.
 */

export type AutonomyTier =
  "tier_1_automatic" | "tier_2_approval_required" | "tier_3_never_autonomous";

export interface AuditLogEntry {
  companyId: string;
  actorUserId?: string;
  action: string;
  autonomyTier: AutonomyTier;
  /** Which policy/threshold applied — SECURITY.md §6 requires this. */
  policyReference?: string;
  subjectType?: string;
  subjectId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Minimal shape this function needs from a Supabase client — matches
 * both the real @supabase/supabase-js client and a test double, without
 * this module depending on the full SDK's types.
 */
export interface AuditLogWriter {
  from(table: "audit_log"): {
    // PromiseLike, not Promise: Supabase's query builder is thenable but
    // not a strict Promise (it's also chainable with .select() etc.), so
    // this stays structurally compatible with the real client as well as
    // a plain test double.
    insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  };
}

export async function recordAuditLogEntry(
  client: AuditLogWriter,
  entry: AuditLogEntry,
): Promise<void> {
  const { error } = await client.from("audit_log").insert({
    company_id: entry.companyId,
    actor_user_id: entry.actorUserId ?? null,
    action: entry.action,
    autonomy_tier: entry.autonomyTier,
    policy_reference: entry.policyReference ?? null,
    subject_type: entry.subjectType ?? null,
    subject_id: entry.subjectId ?? null,
    metadata: entry.metadata ?? {},
  });

  if (error) {
    throw new Error(`Failed to record audit log entry: ${error.message}`);
  }
}

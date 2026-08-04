import type { AccountType } from "./authorization";

export class NotHurklAdminError extends Error {
  constructor(message = "Only a HURKL admin may change a company's account type") {
    super(message);
    this.name = "NotHurklAdminError";
  }
}

/**
 * Minimal shape this function needs from a Supabase client — matches
 * both the real @supabase/supabase-js client and a test double.
 */
export interface AccountTypeRpcClient {
  rpc(
    fn: "set_company_account_type",
    args: { p_company_id: string; p_new_account_type: string },
  ): PromiseLike<{ error: { message: string } | null }>;
}

/**
 * The one admin-only workflow for reclassifying a company (Production
 * Customer / Internal HURKL / Demo / Development / Partner). Deliberately
 * not exposed to customers, and deliberately not a bare table UPDATE —
 * calls the `set_company_account_type` SECURITY DEFINER function
 * (supabase/migrations/00000000000005_company_account_types.sql), which
 * checks `is_hurkl_admin()` inside the database itself. Passing a
 * regular tenant-scoped client here will simply fail with
 * NotHurklAdminError — the authorization is enforced server-side
 * regardless of what this function's caller believes about the
 * current user's role.
 */
export async function setCompanyAccountType(
  client: AccountTypeRpcClient,
  companyId: string,
  newAccountType: AccountType,
): Promise<void> {
  const { error } = await client.rpc("set_company_account_type", {
    p_company_id: companyId,
    p_new_account_type: newAccountType,
  });

  if (error) {
    if (/hurkl admin/i.test(error.message)) {
      throw new NotHurklAdminError();
    }
    throw new Error(`Failed to change company account type: ${error.message}`);
  }
}

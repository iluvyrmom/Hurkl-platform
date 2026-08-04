/**
 * Role-based permissions — see SECURITY.md §3 (RBAC roles) and §4
 * (autonomy tiers, which this complements: a permission says WHO may
 * ever take an action; an autonomy tier says whether Mason may take it
 * WITHOUT asking first).
 *
 * The five roles here are the platform's own authorization primitive
 * (they're what public.profiles.role actually stores — see
 * supabase/migrations/00000000000001_tenant_foundation.sql). Business-
 * specific job titles (foreman, dispatcher, accountant, and so on) are
 * tenant configuration layered on top of "employee" or "manager", never
 * new hardcoded platform roles — PRODUCT.md's platform-neutrality rule
 * applies to authorization the same way it applies to everything else.
 */

export type UserRole = "hurkl_admin" | "owner" | "manager" | "employee" | "customer";

export const USER_ROLES: readonly UserRole[] = [
  "hurkl_admin",
  "owner",
  "manager",
  "employee",
  "customer",
];

export type Permission =
  | "view_customer_data"
  | "edit_customer_data"
  | "view_pricing"
  | "change_pricing"
  | "create_invoice"
  | "approve_invoice"
  | "send_invoice"
  | "issue_discount"
  | "issue_refund"
  | "view_payments"
  | "manage_scheduling"
  | "change_employee_assignments"
  | "view_payroll"
  | "access_private_owner_notes"
  | "approve_high_risk_action";

/**
 * Default-least-privilege base grant per role. Deliberately does NOT
 * include any financial permission for "employee" — see
 * EMPLOYEE_FINANCIAL_PERMISSIONS below for why that needs a separate,
 * explicit, per-employee grant rather than a role-wide default.
 */
const BASE_ROLE_PERMISSIONS: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {
  // Platform operator: billing/incidents/abuse only. No default access
  // to any tenant's customer data (SECURITY.md §3).
  hurkl_admin: new Set([]),
  owner: new Set<Permission>([
    "view_customer_data",
    "edit_customer_data",
    "view_pricing",
    "change_pricing",
    "create_invoice",
    "approve_invoice",
    "send_invoice",
    "issue_discount",
    "issue_refund",
    "view_payments",
    "manage_scheduling",
    "change_employee_assignments",
    "view_payroll",
    "access_private_owner_notes",
    "approve_high_risk_action",
  ]),
  // Owner-delegated subset. No payroll and no private owner notes by
  // default — those require an explicit owner grant, same discipline
  // as employee financial permissions below.
  manager: new Set<Permission>([
    "view_customer_data",
    "edit_customer_data",
    "view_pricing",
    "create_invoice",
    "send_invoice",
    "view_payments",
    "manage_scheduling",
    "change_employee_assignments",
  ]),
  // Narrow, job-scoped: schedule, assigned job/customer details, status
  // updates — no payroll, no other employees' data, no financial
  // controls (SECURITY.md §3; matches the master prompt's foreman
  // restriction: "Foremen report job facts, foremen do not handle
  // money").
  employee: new Set<Permission>(["view_customer_data", "manage_scheduling"]),
  customer: new Set([]),
};

/**
 * Financial permissions an employee may be individually granted by the
 * owner — never on by default. Modeling this as a separate grant
 * (rather than folding it into the "employee" role's base set) is what
 * makes "foremen don't handle money unless the owner explicitly says
 * so" actually enforceable per employee, not just per role.
 */
export type EmployeeFinancialGrant = Extract<
  Permission,
  "change_pricing" | "issue_discount" | "issue_refund" | "create_invoice" | "approve_invoice"
>;

export interface RoleContext {
  role: UserRole;
  /** Only meaningful when role === "employee". Defaults to none. */
  employeeFinancialGrants?: readonly EmployeeFinancialGrant[];
}

export function roleHasPermission(context: RoleContext, permission: Permission): boolean {
  if (BASE_ROLE_PERMISSIONS[context.role].has(permission)) {
    return true;
  }
  if (context.role === "employee") {
    const grants = context.employeeFinancialGrants ?? [];
    return (grants as readonly Permission[]).includes(permission);
  }
  return false;
}

export class PermissionDeniedError extends Error {
  constructor(
    public readonly context: RoleContext,
    public readonly permission: Permission,
  ) {
    super(`Role "${context.role}" does not have permission "${permission}".`);
    this.name = "PermissionDeniedError";
  }
}

export function assertPermission(context: RoleContext, permission: Permission): void {
  if (!roleHasPermission(context, permission)) {
    throw new PermissionDeniedError(context, permission);
  }
}

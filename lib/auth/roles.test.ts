import { describe, expect, it } from "vitest";
import { PermissionDeniedError, assertPermission, roleHasPermission } from "./roles";

describe("roleHasPermission", () => {
  it("gives the owner every permission", () => {
    expect(roleHasPermission({ role: "owner" }, "change_pricing")).toBe(true);
    expect(roleHasPermission({ role: "owner" }, "view_payroll")).toBe(true);
    expect(roleHasPermission({ role: "owner" }, "access_private_owner_notes")).toBe(true);
  });

  it("gives hurkl_admin no default tenant customer-data access", () => {
    expect(roleHasPermission({ role: "hurkl_admin" }, "view_customer_data")).toBe(false);
    expect(roleHasPermission({ role: "hurkl_admin" }, "view_payments")).toBe(false);
  });

  it("gives a plain employee no financial permissions by default", () => {
    expect(roleHasPermission({ role: "employee" }, "change_pricing")).toBe(false);
    expect(roleHasPermission({ role: "employee" }, "issue_discount")).toBe(false);
    expect(roleHasPermission({ role: "employee" }, "issue_refund")).toBe(false);
    expect(roleHasPermission({ role: "employee" }, "create_invoice")).toBe(false);
    expect(roleHasPermission({ role: "employee" }, "approve_invoice")).toBe(false);
  });

  it("gives an employee only the financial permission the owner explicitly granted", () => {
    const foreman = {
      role: "employee" as const,
      employeeFinancialGrants: ["create_invoice" as const],
    };
    expect(roleHasPermission(foreman, "create_invoice")).toBe(true);
    expect(roleHasPermission(foreman, "issue_discount")).toBe(false);
    expect(roleHasPermission(foreman, "change_pricing")).toBe(false);
  });

  it("never grants an employee payroll or private-owner-notes access, even with financial grants", () => {
    const foreman = {
      role: "employee" as const,
      employeeFinancialGrants: [
        "change_pricing",
        "issue_discount",
        "issue_refund",
        "create_invoice",
        "approve_invoice",
      ] as const,
    };
    expect(roleHasPermission(foreman, "view_payroll")).toBe(false);
    expect(roleHasPermission(foreman, "access_private_owner_notes")).toBe(false);
  });

  it("gives a customer no permissions", () => {
    expect(roleHasPermission({ role: "customer" }, "view_customer_data")).toBe(false);
  });

  it("manager has no payroll or private-owner-notes access by default", () => {
    expect(roleHasPermission({ role: "manager" }, "view_payroll")).toBe(false);
    expect(roleHasPermission({ role: "manager" }, "access_private_owner_notes")).toBe(false);
    expect(roleHasPermission({ role: "manager" }, "manage_scheduling")).toBe(true);
  });
});

describe("assertPermission", () => {
  it("does not throw when the role has the permission", () => {
    expect(() => assertPermission({ role: "owner" }, "change_pricing")).not.toThrow();
  });

  it("throws PermissionDeniedError when the role lacks the permission", () => {
    expect(() => assertPermission({ role: "employee" }, "change_pricing")).toThrow(
      PermissionDeniedError,
    );
  });
});

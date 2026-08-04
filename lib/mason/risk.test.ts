import { describe, expect, it } from "vitest";
import { classifyRisk, defaultAutonomyTierFor } from "./risk";

describe("classifyRisk", () => {
  it("classifies every documented low-risk action as low", () => {
    const lowRiskActions = [
      "answer_common_question",
      "take_message",
      "collect_lead_info",
      "schedule_within_rules",
      "send_reminder",
      "send_approved_invoice",
      "provide_job_status",
      "record_customer_note",
      "confirm_appointment",
    ] as const;
    for (const action of lowRiskActions) {
      expect(classifyRisk(action)).toBe("low");
    }
  });

  it("classifies every documented medium-risk action as medium", () => {
    const mediumRiskActions = [
      "apply_discount",
      "move_appointment_outside_rules",
      "create_invoice_unusual_charges",
      "make_customer_promise",
      "issue_credit",
      "change_job_scope",
      "send_sensitive_company_info",
    ] as const;
    for (const action of mediumRiskActions) {
      expect(classifyRisk(action)).toBe("medium");
    }
  });

  it("classifies every documented high-risk action as high", () => {
    const highRiskActions = [
      "large_financial_commitment",
      "refund_above_threshold",
      "quote_above_threshold",
      "contract_change",
      "legal_admission",
      "employee_discipline",
      "change_company_pricing",
      "send_money",
      "take_loan",
      "accept_unusual_liability",
      "delete_important_record",
      "reveal_confidential_information",
    ] as const;
    for (const action of highRiskActions) {
      expect(classifyRisk(action)).toBe("high");
    }
  });
});

describe("defaultAutonomyTierFor", () => {
  it("maps low risk to tier_1_automatic", () => {
    expect(defaultAutonomyTierFor("take_message")).toBe("tier_1_automatic");
  });

  it("maps medium risk to tier_2_approval_required", () => {
    expect(defaultAutonomyTierFor("apply_discount")).toBe("tier_2_approval_required");
  });

  it("maps high risk to tier_3_never_autonomous", () => {
    expect(defaultAutonomyTierFor("send_money")).toBe("tier_3_never_autonomous");
  });
});

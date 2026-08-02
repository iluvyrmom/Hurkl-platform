/**
 * Domain contracts for DEFERRD, HURKL's first-party physical
 * communication and fulfillment service — see
 * docs/business-intelligence/DEFERRD_FULFILLMENT.md.
 *
 * Types only. No runtime logic, no provider implementation, no
 * dependencies, no database schema. This exists so later
 * implementation has a stable, provider-neutral shape to build
 * against — it does not integrate with any real fulfillment provider,
 * and none should be wired up until a specific milestone explicitly
 * authorizes it.
 *
 * Customer-facing playbooks choose an OUTCOME (see the DEFERRD doc's
 * examples — "send the new-homeowner campaign"), never a vendor.
 * PhysicalFulfillmentProvider exists purely for HURKL's own engineering
 * flexibility (disaster recovery, international expansion, future
 * acquisitions) and must never be exposed as a customer-facing choice
 * — see Principle 006, "Hide Operational Complexity."
 */

export type FulfillmentTrigger =
  | "property_sale_detected"
  | "new_customer_created"
  | "job_completed"
  | "customer_birthday"
  | "customer_anniversary"
  | "employee_birthday"
  | "employee_work_anniversary"
  | "referral_received"
  | "certification_achieved"
  | "safety_milestone_reached"
  | "estimate_not_accepted_within_period"
  | "customer_inactive_within_period"
  | "holiday_or_seasonal_event";

export type FulfillmentProduct =
  | "postcard"
  | "fridge_magnet"
  | "thank_you_card"
  | "birthday_card"
  | "anniversary_card"
  | "holiday_card"
  | "referral_thank_you_package"
  | "welcome_package"
  | "certification_recognition"
  | "estimate_follow_up_mail"
  | "seasonal_reminder"
  | "warranty_reminder"
  | "reactivation_mail"
  | "employee_recognition_award";

export type FulfillmentOrderStatus =
  | "pending_approval"
  | "approved"
  | "queued"
  | "in_production"
  | "shipped"
  | "delivered"
  | "failed"
  | "cancelled";

export interface FulfillmentRecipient {
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface FulfillmentRequest {
  tenantId: string;
  trigger: FulfillmentTrigger;
  product: FulfillmentProduct;
  recipient: FulfillmentRecipient;
  playbookId: string;
  approvedBudgetCents: number;
}

export interface FulfillmentResult {
  orderId: string;
  status: FulfillmentOrderStatus;
  estimatedCostCents: number;
}

/**
 * Internal-only abstraction over a physical mail/fulfillment vendor.
 * DEFERRD is HURKL's default and official implementation of this
 * interface. Never surface a choice of provider to a customer — the
 * customer chooses an outcome/playbook, not a vendor.
 */
export interface PhysicalFulfillmentProvider {
  createMailingOrder(request: FulfillmentRequest): Promise<FulfillmentResult>;
  getMailingOrderStatus(orderId: string): Promise<FulfillmentOrderStatus>;
  cancelMailingOrder(orderId: string): Promise<void>;
  estimateFulfillmentCost(request: FulfillmentRequest): Promise<number>;
  validateRecipient(recipient: FulfillmentRecipient): Promise<boolean>;
  listSupportedProducts(): Promise<FulfillmentProduct[]>;
}

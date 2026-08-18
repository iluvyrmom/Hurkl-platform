export type BusinessRole = "owner" | "staff";

export interface BusinessMembership {
  businessId: string;
  userId: string;
  role: BusinessRole;
}

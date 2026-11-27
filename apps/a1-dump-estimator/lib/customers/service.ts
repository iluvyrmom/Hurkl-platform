import type { Customer } from "@/lib/domain/customer";
import { getCustomerRepository } from "@/lib/repository/customer-repository";

export async function lookupCustomer(businessId: string, phone: string): Promise<Customer | null> {
  return getCustomerRepository().findByPhone(businessId, phone);
}

export async function listCustomers(businessId: string): Promise<Customer[]> {
  return getCustomerRepository().list(businessId);
}

export async function getCustomer(id: string): Promise<Customer | null> {
  return getCustomerRepository().get(id);
}

/** Finds an existing customer by phone, or creates one — used when an estimate is saved. */
export async function findOrCreateCustomer(params: {
  businessId: string;
  name: string;
  phone: string;
  address: string;
}): Promise<Customer> {
  const repo = getCustomerRepository();
  const existing = await repo.findByPhone(params.businessId, params.phone);
  if (existing) return existing;
  return repo.create({
    businessId: params.businessId,
    name: params.name,
    phone: params.phone,
    email: null,
    address: params.address,
    notes: "",
  });
}

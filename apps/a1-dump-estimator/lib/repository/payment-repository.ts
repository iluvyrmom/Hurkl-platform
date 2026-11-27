import { randomUUID } from "node:crypto";
import type { PaymentTransaction } from "@/lib/domain/payment";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { inMemoryStore } from "./in-memory-store";

export type CreatePaymentInput = Omit<PaymentTransaction, "id" | "createdAt" | "updatedAt">;

export interface PaymentRepository {
  get(id: string): Promise<PaymentTransaction | null>;
  getByIdempotencyKey(idempotencyKey: string): Promise<PaymentTransaction | null>;
  getBySessionId(sessionId: string): Promise<PaymentTransaction | null>;
  getByPaymentIntentId(paymentIntentId: string): Promise<PaymentTransaction | null>;
  listForJob(jobId: string): Promise<PaymentTransaction[]>;
  create(input: CreatePaymentInput): Promise<PaymentTransaction>;
  update(id: string, patch: Partial<PaymentTransaction>): Promise<PaymentTransaction>;
}

class InMemoryPaymentRepository implements PaymentRepository {
  async get(id: string): Promise<PaymentTransaction | null> {
    return inMemoryStore.payments.get(id) ?? null;
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<PaymentTransaction | null> {
    return (
      Array.from(inMemoryStore.payments.values()).find((p) => p.idempotencyKey === idempotencyKey) ??
      null
    );
  }

  async getBySessionId(sessionId: string): Promise<PaymentTransaction | null> {
    return (
      Array.from(inMemoryStore.payments.values()).find((p) => p.providerSessionId === sessionId) ?? null
    );
  }

  async getByPaymentIntentId(paymentIntentId: string): Promise<PaymentTransaction | null> {
    return (
      Array.from(inMemoryStore.payments.values()).find(
        (p) => p.providerPaymentIntentId === paymentIntentId,
      ) ?? null
    );
  }

  async listForJob(jobId: string): Promise<PaymentTransaction[]> {
    return Array.from(inMemoryStore.payments.values()).filter((p) => p.jobId === jobId);
  }

  async create(input: CreatePaymentInput): Promise<PaymentTransaction> {
    const now = new Date().toISOString();
    const payment: PaymentTransaction = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
    inMemoryStore.payments.set(payment.id, payment);
    return payment;
  }

  async update(id: string, patch: Partial<PaymentTransaction>): Promise<PaymentTransaction> {
    const existing = inMemoryStore.payments.get(id);
    if (!existing) throw new Error(`Payment ${id} not found`);
    const updated: PaymentTransaction = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    inMemoryStore.payments.set(id, updated);
    return updated;
  }
}

/**
 * Supabase-backed implementation. Written against
 * supabase/migrations/00000000000005_payments.sql; not executed against a
 * live project. `useAdmin: true` uses the service-role client — only the
 * Stripe webhook handler passes this, since it has no business-member
 * session for RLS to authorize against.
 */
class SupabasePaymentRepository implements PaymentRepository {
  constructor(private readonly useAdmin: boolean) {}

  private async client() {
    return this.useAdmin ? createSupabaseAdminClient() : createSupabaseServerClient();
  }

  async get(id: string): Promise<PaymentTransaction | null> {
    const client = await this.client();
    const { data, error } = await client.from("payments").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<PaymentTransaction | null> {
    const client = await this.client();
    const { data, error } = await client
      .from("payments")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async getBySessionId(sessionId: string): Promise<PaymentTransaction | null> {
    const client = await this.client();
    const { data, error } = await client
      .from("payments")
      .select("*")
      .eq("provider_session_id", sessionId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async getByPaymentIntentId(paymentIntentId: string): Promise<PaymentTransaction | null> {
    const client = await this.client();
    const { data, error } = await client
      .from("payments")
      .select("*")
      .eq("provider_payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async listForJob(jobId: string): Promise<PaymentTransaction[]> {
    const client = await this.client();
    const { data, error } = await client
      .from("payments")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async create(input: CreatePaymentInput): Promise<PaymentTransaction> {
    const client = await this.client();
    const { data, error } = await client
      .from("payments")
      .insert({
        business_id: input.businessId,
        job_id: input.jobId,
        provider: input.provider,
        method: input.method,
        provider_session_id: input.providerSessionId,
        provider_payment_intent_id: input.providerPaymentIntentId,
        amount: input.amount,
        currency: input.currency,
        status: input.status,
        refunded_amount: input.refundedAmount,
        idempotency_key: input.idempotencyKey,
        recorded_by_user_id: input.recordedByUserId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapRow(data);
  }

  async update(id: string, patch: Partial<PaymentTransaction>): Promise<PaymentTransaction> {
    const client = await this.client();
    const { data, error } = await client
      .from("payments")
      .update({
        status: patch.status,
        provider_payment_intent_id: patch.providerPaymentIntentId,
        refunded_amount: patch.refundedAmount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapRow(data);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): PaymentTransaction {
  return {
    id: row.id,
    businessId: row.business_id,
    jobId: row.job_id,
    provider: row.provider,
    method: row.method,
    providerSessionId: row.provider_session_id,
    providerPaymentIntentId: row.provider_payment_intent_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    refundedAmount: Number(row.refunded_amount),
    idempotencyKey: row.idempotency_key,
    recordedByUserId: row.recorded_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getPaymentRepository(useAdmin = false): PaymentRepository {
  return isSupabaseConfigured()
    ? new SupabasePaymentRepository(useAdmin)
    : new InMemoryPaymentRepository();
}

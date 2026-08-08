import type { Customer } from "@/lib/domain/customer";
import type { Estimate } from "@/lib/domain/estimate";
import type { Job } from "@/lib/domain/job";
import type { LearningRecord } from "@/lib/domain/job";
import type { PaymentTransaction } from "@/lib/domain/payment";

/**
 * Process-memory store backing the in-memory repositories. Resets on every
 * server restart — this is a Phase 1 development/demo convenience, not a
 * database. A real Supabase project (see lib/supabase/server.ts and each
 * repository's Supabase-backed implementation) replaces this once
 * provisioned.
 */
export const inMemoryStore = {
  customers: new Map<string, Customer>(),
  estimates: new Map<string, Estimate>(),
  jobs: new Map<string, Job>(),
  learningRecords: new Map<string, LearningRecord>(),
  payments: new Map<string, PaymentTransaction>(),
};

let quoteCounter = 1000;
export function nextQuoteNumber(): string {
  quoteCounter += 1;
  return `A1-${quoteCounter}`;
}

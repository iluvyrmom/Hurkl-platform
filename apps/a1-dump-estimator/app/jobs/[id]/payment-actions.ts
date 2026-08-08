"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireMembership } from "@/lib/auth/business";
import { createCheckoutForJob, recordCashPaymentForJob, refundPayment } from "@/lib/payments/service";
import { getJob } from "@/lib/jobs/service";
import { getCustomer } from "@/lib/customers/service";

async function baseUrl(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function createCheckoutAction(jobId: string): Promise<{ checkoutUrl: string | null }> {
  const membership = await requireMembership();
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  const customer = await getCustomer(job.customerId);

  const origin = await baseUrl();
  const { checkoutUrl } = await createCheckoutForJob({
    jobId,
    businessId: membership.businessId,
    amount: job.agreedPrice,
    customerEmail: customer?.email ?? null,
    successUrl: `${origin}/jobs/${jobId}?payment=success`,
    cancelUrl: `${origin}/jobs/${jobId}?payment=cancelled`,
  });

  revalidatePath(`/jobs/${jobId}`);
  return { checkoutUrl };
}

export async function recordCashPaymentAction(jobId: string, amount: number): Promise<void> {
  const membership = await requireMembership();
  await recordCashPaymentForJob({
    jobId,
    businessId: membership.businessId,
    amount,
    recordedByUserId: membership.userId === "dev-mode" ? null : membership.userId,
  });
  revalidatePath(`/jobs/${jobId}`);
}

export async function refundPaymentAction(paymentId: string, amount: number, jobId: string): Promise<void> {
  await requireMembership();
  await refundPayment(paymentId, amount);
  revalidatePath(`/jobs/${jobId}`);
}

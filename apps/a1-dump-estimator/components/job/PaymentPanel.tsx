"use client";

import { useState, useTransition } from "react";
import { Button, Card, inputClassName } from "@/components/ui";
import type { PaymentTransaction } from "@/lib/domain/payment";
import {
  createCheckoutAction,
  recordCashPaymentAction,
  refundPaymentAction,
} from "@/app/jobs/[id]/payment-actions";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
  failed: "Failed",
};

export function PaymentPanel({
  jobId,
  agreedPrice,
  paymentStatus,
  payments,
}: {
  jobId: string;
  agreedPrice: number;
  paymentStatus: string;
  payments: PaymentTransaction[];
}) {
  const [cashAmount, setCashAmount] = useState(String(agreedPrice));
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCharge() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const { checkoutUrl } = await createCheckoutAction(jobId);
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        setInfo(
          "No live checkout link — Stripe isn't configured (mock payment provider). A pending payment record was still created. See Settings.",
        );
      }
    });
  }

  function handleRecordCash() {
    setError(null);
    const amount = Number(cashAmount);
    if (!amount || amount <= 0) {
      setError("Enter a valid cash amount.");
      return;
    }
    startTransition(async () => {
      await recordCashPaymentAction(jobId, amount);
    });
  }

  function handleRefund(paymentId: string, maxAmount: number) {
    const input = window.prompt(`Refund amount (up to $${maxAmount})`, String(maxAmount));
    if (!input) return;
    const amount = Number(input);
    if (!amount || amount <= 0 || amount > maxAmount) return;
    startTransition(async () => {
      await refundPaymentAction(paymentId, amount, jobId);
    });
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-brand-navy">Payment</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase text-brand-navy">
          {STATUS_LABEL[paymentStatus] ?? paymentStatus}
        </span>
      </div>

      {payments.length > 0 && (
        <ul className="divide-y divide-slate-200 text-sm">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2">
              <span className="text-brand-slate">
                {p.method === "cash" ? "Cash" : "Card"} — {STATUS_LABEL[p.status] ?? p.status}
                {p.refundedAmount > 0 && ` (refunded $${p.refundedAmount})`}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-brand-navy">${p.amount}</span>
                {p.status === "paid" && (
                  <button
                    type="button"
                    onClick={() => handleRefund(p.id, p.amount - p.refundedAmount)}
                    className="text-xs font-semibold text-brand-danger underline"
                  >
                    Refund
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {paymentStatus !== "paid" && (
        <div className="space-y-3 pt-1">
          <Button fullWidth onClick={handleCharge} disabled={isPending}>
            {isPending ? "Working…" : `Charge Card — $${agreedPrice}`}
          </Button>

          <div className="flex gap-2">
            <input
              type="number"
              className={inputClassName}
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
            />
            <Button type="button" variant="outline" onClick={handleRecordCash} disabled={isPending}>
              Record Cash
            </Button>
          </div>
        </div>
      )}

      {info && <p className="text-sm text-brand-slate">{info}</p>}
      {error && <p className="text-sm font-medium text-brand-danger">{error}</p>}
    </Card>
  );
}

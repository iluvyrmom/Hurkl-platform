"use client";

import { useState, useTransition } from "react";
import { Button, Card } from "@/components/ui";
import type { CrewSize, EstimateTier, PriceEstimate } from "@/lib/domain/estimate";
import { tierLabel } from "@/lib/quotes/generator";
import { bookJobAction } from "@/app/quote/[id]/actions";

function tomorrowAt9am(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

const TIER_ACCENT: Record<EstimateTier, string> = {
  low: "border-slate-300",
  recommended: "border-brand-orange ring-2 ring-brand-orange/40",
  premium: "border-slate-300",
};

export function QuoteTiersAndActions({
  estimateId,
  tiers,
  defaultCrewSize,
}: {
  estimateId: string;
  tiers: PriceEstimate[];
  defaultCrewSize: CrewSize;
}) {
  const [selectedTier, setSelectedTier] = useState<EstimateTier>("recommended");
  const [scheduledAt, setScheduledAt] = useState(tomorrowAt9am());
  const [isPending, startTransition] = useTransition();

  function handleBook() {
    startTransition(async () => {
      await bookJobAction({
        estimateId,
        selectedTier,
        scheduledAt: new Date(scheduledAt).toISOString(),
        crewSize: defaultCrewSize,
      });
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {tiers.map((tier) => (
          <button
            key={tier.tier}
            type="button"
            onClick={() => setSelectedTier(tier.tier)}
            className="block w-full text-left"
          >
            <Card
              className={`border-2 ${
                selectedTier === tier.tier ? TIER_ACCENT[tier.tier] : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-wide text-brand-navy">
                  {tierLabel(tier.tier)}
                </span>
                <span className="text-2xl font-extrabold text-brand-navy">${tier.totalPrice}</span>
              </div>
              <details className="no-print mt-2 text-sm text-brand-slate">
                <summary className="cursor-pointer">Breakdown</summary>
                <ul className="mt-2 space-y-1">
                  <li>Weight: ~{tier.breakdown.estimatedWeightLbs} lbs</li>
                  <li>Volume: ~{tier.breakdown.estimatedVolumeYards} yd³</li>
                  <li>
                    Labor: {tier.breakdown.laborHours} hrs × {tier.breakdown.crewSize} crew (${tier.breakdown.laborCost})
                  </li>
                  <li>
                    Travel: {tier.breakdown.travelDistanceMiles} mi / {tier.breakdown.travelTimeMinutes} min (${tier.breakdown.travelCost})
                  </li>
                  <li>Dump fee: ${tier.breakdown.dumpFee}</li>
                  {tier.breakdown.specialFees.map((fee) => (
                    <li key={fee.label}>
                      {fee.label}: ${fee.amount}
                    </li>
                  ))}
                  <li>Contingency: ${tier.breakdown.contingencyAmount}</li>
                  <li>Margin: ${tier.breakdown.marginAmount}</li>
                </ul>
              </details>
            </Card>
          </button>
        ))}
      </div>

      <div className="no-print space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold text-brand-navy">Book this job</h2>
        <label className="block text-sm font-semibold text-brand-navy">
          Pickup date &amp; time
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 text-base"
          />
        </label>
        <Button fullWidth onClick={handleBook} disabled={isPending}>
          {isPending ? "Booking…" : `Schedule Pickup — ${tierLabel(selectedTier)}`}
        </Button>
      </div>
    </div>
  );
}

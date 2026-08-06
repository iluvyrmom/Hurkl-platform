import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { getEstimate } from "@/lib/estimates/service";
import { QuoteTiersAndActions } from "@/components/estimate/QuoteActions";
import { NavigationIcon } from "@/components/icons";
import { PrintButton } from "@/components/PrintButton";
import { DEFAULT_BUSINESS } from "@/lib/config/business";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const estimate = await getEstimate(id);
  if (!estimate) notFound();

  const facility = estimate.selectedFacility;

  return (
    <div>
      <PageHeader title={`Quote ${estimate.quoteNumber}`} subtitle={estimate.customerName} />

      <div className="space-y-5 px-4 pt-5">
        <Card>
          <p className="text-sm text-brand-slate">Service address</p>
          <p className="font-semibold text-brand-navy">{estimate.address}</p>
          {estimate.notes && <p className="mt-2 text-sm text-brand-slate">{estimate.notes}</p>}
        </Card>

        {facility && (
          <Card>
            <p className="text-sm text-brand-slate">Selected facility</p>
            <p className="font-semibold text-brand-navy">{facility.facility.name}</p>
            <p className="text-sm text-brand-slate">
              {facility.distanceMiles} mi · {facility.driveTimeMinutes} min drive
            </p>
            {facility.partialMatch && (
              <p className="mt-1 text-sm text-brand-danger">
                Doesn&apos;t accept: {facility.unacceptedCategories.join(", ")}
              </p>
            )}
            {(facility.facility.verification.requiresVerification ||
              facility.dumpFee.hasUnverifiedPricing) && (
              <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
                Needs verification: facility rate or details are not yet confirmed against the
                source — do not treat this price as final.
              </p>
            )}
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${facility.facility.latitude},${facility.facility.longitude}&travelmode=driving`}
              target="_blank"
              rel="noreferrer"
              className="no-print mt-3 flex min-h-[44px] items-center justify-center gap-2 rounded-lg border-2 border-brand-navy text-sm font-semibold text-brand-navy"
            >
              <NavigationIcon className="h-4 w-4" /> Navigate to facility
            </a>
          </Card>
        )}

        <QuoteTiersAndActions
          estimateId={estimate.id}
          tiers={estimate.tiers}
          defaultCrewSize={estimate.tiers[0]?.breakdown.crewSize ?? 2}
        />

        <PrintButton />

        <footer className="pb-6 pt-2 text-center text-sm text-brand-slate">
          <p className="font-semibold text-brand-navy">{DEFAULT_BUSINESS.name}</p>
          <p>{DEFAULT_BUSINESS.tagline}</p>
          <p>
            {DEFAULT_BUSINESS.phone} · {DEFAULT_BUSINESS.email}
          </p>
        </footer>
      </div>
    </div>
  );
}

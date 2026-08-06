import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { getJob } from "@/lib/jobs/service";
import { getCustomer } from "@/lib/customers/service";
import { listPaymentsForJob } from "@/lib/payments/service";
import { CompleteJobForm } from "@/components/job/CompleteJobForm";
import { PaymentPanel } from "@/components/job/PaymentPanel";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  const [customer, payments] = await Promise.all([
    getCustomer(job.customerId),
    listPaymentsForJob(job.id),
  ]);

  return (
    <div>
      <PageHeader title="Job" subtitle={customer?.name ?? "Customer"} />
      <div className="space-y-5 px-4 pt-5">
        <Card>
          <p className="text-sm text-brand-slate">Scheduled</p>
          <p className="font-semibold text-brand-navy">
            {new Date(job.scheduledAt).toLocaleString()}
          </p>
          <p className="mt-2 text-sm text-brand-slate">Agreed price</p>
          <p className="text-2xl font-bold text-brand-orange">${job.agreedPrice}</p>
          <p className="mt-2 text-sm capitalize text-brand-slate">{job.status.replace("_", " ")}</p>
        </Card>

        <PaymentPanel
          jobId={job.id}
          agreedPrice={job.agreedPrice}
          paymentStatus={job.paymentStatus}
          payments={payments}
        />

        {job.completion ? (
          <Card>
            <h2 className="mb-2 text-base font-bold text-brand-navy">Completed</h2>
            <p className="text-sm text-brand-slate">
              {job.completion.cleanSitePhotoPaths.length} clean-site photo(s) ·{" "}
              {job.completion.dumpReceipt ? "receipt on file" : "no receipt"}
            </p>
            {job.completion.actualWeightLbs != null && (
              <p className="text-sm text-brand-slate">Actual weight: {job.completion.actualWeightLbs} lbs</p>
            )}
            {job.completion.actualDumpFee != null && (
              <p className="text-sm text-brand-slate">Actual dump fee: ${job.completion.actualDumpFee}</p>
            )}
            {job.completion.dumpReceipt && (
              <div className="mt-3 space-y-1 border-t border-slate-200 pt-3">
                <p className="text-xs font-semibold uppercase text-brand-slate">
                  Receipt OCR ({job.completion.dumpReceipt.ocrProvider ?? "not run"})
                </p>
                {job.completion.dumpReceipt.ocrFacilityNameGuess && (
                  <p className="text-sm text-brand-slate">
                    Facility: {job.completion.dumpReceipt.ocrFacilityNameGuess}
                  </p>
                )}
                {job.completion.dumpReceipt.ocrTicketNumber && (
                  <p className="text-sm text-brand-slate">
                    Ticket #: {job.completion.dumpReceipt.ocrTicketNumber}
                  </p>
                )}
                {job.completion.dumpReceipt.ocrNetWeightLbs != null && (
                  <p className="text-sm text-brand-slate">
                    Net weight (OCR): {job.completion.dumpReceipt.ocrNetWeightLbs} lbs
                  </p>
                )}
                {job.completion.dumpReceipt.ocrAmountCharged != null && (
                  <p className="text-sm text-brand-slate">
                    Amount charged (OCR): ${job.completion.dumpReceipt.ocrAmountCharged}
                  </p>
                )}
                {job.completion.dumpReceipt.duplicateOverrideConfirmed && (
                  <p className="text-sm font-medium text-brand-danger">
                    Duplicate-receipt match was overridden and confirmed by a crew member.
                  </p>
                )}
                {!job.completion.dumpReceipt.ocrTicketNumber &&
                  !job.completion.dumpReceipt.ocrFacilityNameGuess && (
                    <p className="text-sm text-brand-slate">
                      No OCR data extracted — needs manual review against the photo.
                    </p>
                  )}
              </div>
            )}
          </Card>
        ) : (
          <CompleteJobForm jobId={job.id} />
        )}
      </div>
    </div>
  );
}

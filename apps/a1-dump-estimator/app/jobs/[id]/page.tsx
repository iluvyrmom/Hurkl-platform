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
          </Card>
        ) : (
          <CompleteJobForm jobId={job.id} />
        )}
      </div>
    </div>
  );
}

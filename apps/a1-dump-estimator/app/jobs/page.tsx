import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireCurrentBusinessId } from "@/lib/auth/business";
import { listJobs } from "@/lib/jobs/service";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default async function JobsPage() {
  const businessId = await requireCurrentBusinessId();
  const jobs = await listJobs(businessId);

  return (
    <div>
      <PageHeader title="Jobs" subtitle={`${jobs.length} total`} />
      <div className="space-y-2 px-4 pt-5">
        {jobs.length === 0 ? (
          <EmptyState>No jobs yet — booked estimates show up here.</EmptyState>
        ) : (
          jobs.map((job) => (
            <a key={job.id} href={`/jobs/${job.id}`} className="block">
              <Card className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-brand-navy">
                    {new Date(job.scheduledAt).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-brand-slate">{STATUS_LABEL[job.status]}</p>
                </div>
                <p className="font-bold text-brand-orange">${job.agreedPrice}</p>
              </Card>
            </a>
          ))
        )}
      </div>
    </div>
  );
}

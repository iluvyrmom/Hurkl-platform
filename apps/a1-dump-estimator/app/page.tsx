import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { DEFAULT_BUSINESS } from "@/lib/config/business";
import { listEstimates } from "@/lib/estimates/service";
import { listJobs } from "@/lib/jobs/service";
import { tierLabel } from "@/lib/quotes/generator";
import { PlusIcon } from "@/components/icons";

export default async function HomePage() {
  const [estimates, jobs] = await Promise.all([
    listEstimates(DEFAULT_BUSINESS.id),
    listJobs(DEFAULT_BUSINESS.id),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const todaysJobs = jobs.filter((j) => j.scheduledAt.slice(0, 10) === today);
  const openEstimates = estimates.filter((e) => e.status === "draft" || e.status === "sent");
  const recentEstimates = estimates.slice(0, 5);

  return (
    <div>
      <PageHeader title={DEFAULT_BUSINESS.name} subtitle={DEFAULT_BUSINESS.tagline} />

      <div className="space-y-5 px-4 pt-5">
        <LinkButton href="/new-estimate" variant="primary" fullWidth>
          <PlusIcon className="h-5 w-5" />
          New Estimate
        </LinkButton>

        <div className="grid grid-cols-2 gap-3">
          <Card className="text-center">
            <p className="text-3xl font-bold text-brand-navy">{todaysJobs.length}</p>
            <p className="text-sm text-brand-slate">Jobs today</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-brand-navy">{openEstimates.length}</p>
            <p className="text-sm text-brand-slate">Open estimates</p>
          </Card>
        </div>

        <section>
          <h2 className="mb-2 text-base font-bold text-brand-navy">Recent estimates</h2>
          {recentEstimates.length === 0 ? (
            <EmptyState>No estimates yet — tap New Estimate to create your first one.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {recentEstimates.map((estimate) => {
                const recommended = estimate.tiers.find((t) => t.tier === "recommended");
                return (
                  <li key={estimate.id}>
                    <a
                      href={`/quote/${estimate.id}`}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div>
                        <p className="font-semibold text-brand-navy">{estimate.customerName}</p>
                        <p className="text-sm text-brand-slate">{estimate.address}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-brand-orange">
                          {recommended ? `$${recommended.totalPrice}` : "—"}
                        </p>
                        <p className="text-xs uppercase text-brand-slate">
                          {estimate.selectedTier ? tierLabel(estimate.selectedTier) : estimate.status}
                        </p>
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

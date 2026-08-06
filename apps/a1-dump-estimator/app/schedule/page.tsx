import { Card, EmptyState, PageHeader } from "@/components/ui";
import { DEFAULT_BUSINESS } from "@/lib/config/business";
import { getScheduleByDay } from "@/lib/scheduling/service";

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default async function SchedulePage() {
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksFromNow = new Date();
  twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
  const twoWeeksOut = twoWeeksFromNow.toISOString().slice(0, 10);
  const days = await getScheduleByDay(DEFAULT_BUSINESS.id, today, twoWeeksOut);

  return (
    <div>
      <PageHeader title="Schedule" subtitle="Dump runs only" />
      <div className="space-y-5 px-4 pt-5">
        {days.length === 0 ? (
          <EmptyState>No pickups scheduled in the next two weeks.</EmptyState>
        ) : (
          days.map((day) => (
            <section key={day.date}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-brand-slate">
                {formatDay(day.date)}
              </h2>
              <div className="space-y-2">
                {day.jobs.map((job) => (
                  <a key={job.id} href={`/jobs/${job.id}`} className="block">
                    <Card className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-brand-navy">{formatTime(job.scheduledAt)}</p>
                        <p className="text-sm capitalize text-brand-slate">{job.status.replace("_", " ")}</p>
                      </div>
                      <p className="font-bold text-brand-orange">${job.agreedPrice}</p>
                    </Card>
                  </a>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

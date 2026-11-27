import type { Job } from "@/lib/domain/job";
import { getJobRepository } from "@/lib/repository/job-repository";

export interface DaySchedule {
  date: string; // YYYY-MM-DD
  jobs: Job[];
}

/**
 * Dump-run scheduling only — this app has no moving-job concept at all, so
 * "separate calendar from moving jobs" (the product requirement) holds by
 * construction rather than needing a filter.
 */
export async function getScheduleByDay(
  businessId: string,
  fromDate: string,
  toDate: string,
): Promise<DaySchedule[]> {
  const jobs = await getJobRepository().list(businessId);
  const inRange = jobs.filter((j) => {
    const day = j.scheduledAt.slice(0, 10);
    return day >= fromDate && day <= toDate;
  });

  const byDay = new Map<string, Job[]>();
  for (const job of inRange) {
    const day = job.scheduledAt.slice(0, 10);
    const existing = byDay.get(day) ?? [];
    existing.push(job);
    byDay.set(day, existing);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, jobs]) => ({
      date,
      jobs: jobs.sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1)),
    }));
}

export async function schedulePickup(jobId: string, scheduledAt: string): Promise<Job> {
  return getJobRepository().update(jobId, { scheduledAt });
}

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  buildMonth,
  calendarToday,
  parseMonth,
  type BlockInput,
  type BookingInput,
  type CalendarCell,
} from "../../../lib/dashboard/calendar";
import { resolveCompanyAccess } from "../../../lib/dashboard/company";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { BlockDaysForm, UnblockButton } from "./block-forms";

// Per-request auth state and live data — never statically prerendered.
export const dynamic = "force-dynamic";

export const metadata = { title: "Calendar" };

interface PageProps {
  searchParams: Promise<{ company?: string; month?: string; day?: string }>;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function cellLabel(cell: CalendarCell): string {
  const parts = [cell.date];
  if (cell.isToday) parts.push("today");
  if (cell.state === "unavailable") parts.push("day off");
  if (cell.state === "limited") parts.push("limited");
  const paid = cell.bookings.filter((b) => b.paid).length;
  const held = cell.bookings.length - paid;
  if (paid) parts.push(`${paid} paid booking${paid === 1 ? "" : "s"}`);
  if (held) parts.push(`${held} waiting on deposit`);
  return parts.join(", ");
}

export default async function CalendarPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const access = await resolveCompanyAccess(supabase, params.company);

  if (access.kind === "signed_out") redirect("/sign-in");
  if (access.kind === "no_company") {
    redirect(access.isAdmin ? "/dashboard/overview" : "/onboarding");
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", access.companyId)
    .maybeSingle();
  if (!company) redirect("/dashboard");

  const now = new Date();
  const today = calendarToday(now);
  const month = parseMonth(params.month, today);
  const monthStart = `${month}-01`;
  const companyQuery = access.slug ? `&company=${encodeURIComponent(access.slug)}` : "";

  const [blockResult, bookingResult, leadResult, upcomingBlockResult] = await Promise.all([
    supabase
      .from("company_calendar_blocks")
      .select("service_date,status,reason")
      .eq("company_id", company.id)
      // Include the grid's leading/trailing days from neighbouring months.
      .gte("service_date", shiftDays(monthStart, -7))
      .lte("service_date", shiftDays(monthStart, 38))
      .limit(100),
    supabase
      .from("booking_reservations")
      .select("lead_id,requested_dates,status,expires_at")
      .eq("company_id", company.id)
      .in("status", ["paid", "payment_pending"])
      .limit(1000),
    supabase.from("leads").select("id,name").eq("company_id", company.id).limit(1000),
    supabase
      .from("company_calendar_blocks")
      .select("service_date,status,reason")
      .eq("company_id", company.id)
      .gte("service_date", today)
      .order("service_date", { ascending: true })
      .limit(60),
  ]);

  const loadFailed = Boolean(
    blockResult.error || bookingResult.error || leadResult.error || upcomingBlockResult.error,
  );
  if (loadFailed) {
    console.error(
      "calendar: load failed",
      blockResult.error?.message ??
        bookingResult.error?.message ??
        leadResult.error?.message ??
        upcomingBlockResult.error?.message,
    );
  }

  const names = new Map((leadResult.data ?? []).map((l) => [l.id as string, l.name as string]));
  const blocks: BlockInput[] = (blockResult.data ?? []) as BlockInput[];
  const bookings: BookingInput[] = (bookingResult.data ?? []).map((row) => ({
    status: row.status as string,
    requested_dates: row.requested_dates as string[],
    expires_at: row.expires_at as string,
    customerName: names.get(row.lead_id as string) ?? "Customer",
  }));

  const view = buildMonth(month, blocks, bookings, now);
  const selectedDay = params.day;
  const selected = view.weeks.flat().find((c) => c.date === selectedDay);
  const upcomingBlocks = (upcomingBlockResult.data ?? []) as BlockInput[];

  return (
    <div className="ov-page">
      <main className="ov-main">
        <header className="ov-header">
          <Link
            className="ov-link"
            href={`/dashboard/overview${access.slug ? `?company=${access.slug}` : ""}`}
          >
            ← Overview
          </Link>
          <h1 className="ov-title">{company.name} calendar</h1>
          <p className="ov-muted">Live numbers. Reload the page to refresh.</p>
        </header>

        {loadFailed && (
          <p role="alert" className="ov-warn">
            Couldn&apos;t load all of the calendar. What you see may be incomplete. Reload to try
            again.
          </p>
        )}

        <section className="ov-card" aria-labelledby="cal-month-h">
          <div className="cal-nav">
            <Link
              className="ov-link"
              href={`/dashboard/calendar?month=${view.prev}${companyQuery}`}
            >
              ← Prev
            </Link>
            <h2 id="cal-month-h">{view.label}</h2>
            <Link
              className="ov-link"
              href={`/dashboard/calendar?month=${view.next}${companyQuery}`}
            >
              Next →
            </Link>
          </div>

          <div className="cal-grid" role="grid" aria-labelledby="cal-month-h">
            {WEEKDAYS.map((d) => (
              <div key={d} className="cal-dow" role="columnheader">
                {d}
              </div>
            ))}
            {view.weeks.flat().map((cell) => {
              const classes = [
                "cal-cell",
                cell.inMonth ? "" : "cal-out",
                cell.isPast ? "cal-past" : "",
                cell.isToday ? "cal-today" : "",
                `cal-${cell.state}`,
                cell.date === selectedDay ? "cal-selected" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const paid = cell.bookings.filter((b) => b.paid).length;
              const held = cell.bookings.length - paid;
              return (
                <Link
                  key={cell.date}
                  role="gridcell"
                  className={classes}
                  aria-label={cellLabel(cell)}
                  href={`/dashboard/calendar?month=${view.month}&day=${cell.date}${companyQuery}`}
                >
                  <span className="cal-day">{cell.day}</span>
                  {cell.state === "unavailable" && <span className="cal-tag">OFF</span>}
                  {cell.state === "limited" && <span className="cal-tag">LTD</span>}
                  {paid > 0 && <span className="cal-dot cal-dot-paid">{paid}</span>}
                  {held > 0 && <span className="cal-dot cal-dot-held">{held}</span>}
                </Link>
              );
            })}
          </div>

          <ul className="cal-legend">
            <li>
              <span className="cal-tag">OFF</span> day off
            </li>
            <li>
              <span className="cal-tag">LTD</span> limited
            </li>
            <li>
              <span className="cal-dot cal-dot-paid">2</span> paid bookings
            </li>
            <li>
              <span className="cal-dot cal-dot-held">1</span> waiting on deposit
            </li>
          </ul>
        </section>

        {selected && (
          <section className="ov-card" aria-labelledby="cal-day-h">
            <h2 id="cal-day-h">{selected.date}</h2>
            <p className="ov-muted">
              {selected.state === "unavailable"
                ? "Day off — no bookings"
                : selected.state === "limited"
                  ? "Limited"
                  : "Open"}
              {selected.reason ? ` · ${selected.reason}` : ""}
            </p>
            {selected.bookings.length === 0 ? (
              <p className="ov-muted">No customer bookings this day.</p>
            ) : (
              <ul className="ov-list">
                {selected.bookings.map((b, i) => (
                  <li key={i}>
                    <strong>{b.customerName}</strong>
                    <span className="ov-muted">
                      {b.paid ? "Deposit paid" : "Waiting on deposit"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {selected.state !== "open" && !selected.isPast && (
              <UnblockButton companySlug={access.slug} date={selected.date} />
            )}
          </section>
        )}

        <section className="ov-card" aria-labelledby="cal-block-h">
          <h2 id="cal-block-h">Block days off</h2>
          <BlockDaysForm
            companySlug={access.slug}
            defaultDate={selected && !selected.isPast ? selected.date : today}
          />
          <p className="ov-fine">Days a customer has already booked can&apos;t be blocked here.</p>
        </section>

        <section className="ov-card" aria-labelledby="cal-upcoming-h">
          <h2 id="cal-upcoming-h">Your blocked days</h2>
          {upcomingBlocks.length === 0 ? (
            <p className="ov-muted">No blocked or limited days coming up.</p>
          ) : (
            <ul className="ov-list">
              {upcomingBlocks.map((b) => (
                <li key={b.service_date}>
                  <strong>{b.service_date}</strong>
                  <span className="ov-muted">
                    {b.status === "unavailable" ? "Day off" : "Limited"}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </span>
                  <UnblockButton companySlug={access.slug} date={b.service_date} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function shiftDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

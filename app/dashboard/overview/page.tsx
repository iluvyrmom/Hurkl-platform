import Link from "next/link";
import { redirect } from "next/navigation";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  ageLabel,
  formatCents,
  loadOverview,
  type Section,
} from "../../../lib/dashboard/overview";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

// Per-request auth state and live data — never statically prerendered.
export const dynamic = "force-dynamic";

export const metadata = { title: "Overview" };

interface PageProps {
  searchParams: Promise<{ company?: string }>;
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function Unavailable() {
  return <p className="ov-muted">Couldn&apos;t load this section. Reload to try again.</p>;
}

function View<T>({
  section,
  children,
}: {
  section: Section<T>;
  children: (data: T) => React.ReactNode;
}) {
  return section.ok ? <>{children(section.data)}</> : <Unavailable />;
}

export default async function OverviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "hurkl_admin";

  // Customer, booking and money information is for the owner only. Everyone
  // else goes to the calendar, where they can ask for days off.
  if (!isAdmin && profile?.role !== "owner") redirect("/dashboard/calendar");
  let companyId: string | null = profile?.company_id ?? null;

  // HURKL admins have no company of their own; they pick one by its website
  // slug. Everyone else is always their own company — the parameter is ignored.
  if (isAdmin && params.company) {
    const { data: picked } = await supabase
      .from("companies")
      .select("id")
      .eq("website_slug", params.company)
      .maybeSingle();
    companyId = picked?.id ?? companyId;
  }

  if (!companyId) {
    if (!isAdmin) redirect("/onboarding");
    const { data: companies } = await supabase
      .from("companies")
      .select("name, website_slug")
      .not("website_slug", "is", null)
      .order("name");
    return (
      <div className="ov-page">
        <main className="ov-main">
          <h1 className="ov-title">Choose a company</h1>
          <ul className="ov-list">
            {(companies ?? []).map((c) => (
              <li key={c.website_slug}>
                <Link
                  className="ov-link"
                  href={`/dashboard/overview?company=${encodeURIComponent(c.website_slug)}`}
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </main>
      </div>
    );
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, slogan")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) redirect("/dashboard");

  const now = new Date();
  const overview = await loadOverview(supabase, company, now);
  const { attention, leads, escalations, bookings, calendar, mason } = overview;

  return (
    <div className="ov-page">
      <main className="ov-main">
        <header className="ov-header">
          <Link className="ov-link" href="/dashboard">
            ← Dashboard
          </Link>
          <h1 className="ov-title">{company.name}</h1>
          {company.slogan && <p className="ov-muted">{company.slogan}</p>}
          <p className="ov-muted">Live numbers. Reload the page to refresh.</p>
        </header>

        <section className="ov-card ov-attention" aria-labelledby="ov-attention-h">
          <h2 id="ov-attention-h">Needs you</h2>
          {attention.items.length === 0 && attention.unchecked.length === 0 && (
            <p className="ov-good">Nothing needs you right now.</p>
          )}
          {attention.unchecked.length > 0 && (
            <p role="alert" className="ov-warn">
              Couldn&apos;t check: {attention.unchecked.join(", ")}. This list may be incomplete.
            </p>
          )}
          <ul className="ov-list">
            {attention.items.map((item, index) => (
              <li key={`${item.kind}-${index}`}>
                <strong>{item.title}</strong>
                <span className="ov-muted">
                  {item.detail}
                  {item.age ? ` · ${item.age}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {attention.hiddenCount > 0 && (
            <p className="ov-muted">+{attention.hiddenCount} more not shown</p>
          )}
        </section>

        <section className="ov-tiles" aria-label="Key numbers">
          <div className="ov-tile">
            <span className="ov-num">{leads.ok ? leads.data.newLast7Days : "—"}</span>
            <span className="ov-label">New leads, 7 days</span>
          </div>
          <div className="ov-tile">
            <span className="ov-num">{escalations.ok ? escalations.data.openCount : "—"}</span>
            <span className="ov-label">Open requests from Mason</span>
          </div>
          <div className="ov-tile">
            <span className="ov-num">{bookings.ok ? bookings.data.upcoming.length : "—"}</span>
            <span className="ov-label">Upcoming paid moves</span>
          </div>
          <div className="ov-tile">
            <span className="ov-num">
              {bookings.ok ? formatCents(bookings.data.paidCents) : "—"}
            </span>
            <span className="ov-label">Deposits paid</span>
          </div>
        </section>

        <section className="ov-card" aria-labelledby="ov-moves-h">
          <h2 id="ov-moves-h">Upcoming moves</h2>
          <View section={bookings}>
            {(b) =>
              b.upcoming.length === 0 ? (
                <p className="ov-muted">No paid moves on the calendar yet.</p>
              ) : (
                <ul className="ov-list">
                  {b.upcoming.map((m) => (
                    <li key={m.id}>
                      <strong>{m.dates.join(", ")}</strong>
                      <span className="ov-muted">
                        {m.customerName} · {m.statusLabel} · {m.amountLabel}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            }
          </View>
          <View section={bookings}>
            {(b) =>
              b.pendingDeposits.length > 0 ? (
                <>
                  <h3>Waiting on a deposit ({formatCents(b.pendingCents)})</h3>
                  <ul className="ov-list">
                    {b.pendingDeposits.map((m) => (
                      <li key={m.id}>
                        <strong>{m.dates.join(", ")}</strong>
                        <span className="ov-muted">
                          {m.customerName} · {m.amountLabel}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null
            }
          </View>
          <p className="ov-fine">
            Deposit totals come from recorded booking payments. They are not final job totals.
          </p>
        </section>

        <section className="ov-card" aria-labelledby="ov-calendar-h">
          <h2 id="ov-calendar-h">Days you&apos;ve blocked (next 60 days)</h2>
          <Link
            className="ov-link"
            href={`/dashboard/calendar${company.id === profile?.company_id ? "" : `?company=${encodeURIComponent(params.company ?? "")}`}`}
          >
            Open the full calendar and block days →
          </Link>
          <View section={calendar}>
            {(items) =>
              items.length === 0 ? (
                <p className="ov-muted">No blocked or limited days.</p>
              ) : (
                <ul className="ov-list">
                  {items.map((c) => (
                    <li key={c.id}>
                      <strong>{c.date}</strong>
                      <span className="ov-muted">
                        {c.statusLabel}
                        {c.reason ? ` · ${c.reason}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            }
          </View>
        </section>

        <section className="ov-card" aria-labelledby="ov-leads-h">
          <h2 id="ov-leads-h">Leads</h2>
          <View section={leads}>
            {(l) => (
              <>
                <ul className="ov-bars">
                  {LEAD_STATUSES.map((status) => (
                    <li key={status}>
                      <span>{LEAD_STATUS_LABEL[status]}</span>
                      <span
                        className="ov-bar"
                        style={{
                          width: `${l.total === 0 ? 0 : Math.max(4, (l.byStatus[status] / l.total) * 100)}%`,
                        }}
                        aria-hidden="true"
                      />
                      <span className="ov-bar-n">{l.byStatus[status]}</span>
                    </li>
                  ))}
                </ul>
                {l.truncated && <p className="ov-fine">Showing the most recent 1,000 leads.</p>}
                <h3>Most recent</h3>
                {l.recent.length === 0 ? (
                  <p className="ov-muted">No leads yet.</p>
                ) : (
                  <ul className="ov-list">
                    {l.recent.map((lead) => (
                      <li key={lead.id}>
                        <strong>
                          {lead.name}{" "}
                          <span className="ov-chip">
                            {LEAD_STATUS_LABEL[lead.status as keyof typeof LEAD_STATUS_LABEL] ??
                              lead.status}
                          </span>
                        </strong>
                        <span className="ov-muted">
                          {ageLabel(lead.created_at, now)}
                          {lead.move_date ? ` · move ${lead.move_date}` : ""}
                          {lead.pickup_address || lead.destination_address
                            ? ` · ${lead.pickup_address ?? "?"} → ${lead.destination_address ?? "?"}`
                            : ""}
                        </span>
                        {lead.phone && (
                          <a className="ov-link" href={telHref(lead.phone)}>
                            Call {lead.phone}
                          </a>
                        )}
                        {lead.email && <span className="ov-muted">{lead.email}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </View>
        </section>

        <section className="ov-card" aria-labelledby="ov-mason-h">
          <h2 id="ov-mason-h">Mason</h2>
          <View section={mason}>
            {(m) => (
              <>
                <dl className="ov-facts">
                  <div>
                    <dt>Chats, 7 days</dt>
                    <dd>{m.conversationsLast7Days}</dd>
                  </div>
                  <div>
                    <dt>Leads from chat, 7 days</dt>
                    <dd>{m.leadsFromChatLast7Days}</dd>
                  </div>
                  <div>
                    <dt>Messages, 7 days</dt>
                    <dd>{m.messagesLast7Days}</dd>
                  </div>
                  <div>
                    <dt>AI cost, 30 days (estimate)</dt>
                    <dd>${m.aiCostLast30DaysUsd.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>Replies using the costly model</dt>
                    <dd>
                      {m.advancedShareLast30Days === null
                        ? "—"
                        : `${Math.round(m.advancedShareLast30Days * 100)}%`}
                    </dd>
                  </div>
                </dl>
                {m.truncated && (
                  <p className="ov-fine">Very busy period — counts may be slightly low.</p>
                )}
              </>
            )}
          </View>
        </section>
      </main>
    </div>
  );
}

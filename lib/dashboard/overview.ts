/**
 * Data for the owner Overview dashboard: one place to see what is going
 * on in a company. Read-only — nothing here writes, deletes, or calls an
 * AI model.
 *
 * Every query goes through the caller's RLS-scoped Supabase client AND
 * filters by company_id explicitly, so a signed-in owner only ever sees
 * their own company, and a HURKL admin viewing one company sees only that
 * company's rows.
 *
 * Each section loads independently: if one query fails, that section
 * reports an error and the rest of the page still works. A failed source
 * is never shown as "0" — the dashboard says it could not check.
 *
 * Shaping (counting, summing, labeling) is in pure functions so it can be
 * tested without a database.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type Section<T> = { ok: true; data: T } | { ok: false; error: string };

export const LEAD_STATUSES = ["new", "contacted", "quoted", "booked", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface LeadRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  move_date: string | null;
  pickup_address: string | null;
  destination_address: string | null;
  created_at: string;
}
export interface EscalationRow {
  id: string;
  reason: string;
  customer_summary: string;
  status: string;
  created_at: string;
}
export interface BookingRow {
  id: string;
  lead_id: string;
  requested_dates: string[];
  status: string;
  amount_cents: number;
  expires_at: string;
  paid_at: string | null;
  created_at: string;
}
export interface CalendarRow {
  id: string;
  service_date: string;
  status: string;
  reason: string | null;
}
export interface ConversationRow {
  id: string;
  lead_id: string | null;
  created_at: string;
}
export interface MessageRow {
  direction: string;
  model_tier: string | null;
  estimated_cost_usd: number | string | null;
  created_at: string;
}

const MS_HOUR = 3_600_000;
const MS_DAY = 24 * MS_HOUR;
const QUERY_LIMIT = 1000;
const MESSAGE_LIMIT = 5000;

// ---------- small pure helpers ----------

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
  });
}

export function ageLabel(iso: string, now: Date): string {
  const diff = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "";
  if (diff < 60_000) return "just now";
  if (diff < MS_HOUR) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < MS_DAY) return `${Math.floor(diff / MS_HOUR)}h ago`;
  if (diff < 30 * MS_DAY) return `${Math.floor(diff / MS_DAY)}d ago`;
  return iso.slice(0, 10);
}

export const ESCALATION_REASON_LABEL: Readonly<Record<string, string>> = {
  unsupported_pricing_claim_blocked: "A price Mason couldn't back up was stopped",
  owner_review_requested: "Mason asked for your review",
  customer_requested_owner_contact: "A customer asked to talk to you",
};

export const LEAD_STATUS_LABEL: Readonly<Record<LeadStatus, string>> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  booked: "Booked",
  lost: "Lost",
};

export const BOOKING_STATUS_LABEL: Readonly<Record<string, string>> = {
  payment_pending: "Waiting on deposit",
  paid: "Deposit paid",
  expired: "Expired",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/**
 * Service dates are plain calendar dates with no time zone, and the
 * company's time zone is not configured anywhere yet. To avoid hiding a
 * job that is happening today (late evening in the US is already
 * tomorrow in UTC), "upcoming" starts from yesterday's UTC date.
 */
export function upcomingCutoff(now: Date): string {
  return new Date(now.getTime() - MS_DAY).toISOString().slice(0, 10);
}

// ---------- shapers ----------

export interface LeadsSummary {
  byStatus: Record<LeadStatus, number>;
  total: number;
  newLast7Days: number;
  recent: LeadRow[];
  truncated: boolean;
}

export function shapeLeads(rows: LeadRow[], now: Date): LeadsSummary {
  const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<
    LeadStatus,
    number
  >;
  let newLast7Days = 0;
  for (const row of rows) {
    if ((LEAD_STATUSES as readonly string[]).includes(row.status))
      byStatus[row.status as LeadStatus] += 1;
    if (now.getTime() - new Date(row.created_at).getTime() <= 7 * MS_DAY) newLast7Days += 1;
  }
  const recent = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  return {
    byStatus,
    total: rows.length,
    newLast7Days,
    recent,
    truncated: rows.length >= QUERY_LIMIT,
  };
}

export interface EscalationItem {
  id: string;
  reasonLabel: string;
  summary: string;
  age: string;
  status: string;
}
export interface EscalationsSummary {
  openCount: number;
  items: EscalationItem[];
}

export function shapeEscalations(rows: EscalationRow[], now: Date): EscalationsSummary {
  const active = rows
    .filter((row) => row.status === "open" || row.status === "acknowledged")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    openCount: active.filter((row) => row.status === "open").length,
    items: active.slice(0, 10).map((row) => ({
      id: row.id,
      reasonLabel: ESCALATION_REASON_LABEL[row.reason] ?? "Needs your attention",
      summary: truncate(row.customer_summary, 160),
      age: ageLabel(row.created_at, now),
      status: row.status,
    })),
  };
}

export interface BookingItem {
  id: string;
  customerName: string;
  dates: string[];
  statusLabel: string;
  amountLabel: string;
}
export interface BookingsSummary {
  upcoming: BookingItem[];
  pendingDeposits: BookingItem[];
  paidCount: number;
  paidCents: number;
  pendingCents: number;
  refundedCount: number;
}

export function shapeBookings(
  rows: BookingRow[],
  leadNames: ReadonlyMap<string, string>,
  now: Date,
): BookingsSummary {
  const cutoff = upcomingCutoff(now);
  const toItem = (row: BookingRow): BookingItem => ({
    id: row.id,
    customerName: leadNames.get(row.lead_id) ?? "Customer",
    dates: [...row.requested_dates].sort(),
    statusLabel: BOOKING_STATUS_LABEL[row.status] ?? row.status,
    amountLabel: formatCents(row.amount_cents),
  });
  const firstDate = (row: BookingRow) => [...row.requested_dates].sort()[0] ?? "";

  const paid = rows.filter((row) => row.status === "paid");
  const pending = rows.filter(
    (row) => row.status === "payment_pending" && new Date(row.expires_at).getTime() > now.getTime(),
  );
  return {
    upcoming: paid
      .filter((row) => row.requested_dates.some((d) => d >= cutoff))
      .sort((a, b) => firstDate(a).localeCompare(firstDate(b)))
      .slice(0, 10)
      .map(toItem),
    pendingDeposits: pending.slice(0, 10).map(toItem),
    paidCount: paid.length,
    paidCents: paid.reduce((sum, row) => sum + row.amount_cents, 0),
    pendingCents: pending.reduce((sum, row) => sum + row.amount_cents, 0),
    refundedCount: rows.filter((row) => row.status === "refunded").length,
  };
}

export interface CalendarItem {
  id: string;
  date: string;
  statusLabel: string;
  reason: string | null;
}

export function shapeCalendar(rows: CalendarRow[]): CalendarItem[] {
  return [...rows]
    .sort((a, b) => a.service_date.localeCompare(b.service_date))
    .map((row) => ({
      id: row.id,
      date: row.service_date,
      statusLabel: row.status === "unavailable" ? "Unavailable" : "Limited",
      reason: row.reason,
    }));
}

export interface MasonSummary {
  conversationsLast7Days: number;
  leadsFromChatLast7Days: number;
  messagesLast7Days: number;
  aiCostLast30DaysUsd: number;
  advancedShareLast30Days: number | null;
  truncated: boolean;
}

export function shapeMason(
  conversations: ConversationRow[],
  messages: MessageRow[],
  now: Date,
): MasonSummary {
  const within = (iso: string, days: number) =>
    now.getTime() - new Date(iso).getTime() <= days * MS_DAY;
  const recentConversations = conversations.filter((c) => within(c.created_at, 7));
  const aiMessages = messages.filter((m) => m.model_tier !== null && within(m.created_at, 30));
  const advanced = aiMessages.filter((m) => m.model_tier === "advanced_reasoning").length;
  return {
    conversationsLast7Days: recentConversations.length,
    leadsFromChatLast7Days: recentConversations.filter((c) => c.lead_id !== null).length,
    messagesLast7Days: messages.filter((m) => within(m.created_at, 7)).length,
    aiCostLast30DaysUsd: messages
      .filter((m) => within(m.created_at, 30))
      .reduce((sum, m) => sum + (Number(m.estimated_cost_usd) || 0), 0),
    advancedShareLast30Days: aiMessages.length > 0 ? advanced / aiMessages.length : null,
    truncated: messages.length >= MESSAGE_LIMIT || conversations.length >= QUERY_LIMIT,
  };
}

// ---------- "needs you" list ----------

export interface AttentionItem {
  kind: "escalation" | "deposit_pending" | "new_lead";
  title: string;
  detail: string;
  age: string;
}

export interface Attention {
  items: AttentionItem[];
  /** Sources that could not be checked, so "nothing needs you" is never claimed falsely. */
  unchecked: string[];
  hiddenCount: number;
}

const ATTENTION_CAP = 12;

export function buildAttention(
  leads: Section<LeadsSummary>,
  escalations: Section<EscalationsSummary>,
  bookings: Section<BookingsSummary>,
  now: Date,
): Attention {
  const items: AttentionItem[] = [];
  const unchecked: string[] = [];

  if (escalations.ok) {
    for (const item of escalations.data.items.filter((i) => i.status === "open")) {
      items.push({
        kind: "escalation",
        title: item.reasonLabel,
        detail: item.summary,
        age: item.age,
      });
    }
  } else unchecked.push("Mason's requests for you");

  if (bookings.ok) {
    for (const item of bookings.data.pendingDeposits) {
      items.push({
        kind: "deposit_pending",
        title: `Deposit waiting: ${item.amountLabel}`,
        detail: `${item.customerName} — ${item.dates.join(", ")}`,
        age: "",
      });
    }
  } else unchecked.push("Booking deposits");

  if (leads.ok) {
    for (const lead of leads.data.recent.filter((l) => l.status === "new")) {
      const contact = lead.phone ?? lead.email ?? "no contact info";
      items.push({
        kind: "new_lead",
        title: `New lead: ${lead.name}`,
        detail: contact,
        age: ageLabel(lead.created_at, now),
      });
    }
  } else unchecked.push("New leads");

  return {
    items: items.slice(0, ATTENTION_CAP),
    unchecked,
    hiddenCount: Math.max(0, items.length - ATTENTION_CAP),
  };
}

// ---------- loading ----------

export interface CompanyHeader {
  id: string;
  name: string;
  slogan: string | null;
}

export interface Overview {
  company: CompanyHeader;
  generatedAt: string;
  attention: Attention;
  leads: Section<LeadsSummary>;
  escalations: Section<EscalationsSummary>;
  bookings: Section<BookingsSummary>;
  calendar: Section<CalendarItem[]>;
  mason: Section<MasonSummary>;
}

interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

async function section<T>(name: string, run: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    // Section name and message only — never row contents, which may hold customer details.
    console.error("Overview section failed", {
      section: name,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: "Couldn't load this section." };
  }
}

function rowsOrThrow<T>(result: QueryResult<T>): T[] {
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

export async function loadOverview(
  supabase: SupabaseClient,
  company: CompanyHeader,
  now: Date = new Date(),
): Promise<Overview> {
  const companyId = company.id;
  const since = (days: number) => new Date(now.getTime() - days * MS_DAY).toISOString();
  const today = upcomingCutoff(now);
  const horizon = new Date(now.getTime() + 60 * MS_DAY).toISOString().slice(0, 10);

  // One leads query, shared by the leads section and the booking customer names.
  const leadRowsPromise: Promise<LeadRow[]> = (async () =>
    rowsOrThrow<LeadRow>(
      await supabase
        .from("leads")
        .select(
          "id,name,phone,email,status,move_date,pickup_address,destination_address,created_at",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(QUERY_LIMIT),
    ))();

  const leadsPromise = section("leads", async () => shapeLeads(await leadRowsPromise, now));

  const escalationsPromise = section("escalations", async () =>
    shapeEscalations(
      rowsOrThrow<EscalationRow>(
        await supabase
          .from("owner_escalations")
          .select("id,reason,customer_summary,status,created_at")
          .eq("company_id", companyId)
          .in("status", ["open", "acknowledged"])
          .order("created_at", { ascending: false })
          .limit(50),
      ),
      now,
    ),
  );

  const bookingsPromise = section("bookings", async () => {
    const [bookingRows, leads] = await Promise.all([
      supabase
        .from("booking_reservations")
        .select("id,lead_id,requested_dates,status,amount_cents,expires_at,paid_at,created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(QUERY_LIMIT),
      leadRowsPromise.catch(() => [] as LeadRow[]),
    ]);
    const names = new Map(leads.map((lead) => [lead.id, lead.name]));
    return shapeBookings(
      rowsOrThrow<BookingRow>(bookingRows as QueryResult<BookingRow>),
      names,
      now,
    );
  });

  const calendarPromise = section("calendar", async () =>
    shapeCalendar(
      rowsOrThrow<CalendarRow>(
        await supabase
          .from("company_calendar_blocks")
          .select("id,service_date,status,reason")
          .eq("company_id", companyId)
          .gte("service_date", today)
          .lte("service_date", horizon)
          .limit(100),
      ),
    ),
  );

  const masonPromise = section("mason", async () => {
    const [conversations, messages] = await Promise.all([
      supabase
        .from("conversations")
        .select("id,lead_id,created_at")
        .eq("company_id", companyId)
        .gte("created_at", since(7))
        .limit(QUERY_LIMIT),
      supabase
        .from("messages")
        .select("direction,model_tier,estimated_cost_usd,created_at")
        .eq("company_id", companyId)
        .gte("created_at", since(30))
        .limit(MESSAGE_LIMIT),
    ]);
    return shapeMason(
      rowsOrThrow<ConversationRow>(conversations as QueryResult<ConversationRow>),
      rowsOrThrow<MessageRow>(messages as QueryResult<MessageRow>),
      now,
    );
  });

  const [leads, escalations, bookings, calendar, mason] = await Promise.all([
    leadsPromise,
    escalationsPromise,
    bookingsPromise,
    calendarPromise,
    masonPromise,
  ]);

  return {
    company,
    generatedAt: now.toISOString(),
    attention: buildAttention(leads, escalations, bookings, now),
    leads,
    escalations,
    bookings,
    calendar,
    mason,
  };
}

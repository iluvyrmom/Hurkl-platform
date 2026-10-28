"use server";

import { revalidatePath } from "next/cache";
import {
  calendarToday,
  isValidDate,
  paidOrHeldDates,
  validateBlockRequest,
  type BookingInput,
} from "../../../lib/dashboard/calendar";
import { resolveCompanyAccess } from "../../../lib/dashboard/company";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export interface CalendarActionState {
  ok: boolean;
  message: string;
}

const SIGNED_OUT: CalendarActionState = { ok: false, message: "Please sign in again." };
const NO_COMPANY: CalendarActionState = { ok: false, message: "We couldn't find your company." };
const FAILED: CalendarActionState = {
  ok: false,
  message: "Something went wrong and nothing was changed. Please try again.",
};

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * Block (or mark limited) a day or a range of days. Runs as the signed-in
 * person under the existing company_calendar_blocks row-level-security
 * policies, so the database also enforces who may write. Days a customer has
 * paid for, or is paying a deposit for, are refused.
 */
export async function blockDaysAction(
  _previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  try {
    const supabase = await createSupabaseServerClient();
    const access = await resolveCompanyAccess(supabase, text(formData, "company") || undefined);
    if (access.kind === "signed_out") return SIGNED_OUT;
    if (access.kind === "no_company") return NO_COMPANY;

    const now = new Date();
    const today = calendarToday(now);

    const { data: bookingRows, error: bookingError } = await supabase
      .from("booking_reservations")
      .select("status,requested_dates,expires_at")
      .eq("company_id", access.companyId)
      .in("status", ["paid", "payment_pending"])
      .limit(1000);
    if (bookingError) {
      console.error("calendar: booking lookup failed", bookingError.message);
      return FAILED;
    }
    const bookings: BookingInput[] = (bookingRows ?? []).map((row) => ({
      status: row.status as string,
      requested_dates: row.requested_dates as string[],
      expires_at: row.expires_at as string,
      customerName: "",
    }));

    const result = validateBlockRequest(
      {
        from: text(formData, "from"),
        to: text(formData, "to"),
        status: text(formData, "status"),
        reason: text(formData, "reason"),
      },
      { today, paidOrHeldDates: paidOrHeldDates(bookings, now) },
    );
    if (!result.ok) return { ok: false, message: result.error };

    const rows = result.dates.map((service_date) => ({
      company_id: access.companyId,
      service_date,
      status: result.status,
      reason: result.reason,
      updated_at: now.toISOString(),
    }));
    const { error } = await supabase
      .from("company_calendar_blocks")
      .upsert(rows, { onConflict: "company_id,service_date" });
    if (error) {
      console.error("calendar: block failed", error.message);
      return FAILED;
    }

    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard/overview");
    const n = result.dates.length;
    return {
      ok: true,
      message: `Saved. ${n} ${n === 1 ? "day is" : "days are"} now ${
        result.status === "unavailable" ? "off" : "limited"
      }.`,
    };
  } catch (error) {
    console.error("calendar: block crashed", error instanceof Error ? error.message : "unknown");
    return FAILED;
  }
}

/** Open a blocked day back up. */
export async function unblockDayAction(
  _previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  try {
    const date = text(formData, "date");
    if (!isValidDate(date)) return { ok: false, message: "That day isn't valid." };

    const supabase = await createSupabaseServerClient();
    const access = await resolveCompanyAccess(supabase, text(formData, "company") || undefined);
    if (access.kind === "signed_out") return SIGNED_OUT;
    if (access.kind === "no_company") return NO_COMPANY;

    const { error } = await supabase
      .from("company_calendar_blocks")
      .delete()
      .eq("company_id", access.companyId)
      .eq("service_date", date);
    if (error) {
      console.error("calendar: unblock failed", error.message);
      return FAILED;
    }

    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard/overview");
    return { ok: true, message: `${date} is open again.` };
  } catch (error) {
    console.error("calendar: unblock crashed", error instanceof Error ? error.message : "unknown");
    return FAILED;
  }
}

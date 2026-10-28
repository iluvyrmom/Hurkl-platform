"use server";

import { revalidatePath } from "next/cache";
import { calendarToday } from "../../../lib/dashboard/calendar";
import { resolveCompanyAccess } from "../../../lib/dashboard/company";
import {
  activeDatesFor,
  validateTimeOffRequest,
  type TimeOffRow,
} from "../../../lib/dashboard/time-off";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import type { CalendarActionState } from "./actions";

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

/** Ask for one or more days off. Always lands as "waiting for approval". */
export async function requestTimeOffAction(
  _previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  try {
    const supabase = await createSupabaseServerClient();
    const access = await resolveCompanyAccess(supabase, undefined);
    if (access.kind === "signed_out") return SIGNED_OUT;
    if (access.kind === "no_company") return NO_COMPANY;
    // HURKL admins have no job of their own to take time off from.
    if (access.isAdmin) return { ok: false, message: "Admin accounts don't request days off." };

    const today = calendarToday(new Date());
    const { data: existing, error: existingError } = await supabase
      .from("time_off_requests")
      .select("id,profile_id,service_date,status,note")
      .eq("company_id", access.companyId)
      .eq("profile_id", access.userId)
      .gte("service_date", today)
      .limit(400);
    if (existingError) {
      console.error("time off: lookup failed", existingError.message);
      return FAILED;
    }

    const result = validateTimeOffRequest(
      { from: text(formData, "from"), to: text(formData, "to"), note: text(formData, "note") },
      {
        today,
        alreadyActiveDates: activeDatesFor((existing ?? []) as TimeOffRow[], access.userId),
      },
    );
    if (!result.ok) return { ok: false, message: result.error };

    // company_id and profile_id come from the signed-in session, never the form.
    const rows = result.dates.map((service_date) => ({
      company_id: access.companyId,
      profile_id: access.userId,
      service_date,
      status: "requested",
      note: result.note,
    }));
    const { error } = await supabase
      .from("time_off_requests")
      .upsert(rows, { onConflict: "profile_id,service_date" });
    if (error) {
      console.error("time off: request failed", error.message);
      return FAILED;
    }

    revalidatePath("/dashboard/calendar");
    const n = result.dates.length;
    return {
      ok: true,
      message: `Asked for ${n} ${n === 1 ? "day" : "days"} off. It's waiting for approval.`,
    };
  } catch (error) {
    console.error("time off: request crashed", error instanceof Error ? error.message : "unknown");
    return FAILED;
  }
}

/** Take your own day-off request back (you'd rather work that day). */
export async function cancelTimeOffAction(
  _previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  try {
    const id = text(formData, "id");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "That request isn't valid." };

    const supabase = await createSupabaseServerClient();
    const access = await resolveCompanyAccess(supabase, undefined);
    if (access.kind === "signed_out") return SIGNED_OUT;
    if (access.kind === "no_company") return NO_COMPANY;

    const today = calendarToday(new Date());
    const { data, error } = await supabase
      .from("time_off_requests")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", access.companyId)
      .eq("profile_id", access.userId)
      .in("status", ["requested", "approved"])
      .gte("service_date", today)
      .select("id");
    if (error) {
      console.error("time off: cancel failed", error.message);
      return FAILED;
    }
    if (!data || data.length === 0) {
      return { ok: false, message: "That day can't be taken off the list anymore." };
    }

    revalidatePath("/dashboard/calendar");
    return { ok: true, message: "Done. You're working that day." };
  } catch (error) {
    console.error("time off: cancel crashed", error instanceof Error ? error.message : "unknown");
    return FAILED;
  }
}

/** Owner only: approve or turn down a waiting request. */
export async function decideTimeOffAction(
  _previous: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  try {
    const id = text(formData, "id");
    const decision = text(formData, "decision");
    if (!/^[0-9a-f-]{36}$/i.test(id) || !["approve", "deny"].includes(decision)) {
      return { ok: false, message: "That request isn't valid." };
    }

    const supabase = await createSupabaseServerClient();
    const access = await resolveCompanyAccess(supabase, text(formData, "company") || undefined);
    if (access.kind === "signed_out") return SIGNED_OUT;
    if (access.kind === "no_company") return NO_COMPANY;
    if (!access.isOwnerLevel) {
      return { ok: false, message: "Only the owner can approve days off." };
    }

    const { data, error } = await supabase
      .from("time_off_requests")
      .update({
        status: decision === "approve" ? "approved" : "denied",
        decided_by: access.userId,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", access.companyId)
      .eq("status", "requested")
      .select("id");
    if (error) {
      console.error("time off: decide failed", error.message);
      return FAILED;
    }
    if (!data || data.length === 0) {
      return { ok: false, message: "That request was already handled or changed." };
    }

    revalidatePath("/dashboard/calendar");
    return { ok: true, message: decision === "approve" ? "Approved." : "Turned down." };
  } catch (error) {
    console.error("time off: decide crashed", error instanceof Error ? error.message : "unknown");
    return FAILED;
  }
}

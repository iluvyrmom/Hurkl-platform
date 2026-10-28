"use client";

import { useActionState } from "react";
import { blockDaysAction, unblockDayAction, type CalendarActionState } from "./actions";
import { cancelTimeOffAction, decideTimeOffAction, requestTimeOffAction } from "./time-off-actions";

const INITIAL: CalendarActionState = { ok: false, message: "" };

function Message({ state }: { state: CalendarActionState }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={state.ok ? "ov-good" : "ov-warn"}>
      {state.message}
    </p>
  );
}

export function BlockDaysForm({
  companySlug,
  defaultDate,
}: {
  companySlug: string | null;
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState(blockDaysAction, INITIAL);
  return (
    <form action={action} className="cal-form">
      {companySlug && <input type="hidden" name="company" value={companySlug} />}
      <label className="cal-field">
        <span>First day</span>
        <input type="date" name="from" defaultValue={defaultDate} min={defaultDate} required />
      </label>
      <label className="cal-field">
        <span>Last day (leave the same for one day)</span>
        <input type="date" name="to" defaultValue={defaultDate} min={defaultDate} required />
      </label>
      <fieldset className="cal-field cal-choices">
        <legend>What kind of day</legend>
        <label>
          <input type="radio" name="status" value="unavailable" defaultChecked /> Day off — no
          bookings
        </label>
        <label>
          <input type="radio" name="status" value="limited" /> Limited — fewer jobs than usual
        </label>
      </fieldset>
      <label className="cal-field">
        <span>Note for yourself (optional)</span>
        <input type="text" name="reason" maxLength={120} placeholder="Vacation, truck repair…" />
      </label>
      <button type="submit" className="cal-button" disabled={pending}>
        {pending ? "Saving…" : "Block these days"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function UnblockButton({ companySlug, date }: { companySlug: string | null; date: string }) {
  const [state, action, pending] = useActionState(unblockDayAction, INITIAL);
  return (
    <form action={action} className="cal-unblock">
      {companySlug && <input type="hidden" name="company" value={companySlug} />}
      <input type="hidden" name="date" value={date} />
      <button type="submit" className="cal-button cal-button-quiet" disabled={pending}>
        {pending ? "Opening…" : "Open this day"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function RequestTimeOffForm({ defaultDate }: { defaultDate: string }) {
  const [state, action, pending] = useActionState(requestTimeOffAction, INITIAL);
  return (
    <form action={action} className="cal-form">
      <label className="cal-field">
        <span>First day off</span>
        <input type="date" name="from" defaultValue={defaultDate} min={defaultDate} required />
      </label>
      <label className="cal-field">
        <span>Last day off (leave the same for one day)</span>
        <input type="date" name="to" defaultValue={defaultDate} min={defaultDate} required />
      </label>
      <label className="cal-field">
        <span>Note (optional)</span>
        <input type="text" name="note" maxLength={120} placeholder="Appointment, trip…" />
      </label>
      <button type="submit" className="cal-button" disabled={pending}>
        {pending ? "Sending…" : "Ask for these days off"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function CancelTimeOffButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(cancelTimeOffAction, INITIAL);
  return (
    <form action={action} className="cal-unblock">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="cal-button cal-button-quiet" disabled={pending}>
        {pending ? "Working…" : "I want to work this day"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function DecideTimeOffButtons({
  id,
  companySlug,
}: {
  id: string;
  companySlug: string | null;
}) {
  const [state, action, pending] = useActionState(decideTimeOffAction, INITIAL);
  return (
    <form action={action} className="cal-unblock">
      <input type="hidden" name="id" value={id} />
      {companySlug && <input type="hidden" name="company" value={companySlug} />}
      <div className="cal-actions">
        <button
          type="submit"
          name="decision"
          value="approve"
          className="cal-button"
          disabled={pending}
        >
          Approve
        </button>
        <button
          type="submit"
          name="decision"
          value="deny"
          className="cal-button cal-button-quiet"
          disabled={pending}
        >
          Turn down
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}

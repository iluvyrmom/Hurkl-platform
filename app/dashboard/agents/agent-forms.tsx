"use client";

import { useActionState } from "react";
import {
  decideDraftAction,
  resubmitDraftAction,
  submitNewDraftAction,
  type AgentActionState,
} from "./actions";

const INITIAL: AgentActionState = { ok: false, message: "" };

function Message({ state }: { state: AgentActionState }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={state.ok ? "ov-good" : "ov-warn"}>
      {state.message}
    </p>
  );
}

export function NewDraftForm({
  companySlug,
  channels,
}: {
  companySlug: string | null;
  channels: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(submitNewDraftAction, INITIAL);
  return (
    <form action={action} className="cal-form">
      {companySlug && <input type="hidden" name="company" value={companySlug} />}
      <label className="cal-field">
        <span>What is it for?</span>
        <select name="channel" defaultValue={channels[0]?.value}>
          {channels.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="cal-field">
        <span>The wording</span>
        <textarea name="body" rows={5} maxLength={4000} required />
      </label>
      <button type="submit" className="cal-button" disabled={pending}>
        {pending ? "Checking…" : "Check it"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function ResubmitForm({
  id,
  companySlug,
  initial,
}: {
  id: string;
  companySlug: string | null;
  initial: string;
}) {
  const [state, action, pending] = useActionState(resubmitDraftAction, INITIAL);
  return (
    <form action={action} className="cal-form">
      <input type="hidden" name="id" value={id} />
      {companySlug && <input type="hidden" name="company" value={companySlug} />}
      <label className="cal-field">
        <span>Fix the wording</span>
        <textarea name="body" rows={5} maxLength={4000} defaultValue={initial} required />
      </label>
      <button type="submit" className="cal-button" disabled={pending}>
        {pending ? "Checking…" : "Check it again"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function DecideButtons({ id, companySlug }: { id: string; companySlug: string | null }) {
  const [state, action, pending] = useActionState(decideDraftAction, INITIAL);
  return (
    <form action={action} className="cal-form">
      <input type="hidden" name="id" value={id} />
      {companySlug && <input type="hidden" name="company" value={companySlug} />}
      <label className="cal-field">
        <span>If you turn it down, say why</span>
        <input type="text" name="reason" maxLength={200} />
      </label>
      <div className="cal-actions">
        <button
          type="submit"
          name="decision"
          value="approve"
          className="cal-button"
          disabled={pending}
        >
          Approve the wording
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
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

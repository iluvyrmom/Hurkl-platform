// Lead follow-up sequence: pure decision logic (no I/O) so it can be unit-tested.
//
// Josh's rule for Angi leads:
//   step 0  call #1 immediately
//   step 1  (+5 min)  no answer -> call #2
//   step 2  (+2 min after call #2) no answer -> text right away
//   step 3  (30 min after call #2) still nothing -> call #3
//   step 4  (+3 min after call #3) no answer -> stop, alert the owner
// The sequence ends early if the customer answers, calls back, or texts back.

export type CallOutcome = "answered" | "no_answer" | "in_progress" | "unknown";

export const CALL2_AFTER_CALL1_MIN = 5;
export const CHECK_AFTER_CALL_MIN = 2;
export const CALL3_AFTER_CALL2_MIN = 30;
export const FINAL_CHECK_AFTER_CALL3_MIN = 3;
export const RECHECK_MIN = 1;
/** If ElevenLabs still can't tell us anything this long after placing a call, treat it as no answer. */
export const UNKNOWN_GIVE_UP_MS = 6 * 60_000;
/** A call still "initiated" (ringing, never connected) after this long was not answered. */
const RINGING_GIVE_UP_MS = 3 * 60_000;

export type Decision =
  | { type: "finish"; status: "answered" | "responded" | "exhausted" }
  | { type: "wait"; minutes: number }
  | { type: "call"; attempt: 1 | 2 | 3 }
  | { type: "sms" };

/**
 * Classify an ElevenLabs conversation (GET /v1/convai/conversations/{id}) as answered or not.
 * Prefers Mason's own post-call flag `reached_live_person`; falls back to transcript heuristics.
 */
export function classifyConversation(conv: unknown, placedAtMs: number, nowMs: number): CallOutcome {
  const age = nowMs - placedAtMs;
  if (!conv || typeof conv !== "object") return age > UNKNOWN_GIVE_UP_MS ? "no_answer" : "unknown";
  const c = conv as Record<string, any>;
  const status = String(c.status ?? "");

  if (status === "in-progress") return "in_progress";
  if (status === "failed") return "no_answer";
  if (status === "initiated") return age > RINGING_GIVE_UP_MS ? "no_answer" : "unknown";

  // "processing" or "done"
  const flag = c.analysis?.data_collection_results?.reached_live_person?.value;
  if (flag === true || flag === "true") return "answered";
  if (flag === false || flag === "false") return "no_answer";

  const termination = String(c.metadata?.termination_reason ?? "").toLowerCase();
  if (termination.includes("voicemail")) return "no_answer";

  const transcript = Array.isArray(c.transcript) ? c.transcript : [];
  const userTurns = transcript.filter((t: any) => t?.role === "user" && String(t?.message ?? "").trim().length > 0).length;
  const duration = Number(c.metadata?.call_duration_secs ?? 0);
  return userTurns >= 2 && duration >= 20 ? "answered" : "no_answer";
}

/**
 * What to do next for a lead.
 * @param step       number of actions already taken (0 = nothing yet)
 * @param lastCall   outcome of the most recent call (null if none yet / not relevant)
 * @param responded  customer called or texted back since the lead arrived
 */
export function decideNext(step: number, lastCall: CallOutcome | null, responded: boolean): Decision {
  if (responded) return { type: "finish", status: "responded" };

  const afterCall = (onNoAnswer: Decision): Decision => {
    if (lastCall === "answered") return { type: "finish", status: "answered" };
    if (lastCall === "in_progress" || lastCall === "unknown" || lastCall === null) {
      return { type: "wait", minutes: RECHECK_MIN };
    }
    return onNoAnswer;
  };

  switch (step) {
    case 0:
      return { type: "call", attempt: 1 };
    case 1:
      return afterCall({ type: "call", attempt: 2 });
    case 2:
      return afterCall({ type: "sms" });
    case 3:
      return { type: "call", attempt: 3 };
    case 4:
      return afterCall({ type: "finish", status: "exhausted" });
    default:
      return { type: "finish", status: "exhausted" };
  }
}

/** Minutes until the next check after taking an action. */
export function minutesUntilNextCheck(action: Decision, minutesSinceCall2: number | null): number {
  if (action.type === "call") {
    if (action.attempt === 1) return CALL2_AFTER_CALL1_MIN;
    if (action.attempt === 2) return CHECK_AFTER_CALL_MIN;
    return FINAL_CHECK_AFTER_CALL3_MIN;
  }
  if (action.type === "sms") {
    const elapsed = minutesSinceCall2 ?? CHECK_AFTER_CALL_MIN;
    return Math.max(1, CALL3_AFTER_CALL2_MIN - elapsed);
  }
  if (action.type === "wait") return action.minutes;
  return 0;
}

export function callGreeting(attempt: number, firstName: string | null, companyName: string, service: string): string {
  const hi = `Hi${firstName ? ` ${firstName}` : ""}`;
  return attempt === 1
    ? `${hi}, this is Mason with ${companyName}. I'm calling about the ${service} request you just sent us through Angi. Is now a good time?`
    : `${hi}, this is Mason with ${companyName} again, following up on your ${service} request through Angi. Is now a good time?`;
}

export function smsBody(firstName: string | null, companyName: string, service: string): string {
  const hi = `Hi${firstName ? ` ${firstName}` : ""}`;
  return `${hi}, this is Mason with ${companyName}. We just tried calling about your ${service} request on Angi. ` +
    `Call or text us back at this number anytime. Reply STOP to opt out.`;
}

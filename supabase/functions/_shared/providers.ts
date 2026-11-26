// Thin clients for ElevenLabs (calls) and Twilio (texts + "did they call/text back?").
// Every function returns a result object instead of throwing, so one provider outage
// never crashes the follow-up worker.

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1/convai";
const TWILIO_BASE = "https://api.twilio.com/2010-04-01";
const TIMEOUT_MS = 10_000;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function err(prefix: string, e: unknown): { ok: false; error: string } {
  return { ok: false, error: `${prefix}: ${String((e as Error)?.message ?? e).slice(0, 300)}` };
}

// ---------------- ElevenLabs ----------------

export async function placeCall(params: {
  apiKey: string;
  agentId: string;
  phoneNumberId: string;
  toNumber: string;
  firstMessage: string;
  dynamicVariables: Record<string, string>;
}): Promise<Result<{ conversationId: string | null; callSid: string | null }>> {
  try {
    const res = await fetch(`${ELEVENLABS_BASE}/twilio/outbound-call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "xi-api-key": params.apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        agent_id: params.agentId,
        agent_phone_number_id: params.phoneNumberId,
        to_number: params.toNumber,
        conversation_initiation_client_data: {
          dynamic_variables: params.dynamicVariables,
          conversation_config_override: { agent: { first_message: params.firstMessage } },
        },
      }),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(text); } catch { /* non-JSON */ }
    if (!res.ok || body.success === false) {
      return { ok: false, error: `elevenlabs_${res.status}: ${String(body.message ?? text).slice(0, 300)}` };
    }
    return {
      ok: true,
      value: {
        conversationId: body.conversation_id ? String(body.conversation_id) : null,
        callSid: body.callSid ? String(body.callSid) : body.call_sid ? String(body.call_sid) : null,
      },
    };
  } catch (e) {
    return err("elevenlabs_request", e);
  }
}

/** Returns the conversation JSON, or null if it can't be fetched right now. */
export async function getConversation(apiKey: string, conversationId: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${ELEVENLABS_BASE}/conversations/${encodeURIComponent(conversationId)}`, {
      headers: { Accept: "application/json", "xi-api-key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(JSON.stringify({ msg: "elevenlabs_get_conversation_failed", status: res.status, conversationId }));
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(JSON.stringify({ msg: "elevenlabs_get_conversation_error", conversationId, error: String(e) }));
    return null;
  }
}

// ---------------- Twilio ----------------

export type TwilioCreds = { accountSid: string; authToken: string };

function twilioAuth(c: TwilioCreds): string {
  return "Basic " + btoa(`${c.accountSid}:${c.authToken}`);
}

export async function sendSms(creds: TwilioCreds, from: string, to: string, body: string): Promise<Result<{ sid: string }>> {
  try {
    const res = await fetch(`${TWILIO_BASE}/Accounts/${creds.accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: twilioAuth(creds), "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: new URLSearchParams({ From: from, To: to, Body: body }),
    });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: `twilio_${res.status}_${json.code ?? ""}: ${String(json.message ?? "").slice(0, 300)}` };
    return { ok: true, value: { sid: String(json.sid ?? "") } };
  } catch (e) {
    return err("twilio_request", e);
  }
}

/**
 * Has the customer called or texted the company's Twilio number since `sinceMs`?
 * Returns false (not "unknown") on errors so the sequence keeps going; errors are logged.
 */
export async function customerRespondedSince(creds: TwilioCreds, companyNumber: string, customerNumber: string, sinceMs: number): Promise<boolean> {
  const day = new Date(sinceMs).toISOString().slice(0, 10);
  const check = async (resource: "Calls" | "Messages", dateKey: string, listKey: string, timeField: string) => {
    const qs = new URLSearchParams({ From: customerNumber, To: companyNumber, [dateKey]: day, PageSize: "20" });
    const res = await fetch(`${TWILIO_BASE}/Accounts/${creds.accountSid}/${resource}.json?${qs}`, {
      headers: { Authorization: twilioAuth(creds) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`twilio_${resource}_${res.status}`);
    const json = await res.json() as Record<string, unknown>;
    const items = (json[listKey] as Array<Record<string, unknown>>) ?? [];
    return items.some((i) => {
      const t = Date.parse(String(i[timeField] ?? i.date_created ?? ""));
      return Number.isFinite(t) && t >= sinceMs;
    });
  };
  try {
    const [called, texted] = await Promise.all([
      check("Calls", "StartTime>=", "calls", "start_time"),
      check("Messages", "DateSent>=", "messages", "date_sent"),
    ]);
    return called || texted;
  } catch (e) {
    console.warn(JSON.stringify({ msg: "twilio_response_check_failed", error: String(e) }));
    return false;
  }
}

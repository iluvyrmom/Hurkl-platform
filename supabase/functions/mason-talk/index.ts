// HURKL — mason-talk: the founder talks to Mason in the Mason app.
//
// POST { action: "chat", message }  → Mason's reply, after reading and writing his one memory
//                                      through the shared toolbox (same tools as the HURKL plug).
// POST { action: "history" }        → the latest messages of the founder's conversation.
// POST { action: "speak", text }     → Mason's reply as speech (ElevenLabs, Mason's voice), or
//                                      { fallback: true } so the app shows the reply as text only.
//
// Who:     a signed-in HURKL admin only (checked against profiles.role, like the Mason app).
// Memory:  conversations/messages tables (channel 'mason_app', company HURKL (Internal)).
// Trio:    every reply goes through Memory, Mason and the Verifier before Josh reads or hears it
//          (_shared/mason_trio_talk.ts + mason_trio.ts); each one is audited in mason_trio_checks.
//          Verifier: ChatGPT (OpenAI gpt-6.1-terra, _shared/mason_verifier.ts) when OPENAI_API_KEY
//          is set; MASON_VERIFIER=claude switches back to the temporary Claude Verifier.
// Limits:  enforced here in code: 20 messages a minute, 6 tool uses a reply, a daily and a
//          monthly spending ceiling (MASON_TALK_DAILY_USD, default $2; MASON_TALK_MONTHLY_USD,
//          default $20), message length cap, capped output tokens. Every reply's cost is saved.
// Safety:  no tool here spends money, sends messages or changes a customer's setup; rules and
//          decisions Mason writes wait for the founder's approval; the database refuses secrets.
// Secrets: ANTHROPIC_API_KEY; OPENAI_API_KEY (Verifier and search by meaning); ELEVENLABS_API_KEY (the one josh@hurkl.com ElevenLabs key the
//          phone line already uses; it needs the Text to Speech permission). Voice: Josh's cloned
//          "Mason" voice in that account, the same one the phone line speaks with (checked
//          2026-11-27). One key, one voice, no fallback voice.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { callTool, searchEntries, TOOLS } from "../_shared/mason_tools.ts";
import {
  checkSpend, costUsd, LIMITS, MODELS, type ModelTurn, type Msg, OPENAI_VERIFIER, openaiVerifierCost, pacificPeriodStarts, pickTier,
  runConversation, systemPrompt, type Tier, toClaudeTools,
} from "../_shared/mason_talk.ts";
import { spokenVersion } from "../_shared/speech_text.ts";
import { parseVerdict, talkThroughTrio, VERIFIER_SYSTEM, verifierUserMessage } from "../_shared/mason_trio_talk.ts";
import { createOpenAIVerifier } from "../_shared/mason_verifier.ts";

const HURKL_INTERNAL = "00000000-0000-0000-0000-000000000001";
const CHANNEL = "mason_app";
const CONNECTOR = "Mason (talk)";
const ALLOWED_ORIGINS = ["https://hurkl-mason-app.netlify.app", "http://localhost:8765"];
const CLAUDE_TIMEOUT_MS = 45_000;

// On start-up, log whether the Claude key is set (yes/no only, never the key), so setup can be
// checked from the logs without anyone opening the secrets page.
console.log(JSON.stringify({ msg: "mason_talk_boot", anthropic_key_set: !!(Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim() }));

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function envUsd(name: string, fallback: number): number {
  const v = Number(Deno.env.get(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

async function spentSince(sb: SupabaseClient, iso: string): Promise<number> {
  const { data, error } = await sb.from("messages")
    .select("estimated_cost_usd, conversations!inner(channel)")
    .eq("company_id", HURKL_INTERNAL).eq("conversations.channel", CHANNEL)
    .gte("created_at", iso).not("estimated_cost_usd", "is", null);
  if (error) throw new Error(`spend_query_failed: ${error.message}`);
  return (data ?? []).reduce((s: number, r: { estimated_cost_usd: number | string }) => s + Number(r.estimated_cost_usd || 0), 0);
}

async function conversationFor(sb: SupabaseClient, userId: string): Promise<string> {
  const ext = `founder:${userId}`;
  const { data: found } = await sb.from("conversations").select("id").eq("channel", CHANNEL).eq("external_conversation_id", ext).maybeSingle();
  if (found) return found.id;
  const { data, error } = await sb.from("conversations")
    .upsert({ company_id: HURKL_INTERNAL, channel: CHANNEL, external_conversation_id: ext }, { onConflict: "channel,external_conversation_id" })
    .select("id").single();
  if (error) throw new Error(`conversation_create_failed: ${error.message}`);
  return data.id;
}

// ---------- Mason's voice ----------
const ELEVENLABS_MODEL = "eleven_turbo_v2_5";
/** Josh's own cloned "Mason" voice (josh@hurkl.com ElevenLabs account), same as the phone line. */
const MASON_VOICE_ID = "yrQEKfsjZmZxUPiUm0sj";

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Mason's reply as speech, or the reason it isn't available (the app then shows the text only). */
async function elevenLabsSpeech(text: string): Promise<{ audio: string; mime: string } | { reason: string }> {
  const key = (Deno.env.get("ELEVENLABS_API_KEY") ?? "").trim();
  if (!key) return { reason: "no_elevenlabs_key" };
  const voiceId = MASON_VOICE_ID;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text, model_id: ELEVENLABS_MODEL,
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
        }),
      });
      if (!res.ok) return { reason: `elevenlabs_${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}` };
      return { audio: toBase64(new Uint8Array(await res.arrayBuffer())), mime: "audio/mpeg" };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return { reason: `elevenlabs_error: ${String(e).slice(0, 160)}` };
  }
}

async function callClaude(key: string, tier: Tier, system: string, messages: Msg[], allowTools: boolean, outer?: AbortSignal): Promise<ModelTurn> {
  const m = MODELS[tier];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLAUDE_TIMEOUT_MS);
  if (outer) { if (outer.aborted) ctrl.abort(); else outer.addEventListener("abort", () => ctrl.abort(), { once: true }); }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: m.id,
        max_tokens: m.maxOutputTokens,
        system,
        messages,
        tools: toClaudeTools(TOOLS),
        tool_choice: allowTools ? { type: "auto" } : { type: "none" },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`claude_${res.status}: ${String(body?.error?.message ?? "").slice(0, 200)}`);
    return body as ModelTurn;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(req) };
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

  // Only a signed-in HURKL admin.
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await sb.auth.getUser(jwt);
  if (!auth?.user) return reply(401, { error: "not_signed_in" });
  const { data: profile } = await sb.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (profile?.role !== "hurkl_admin") return reply(403, { error: "hurkl_admin_only" });

  let body: { action?: string; message?: string; text?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action ?? "chat");

  try {
    const conversationId = await conversationFor(sb, auth.user.id);

    if (action === "history") {
      const { data } = await sb.from("messages").select("direction, body, created_at")
        .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(40);
      return reply(200, { messages: (data ?? []).reverse() });
    }
    if (action === "speak") {
      // Only Mason's own recent replies are spoken, so his voice credit can't be spent on anything else.
      const text = String(body.text ?? "").trim();
      const { data: recentReplies } = await sb.from("messages").select("body")
        .eq("conversation_id", conversationId).eq("direction", "outbound").order("created_at", { ascending: false }).limit(5);
      if (!text || !(recentReplies ?? []).some((m: { body: string }) => m.body.trim() === text)) return reply(400, { error: "not_a_recent_reply" });
      const said = spokenVersion(text);
      const voice = await elevenLabsSpeech(said);
      if ("audio" in voice) {
        console.log(JSON.stringify({ msg: "mason_talk_speak", voice: "elevenlabs", chars: said.length }));
        return reply(200, { ...voice, speechText: said });
      }
      console.warn(JSON.stringify({ msg: "mason_talk_speak_fallback", reason: voice.reason }));
      return reply(200, { fallback: true, speechText: said });
    }
    if (action !== "chat") return reply(400, { error: "unknown_action" });

    const message = String(body.message ?? "").trim();
    if (!message) return reply(400, { error: "empty_message" });
    if (message.length > LIMITS.maxMessageChars) {
      return reply(200, { reply: `That's a long one. Send it to me in parts of under ${LIMITS.maxMessageChars} characters and I'll take it all in.` });
    }

    const key = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
    if (!key) {
      return reply(200, { status: "ai_key_missing", reply: "I'm almost ready to talk. My Claude key needs to go into Supabase first, as ANTHROPIC_API_KEY. Once it's there, ask me again." });
    }

    // Rate limit: messages from the founder in the last minute.
    const minuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recent } = await sb.from("messages").select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId).eq("direction", "inbound").gte("created_at", minuteAgo);
    if ((recent ?? 0) >= LIMITS.perMinute) {
      return reply(200, { status: "slow_down", reply: "You're faster than I am. Give me a minute to catch up, then go ahead." });
    }

    // Spending ceilings, checked before any AI call.
    const now = pacificPeriodStarts(new Date());
    const dailyUsd = envUsd("MASON_TALK_DAILY_USD", LIMITS.dailyUsd);
    const monthlyUsd = envUsd("MASON_TALK_MONTHLY_USD", LIMITS.monthlyUsd);
    const [today, month] = await Promise.all([spentSince(sb, now.dayStart), spentSince(sb, now.monthStart)]);
    const spend = checkSpend(today, month, dailyUsd, monthlyUsd);
    if (!spend.ok) return reply(200, { status: "budget_reached", reply: spend.reply, spentTodayUsd: today, spentMonthUsd: month });

    // Earlier conversation, oldest first; must start with the founder.
    const { data: past } = await sb.from("messages").select("direction, body")
      .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(LIMITS.historyMessages);
    const history: Msg[] = (past ?? []).reverse().map((m: { direction: string; body: string }) => ({
      role: m.direction === "inbound" ? "user" as const : "assistant" as const, content: m.body,
    }));
    while (history.length && history[0].role !== "user") history.shift();
    // Two founder messages in a row (an earlier reply failed) are merged so roles alternate.
    const merged: Msg[] = [];
    for (const m of [...history, { role: "user" as const, content: message }]) {
      const last = merged.at(-1);
      if (last && last.role === m.role) last.content = `${last.content}\n\n${m.content}`;
      else merged.push({ ...m });
    }

    const { error: inErr } = await sb.from("messages").insert({
      conversation_id: conversationId, company_id: HURKL_INTERNAL, direction: "inbound", sender_profile_id: auth.user.id, body: message,
    });
    if (inErr) throw new Error(`save_inbound_failed: ${inErr.message}`);

    const briefingText = (await callTool({ sb, connector: CONNECTOR }, "mason_briefing", {}))?.content?.[0]?.text ?? "Briefing unavailable right now.";
    const system = systemPrompt(briefingText, now.label);
    const tier = pickTier(message);
    const started = Date.now();
    const requestId = crypto.randomUUID();
    // The Verifier is ChatGPT (OpenAI) whenever OPENAI_API_KEY is set; MASON_VERIFIER=claude switches
    // back to the temporary Claude Verifier (labeled same_provider_temporary) without a redeploy.
    const openaiKey = (Deno.env.get("OPENAI_API_KEY") ?? "").trim();
    const useOpenAI = !!openaiKey && (Deno.env.get("MASON_VERIFIER") ?? "").trim().toLowerCase() !== "claude";
    const verifierId = useOpenAI ? OPENAI_VERIFIER.id : MODELS.advanced_reasoning.id;
    const reserved = new Map<string, number>(); // reservation id → worst-case USD
    const settled = new Map<string, number>(); // reservation id → actual USD from OpenAI's usage
    const openaiVerify = useOpenAI
      ? createOpenAIVerifier({
        apiKey: openaiKey, model: OPENAI_VERIFIER.id, reviewerId: "verifier", question: message,
        maxOutputTokens: OPENAI_VERIFIER.maxOutputTokens,
        // Same daily and monthly ceilings as Mason; each call is pre-checked at its worst-case cost.
        budget: {
          reserve: async (plan) => {
            const maxUsd = openaiVerifierCost(plan.inputTokenUpperBound, plan.maxOutputTokens);
            if (!checkSpend(today + maxUsd, month + maxUsd, dailyUsd, monthlyUsd).ok) return null;
            const id = crypto.randomUUID();
            reserved.set(id, maxUsd);
            return { id };
          },
          settle: async (u) => {
            const worst = reserved.get(u.reservationId) ?? 0;
            const actual = !u.chargeReservedMaximum && u.inputTokens !== null && u.outputTokens !== null
              ? openaiVerifierCost(u.inputTokens, u.outputTokens) : worst;
            settled.set(u.reservationId, Math.max(actual, u.chargeReservedMaximum ? worst : 0));
            console.log(JSON.stringify({ msg: "mason_trio_verifier_usage", request: u.requestId, status: u.status, model: u.providerModel, in: u.inputTokens, out: u.outputTokens, usd: Number(settled.get(u.reservationId)!.toFixed(6)), ms: u.elapsedMs }));
          },
        },
      })
      : null;
    const tokenCost = (t: Tier, u: { inputTokens: number; outputTokens: number }) => costUsd(t, u.inputTokens, u.outputTokens);
    const conversationText = history.slice(-6).map((m) => `${m.role === "user" ? "Josh" : "Mason"}: ${typeof m.content === "string" ? m.content : ""}`).join("\n");

    // Every reply goes through the trio: Memory gathers, Mason answers, the Verifier checks the
    // exact written and spoken words.
    const outcome = await talkThroughTrio({
      requestId,
      question: message,
      briefing: briefingText,
      conversation: conversationText,
      providers: { mason: "anthropic", memory: "hurkl-code", verifier: useOpenAI ? "openai" : "anthropic" },
      allowSameProviderVerifier: !useOpenAI,
      spoken: spokenVersion,
      // Same search as Mason's toolbox: words and meaning combined. Only active entries become evidence.
      searchMemory: async (q) => (await searchEntries({ sb, connector: CONNECTOR }, q, {}, 6)).filter((r) => r.status === "active"),
      doWork: async (signal) => {
        const toolResults: { name: string; text: string }[] = [];
        const r = await runConversation({
          messages: merged,
          callModel: (msgs, allowTools) => callClaude(key, tier, system, msgs, allowTools, signal),
          runTool: async (name, input) => {
            const t = await callTool({ sb, connector: CONNECTOR }, name, input);
            const text = t?.content?.[0]?.text ?? "Unknown tool.";
            toolResults.push({ name, text });
            console.log(JSON.stringify({ msg: "mason_talk_tool", tool: name }));
            return { text, isError: !!t?.isError || !t };
          },
        });
        return { reply: r.reply, toolResults, costUsd: tokenCost(tier, r) };
      },
      rewrite: async ({ draft, feedback, evidence, signal }) => {
        const ev = evidence.map((e) => `<evidence id="${e.id}">\n${e.body}\n</evidence>`).join("\n");
        const turn = await callClaude(key, tier, `${system}\n\nEVIDENCE YOU MAY RELY ON\n${ev}`, [{
          role: "user",
          content: `Josh asked: ${message}\n\nYour draft reply:\n${draft}\n\nThe independent check found these problems:\n- ${feedback.join("\n- ")}\n\nWrite the corrected reply to Josh only. Use only the evidence; if it doesn't say, say so plainly.`,
        }], false, signal);
        const text = turn.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
        return { reply: text, costUsd: costUsd(tier, turn.usage?.input_tokens ?? 0, turn.usage?.output_tokens ?? 0) };
      },
      verifyReceipt: openaiVerify
        ? async (envelope, ctx, c, addCost) => {
          const before = new Set(reserved.keys());
          try {
            const r = await openaiVerify(envelope, ctx, c);
            console.log(JSON.stringify({ msg: "mason_trio_verdict", request: requestId, approved: r.approved, reasons: r.reasons.length, model: verifierId }));
            return r;
          } catch (e) {
            console.warn(JSON.stringify({ msg: "mason_trio_verifier_failed", request: requestId, model: verifierId, error: String(e).slice(0, 120) }));
            throw e;
          } finally {
            // Count each check's actual cost; if OpenAI gave no usable usage, its worst case.
            for (const [id, worst] of reserved) if (!before.has(id)) addCost(settled.get(id) ?? worst);
          }
        }
        : undefined,
      verifyModel: async ({ envelope, evidence, signal }) => {
        const turn = await callClaude(key, "advanced_reasoning", VERIFIER_SYSTEM, [{ role: "user", content: verifierUserMessage(envelope, evidence) }], false, signal);
        const raw = turn.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
        const v = parseVerdict(raw);
        console.log(JSON.stringify({ msg: "mason_trio_verdict", request: requestId, approved: v.approved, reasons: v.reasons.length, model: verifierId }));
        return { ...v, costUsd: costUsd("advanced_reasoning", turn.usage?.input_tokens ?? 0, turn.usage?.output_tokens ?? 0) };
      },
      canSpend: async (more) => checkSpend(today + more, month + more, dailyUsd, monthlyUsd).ok,
      commit: async (envelope) => {
        const { data, error } = await sb.from("messages").insert({
          conversation_id: conversationId, company_id: HURKL_INTERNAL, direction: "outbound", body: envelope.text,
          model_tier: tier, model_id: MODELS[tier].id, external_message_id: `trio:${requestId}`,
        }).select("id").single();
        if (error || !data) throw new Error(`commit_failed: ${error?.message ?? "no row"}`);
        return data.id;
      },
    });

    // A blocked reply still gets saved (the fixed holding reply) so the conversation stays whole.
    let messageId = outcome.recordId;
    if (!messageId) {
      const { data } = await sb.from("messages").insert({
        conversation_id: conversationId, company_id: HURKL_INTERNAL, direction: "outbound", body: outcome.reply,
        model_tier: tier, model_id: MODELS[tier].id, external_message_id: `trio:${requestId}`,
      }).select("id").single();
      messageId = data?.id ?? null;
    }
    const latency = Date.now() - started;
    if (messageId) await sb.from("messages").update({ estimated_cost_usd: outcome.costUsd.toFixed(6), latency_ms: latency }).eq("id", messageId);
    const { error: auditErr } = await sb.from("mason_trio_checks").insert({
      request_id: requestId, conversation_id: conversationId, message_id: messageId, status: outcome.status,
      blocked_reason: outcome.blockedReason, independence: outcome.independence,
      providers: { mason: MODELS[tier].id, memory: "hurkl-code", verifier: verifierId },
      attempts: outcome.attempts, stages: outcome.stages, receipts: outcome.receipts,
      context_version: outcome.contextVersion, digest: outcome.digest, cost_usd: outcome.costUsd.toFixed(6), latency_ms: latency,
    });
    if (auditErr) console.error(JSON.stringify({ msg: "mason_trio_audit_failed", error: auditErr.message }));
    await sb.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);

    console.log(JSON.stringify({ msg: "mason_talk_reply", tier, trio: outcome.status, reason: outcome.blockedReason, attempts: outcome.attempts, cost: outcome.costUsd, latency }));
    return reply(200, {
      reply: outcome.reply, tier, checked: outcome.status === "verified", independence: outcome.independence,
      costUsd: Number(outcome.costUsd.toFixed(6)), spentTodayUsd: Number((today + outcome.costUsd).toFixed(4)), spentMonthUsd: Number((month + outcome.costUsd).toFixed(4)),
    });
  } catch (e) {
    console.error(JSON.stringify({ msg: "mason_talk_failed", action, error: String(e).slice(0, 300) }));
    return reply(500, { error: "temporary_error", reply: "Something went wrong on my side. Try me again in a moment." });
  }
});

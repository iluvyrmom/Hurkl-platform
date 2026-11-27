// HURKL — mason-talk: the founder talks to Mason in the Mason app.
//
// POST { action: "chat", message }  → Mason's reply, after reading and writing his one memory
//                                      through the shared toolbox (same tools as the HURKL plug).
// POST { action: "history" }        → the latest messages of the founder's conversation.
//
// Who:     a signed-in HURKL admin only (checked against profiles.role, like the Mason app).
// Memory:  conversations/messages tables (channel 'mason_app', company HURKL (Internal)).
// Limits:  enforced here in code: 20 messages a minute, 6 tool uses a reply, a daily and a
//          monthly spending ceiling (MASON_TALK_DAILY_USD, default $2; MASON_TALK_MONTHLY_USD,
//          default $20), message length cap, capped output tokens. Every reply's cost is saved.
// Safety:  no tool here spends money, sends messages or changes a customer's setup; rules and
//          decisions Mason writes wait for the founder's approval; the database refuses secrets.
// Secret:  ANTHROPIC_API_KEY (Supabase Edge Function secret, entered by the founder).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { callTool, TOOLS } from "../_shared/mason_tools.ts";
import {
  checkSpend, costUsd, LIMITS, MODELS, type ModelTurn, type Msg, pacificPeriodStarts, pickTier,
  runConversation, systemPrompt, type Tier, toClaudeTools,
} from "../_shared/mason_talk.ts";

const HURKL_INTERNAL = "00000000-0000-0000-0000-000000000001";
const CHANNEL = "mason_app";
const CONNECTOR = "Mason (talk)";
const ALLOWED_ORIGINS = ["https://hurkl-mason-app.netlify.app", "http://localhost:8765"];
const CLAUDE_TIMEOUT_MS = 45_000;

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

async function callClaude(key: string, tier: Tier, system: string, messages: Msg[], allowTools: boolean): Promise<ModelTurn> {
  const m = MODELS[tier];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLAUDE_TIMEOUT_MS);
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

  let body: { action?: string; message?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action ?? "chat");

  try {
    const conversationId = await conversationFor(sb, auth.user.id);

    if (action === "history") {
      const { data } = await sb.from("messages").select("direction, body, created_at")
        .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(40);
      return reply(200, { messages: (data ?? []).reverse() });
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

    const briefing = await callTool({ sb, connector: CONNECTOR }, "mason_briefing", {});
    const system = systemPrompt(briefing?.content?.[0]?.text ?? "Briefing unavailable right now.", now.label);
    const tier = pickTier(message);
    const started = Date.now();

    let result;
    try {
      result = await runConversation({
        messages: merged,
        callModel: (msgs, allowTools) => callClaude(key, tier, system, msgs, allowTools),
        runTool: async (name, input) => {
          const r = await callTool({ sb, connector: CONNECTOR }, name, input);
          console.log(JSON.stringify({ msg: "mason_talk_tool", tool: name }));
          return { text: r?.content?.[0]?.text ?? "Unknown tool.", isError: !!r?.isError || !r };
        },
      });
    } catch (e) {
      console.error(JSON.stringify({ msg: "mason_talk_claude_failed", tier, error: String(e).slice(0, 300) }));
      return reply(200, { status: "ai_unavailable", reply: "I'm having trouble thinking right now. Your message is saved, so try me again in a minute." });
    }

    const cost = costUsd(tier, result.inputTokens, result.outputTokens);
    const { error: outErr } = await sb.from("messages").insert({
      conversation_id: conversationId, company_id: HURKL_INTERNAL, direction: "outbound", body: result.reply,
      model_tier: tier, model_id: MODELS[tier].id, input_tokens: result.inputTokens, output_tokens: result.outputTokens,
      estimated_cost_usd: cost.toFixed(6), latency_ms: Date.now() - started,
    });
    if (outErr) console.error(JSON.stringify({ msg: "mason_talk_save_reply_failed", error: outErr.message }));
    await sb.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);

    console.log(JSON.stringify({ msg: "mason_talk_reply", tier, tools: result.toolsUsed, calls: result.modelCalls, cost }));
    return reply(200, {
      reply: result.reply, tier, toolsUsed: result.toolsUsed,
      costUsd: Number(cost.toFixed(6)), spentTodayUsd: Number((today + cost).toFixed(4)), spentMonthUsd: Number((month + cost).toFixed(4)),
    });
  } catch (e) {
    console.error(JSON.stringify({ msg: "mason_talk_failed", action, error: String(e).slice(0, 300) }));
    return reply(500, { error: "temporary_error", reply: "Something went wrong on my side. Try me again in a moment." });
  }
});

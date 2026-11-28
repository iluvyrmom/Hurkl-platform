// HURKL — mason-talk core: the founder talking to Mason in the Mason app.
//
// Pure logic, no network or database here, so it is fully testable: which model to use, what a
// reply costs, the spending and tool limits, Mason's instructions, and the tool loop.
// The HTTP function (supabase/functions/mason-talk) wires this to Claude, the toolbox and the
// database. Every limit below is enforced in code, not just asked for in the prompt.

/** Claude models for the Supabase functions. Prices: Anthropic list, prompts up to 100,000 tokens,
 * checked 2026-11-26 at https://platform.claude.com/docs/en/about-claude/pricing. Estimates only,
 * not billing-accurate; re-check when Mason's monthly roster review comes round.
 * (The website brain keeps its own copy in lib/mason/model-config.ts until step 4 merges them.) */
export const MODELS = {
  low_cost: { id: "claude-haiku-5-5", maxOutputTokens: 700, usdPerMillionIn: 0.10, usdPerMillionOut: 0.50 },
  advanced_reasoning: { id: "claude-sonnet-5-5", maxOutputTokens: 1200, usdPerMillionIn: 2, usdPerMillionOut: 10 },
} as const;
export type Tier = keyof typeof MODELS;

/** The independent Verifier (OpenAI, Responses API). Price is OpenAI's standard list price for
 * gpt-6.1-terra, $1 per million input and $5 per million output tokens (openai.com pricing and
 * launch coverage, checked 2026-11-28). Estimates only; re-check at the monthly roster review. */
export const OPENAI_VERIFIER = { id: "gpt-6.1-terra", maxOutputTokens: 2000, usdPerMillionIn: 1, usdPerMillionOut: 5 } as const;
export function openaiVerifierCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1e6) * OPENAI_VERIFIER.usdPerMillionIn + (outputTokens / 1e6) * OPENAI_VERIFIER.usdPerMillionOut;
}

export const LIMITS = {
  /** Most toolbox uses in one reply, so a reply can never loop. */
  maxToolUses: 6,
  /** Most messages a minute from the founder. */
  perMinute: 20,
  /** Spending ceilings in USD; overridable with MASON_TALK_DAILY_USD / MASON_TALK_MONTHLY_USD. */
  dailyUsd: 2,
  monthlyUsd: 20,
  /** Longest message accepted. */
  maxMessageChars: 4000,
  /** How many earlier messages ride along as conversation context. */
  historyMessages: 20,
};

/** Everyday talk uses the cheap model; plans and judgment calls get the stronger one. */
export function pickTier(message: string): Tier {
  const m = message.toLowerCase();
  if (m.length > 600) return "advanced_reasoning";
  if (/\b(plan|strategy|strategize|think (hard|it through|this through)|figure out|compare|pros and cons|should i|what would you do|break (it|this) down|prioriti[sz]e)\b/.test(m)) {
    return "advanced_reasoning";
  }
  return "low_cost";
}

export function costUsd(tier: Tier, inputTokens: number, outputTokens: number): number {
  const p = MODELS[tier];
  return (inputTokens / 1e6) * p.usdPerMillionIn + (outputTokens / 1e6) * p.usdPerMillionOut;
}

export type SpendCheck = { ok: true } | { ok: false; reply: string };

/** Refuse a new reply once today's or this month's spend has reached its ceiling. */
export function checkSpend(spentTodayUsd: number, spentMonthUsd: number, dailyUsd: number, monthlyUsd: number): SpendCheck {
  if (spentMonthUsd >= monthlyUsd) {
    return { ok: false, reply: `I've reached this month's $${monthlyUsd} thinking budget, so I'm pausing until the 1st. You can raise it in Supabase (MASON_TALK_MONTHLY_USD) any time.` };
  }
  if (spentTodayUsd >= dailyUsd) {
    return { ok: false, reply: `I've reached today's $${dailyUsd} thinking budget, so I'll pick back up tomorrow morning. You can raise it in Supabase (MASON_TALK_DAILY_USD) any time.` };
  }
  return { ok: true };
}

/** Mason's standing instructions when the founder talks to him, plus his fresh briefing. */
export function systemPrompt(briefing: string, nowLabel: string): string {
  return [
    "You are Mason, HURKL's office manager. You are talking with Josh, the founder, in his Mason app, usually on his phone and often by voice.",
    "",
    "HOW YOU TALK",
    "- Like a sharp, steady office manager: plain words, short answers that fit a phone screen (usually 1 to 4 sentences), and the next step always named.",
    "- Lead with the answer. No preamble, no lists unless he asks or the answer is a short checklist.",
    "- Your words may be read aloud, so write them the way you would say them: no tables, no markdown symbols, no long numbers spelled with dashes.",
    "- When you don't know, say so plainly and offer to find out or to add a task.",
    "",
    "WHAT YOU KNOW",
    "- Your memory is the single source of truth. Your briefing is below. Before answering anything about HURKL, a company, a rule, a past decision or a task, check with search_memory or read_company_file instead of guessing.",
    "- Never invent facts, prices, dates, statuses or completed work. If memory doesn't have it, say so.",
    "",
    "WHAT YOU DO",
    "- You can save notes, lessons and facts he tells you, add tasks, and mark tasks started or done. Do it when he asks or clearly means it, then say in a few words what you saved.",
    "- New rules and decisions you write wait for his OK in the \"Your OK\" tab. Tell him that when you write one.",
    "- You have no way to spend money, send messages, call anyone or change a customer's setup. If he asks for that, say it's coming in a later step and offer to add a task.",
    "- Keep each company's details in that company's own file (scope company). Never carry one company's rules, prices or customers into another company's answer.",
    "- Never repeat or save passwords, keys or card numbers. If he says one, tell him to put it in Supabase or Netlify himself.",
    "",
    `Right now it is ${nowLabel} (Pacific time).`,
    "",
    "YOUR BRIEFING",
    briefing,
  ].join("\n");
}

// ---------- the tool loop ----------

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type Msg = { role: "user" | "assistant"; content: string | ContentBlock[] };
export type ModelTurn = { content: ContentBlock[]; stop_reason: string; usage: { input_tokens: number; output_tokens: number } };

export type LoopResult = {
  reply: string;
  inputTokens: number;
  outputTokens: number;
  toolsUsed: string[];
  modelCalls: number;
};

/**
 * Ask Claude, run the tools he asks for, and repeat until he answers in words.
 * At most LIMITS.maxToolUses tool runs; after that he must answer with what he has.
 */
export async function runConversation(opts: {
  messages: Msg[];
  callModel: (messages: Msg[], allowTools: boolean) => Promise<ModelTurn>;
  runTool: (name: string, input: Record<string, unknown>) => Promise<{ text: string; isError: boolean }>;
  maxToolUses?: number;
}): Promise<LoopResult> {
  const max = opts.maxToolUses ?? LIMITS.maxToolUses;
  const messages = [...opts.messages];
  const toolsUsed: string[] = [];
  let inputTokens = 0, outputTokens = 0, modelCalls = 0;

  // max tool rounds + one final answer, so this always ends.
  for (let round = 0; round <= max; round++) {
    const allowTools = toolsUsed.length < max;
    const turn = await opts.callModel(messages, allowTools);
    modelCalls++;
    inputTokens += turn.usage?.input_tokens ?? 0;
    outputTokens += turn.usage?.output_tokens ?? 0;

    const uses = turn.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
    const words = turn.content.filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!uses.length || turn.stop_reason !== "tool_use") {
      return { reply: words || "I'm here. What do you need?", inputTokens, outputTokens, toolsUsed, modelCalls };
    }

    messages.push({ role: "assistant", content: turn.content });
    const results: ContentBlock[] = [];
    for (const u of uses) {
      if (toolsUsed.length >= max) {
        results.push({ type: "tool_result", tool_use_id: u.id, content: "Tool limit reached for this reply. Answer with what you have.", is_error: true });
        continue;
      }
      toolsUsed.push(u.name);
      try {
        const r = await opts.runTool(u.name, u.input ?? {});
        results.push({ type: "tool_result", tool_use_id: u.id, content: r.text.slice(0, 30_000), is_error: r.isError || undefined });
      } catch {
        results.push({ type: "tool_result", tool_use_id: u.id, content: "That tool failed. Tell Josh plainly if it matters.", is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: "I looked into that but ran out of steps for one reply. Ask me again a little more narrowly and I'll finish it.", inputTokens, outputTokens, toolsUsed, modelCalls };
}

/** The toolbox's MCP-style tool list in the shape Claude's Messages API expects. */
export function toClaudeTools(tools: { name: string; description: string; inputSchema: unknown }[]) {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
}

/** Start of today and of this month in Pacific time, as ISO strings, for the spending ceilings. */
export function pacificPeriodStarts(now: Date): { dayStart: string; monthStart: string; label: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset" })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  const offset = String(parts.timeZoneName ?? "GMT-8").replace("GMT", "") || "-8";
  const sign = offset.startsWith("+") ? "+" : "-";
  const hours = offset.replace(/^[+-]/, "").split(":")[0].padStart(2, "0");
  const tz = `${sign}${hours}:00`;
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(now);
  return {
    dayStart: new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00${tz}`).toISOString(),
    monthStart: new Date(`${parts.year}-${parts.month}-01T00:00:00${tz}`).toISOString(),
    label,
  };
}

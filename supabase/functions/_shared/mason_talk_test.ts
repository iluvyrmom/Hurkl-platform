import { deepStrictEqual as assertEquals, ok } from "node:assert";
import { checkSpend, costUsd, LIMITS, type ModelTurn, type Msg, pacificPeriodStarts, pickTier, runConversation, systemPrompt, toClaudeTools } from "./mason_talk.ts";
import { TOOLS } from "./mason_tools.ts";

Deno.test("everyday talk uses the cheap model; plans and judgment calls use the stronger one", () => {
  assertEquals(pickTier("What's waiting on me?"), "low_cost");
  assertEquals(pickTier("Add a task to call the sign shop"), "low_cost");
  assertEquals(pickTier("Help me plan the Executive Drains launch"), "advanced_reasoning");
  assertEquals(pickTier("Should I raise the price for Travis?"), "advanced_reasoning");
  assertEquals(pickTier("x".repeat(601)), "advanced_reasoning");
});

Deno.test("cost uses the checked list prices", () => {
  // Haiku 5.5: 8,000 in + 300 out = $0.0008 + $0.00015
  ok(Math.abs(costUsd("low_cost", 8000, 300) - 0.00095) < 1e-9);
  // Sonnet 5.5: 8,000 in + 300 out = $0.016 + $0.003
  ok(Math.abs(costUsd("advanced_reasoning", 8000, 300) - 0.019) < 1e-9);
});

Deno.test("spending ceilings stop new replies and say so plainly", () => {
  assertEquals(checkSpend(0.5, 5, 2, 20), { ok: true });
  const day = checkSpend(2, 5, 2, 20);
  ok(!day.ok && day.reply.includes("today's $2"));
  const month = checkSpend(0, 20, 2, 20);
  ok(!month.ok && month.reply.includes("this month's $20"));
});

const turn = (content: ModelTurn["content"], stop = "end_turn"): ModelTurn => ({ content, stop_reason: stop, usage: { input_tokens: 100, output_tokens: 10 } });

Deno.test("a plain answer comes straight back", async () => {
  const r = await runConversation({
    messages: [{ role: "user", content: "hi" }],
    callModel: () => Promise.resolve(turn([{ type: "text", text: "Morning, Josh." }])),
    runTool: () => Promise.resolve({ text: "", isError: false }),
  });
  assertEquals(r.reply, "Morning, Josh.");
  assertEquals(r.toolsUsed, []);
  assertEquals(r.modelCalls, 1);
});

Deno.test("Mason uses a tool, then answers from what it returned", async () => {
  let call = 0;
  const seen: Msg[][] = [];
  const r = await runConversation({
    messages: [{ role: "user", content: "what's waiting on me?" }],
    callModel: (m) => {
      seen.push(m);
      call++;
      return Promise.resolve(call === 1
        ? turn([{ type: "tool_use", id: "t1", name: "mason_briefing", input: {} }], "tool_use")
        : turn([{ type: "text", text: "One item: the step 2 plan." }]));
    },
    runTool: (name) => Promise.resolve({ text: `ran ${name}`, isError: false }),
  });
  assertEquals(r.reply, "One item: the step 2 plan.");
  assertEquals(r.toolsUsed, ["mason_briefing"]);
  assertEquals(r.inputTokens, 200);
  const last = seen[1].at(-1)!;
  ok(Array.isArray(last.content) && last.content[0].type === "tool_result");
});

Deno.test("a reply can never use more than six tools, and still ends with an answer", async () => {
  let n = 0;
  let toolsOfferedOnLastCall = true;
  const r = await runConversation({
    messages: [{ role: "user", content: "dig through everything" }],
    callModel: (_m, allowTools) => {
      toolsOfferedOnLastCall = allowTools;
      if (!allowTools) return Promise.resolve(turn([{ type: "text", text: "Here's what I found." }]));
      return Promise.resolve(turn([{ type: "tool_use", id: `t${n++}`, name: "search_memory", input: { query: "x" } }], "tool_use"));
    },
    runTool: () => Promise.resolve({ text: "result", isError: false }),
  });
  assertEquals(r.toolsUsed.length, LIMITS.maxToolUses);
  assertEquals(toolsOfferedOnLastCall, false);
  assertEquals(r.reply, "Here's what I found.");
});

Deno.test("a failing tool doesn't break the reply", async () => {
  let call = 0;
  const r = await runConversation({
    messages: [{ role: "user", content: "check Travis" }],
    callModel: () => Promise.resolve(++call === 1
      ? turn([{ type: "tool_use", id: "t1", name: "read_company_file", input: { company: "Executive Drains" } }], "tool_use")
      : turn([{ type: "text", text: "I couldn't open that file just now." }])),
    runTool: () => Promise.reject(new Error("db down")),
  });
  assertEquals(r.reply, "I couldn't open that file just now.");
});

Deno.test("the toolbox converts to Claude's tool format", () => {
  const tools = toClaudeTools(TOOLS);
  assertEquals(tools.length, 9);
  ok(tools.every((t) => t.name && t.description && t.input_schema));
});

Deno.test("Mason's instructions carry the approval and secrets rules and the briefing", () => {
  const p = systemPrompt("BRIEFING TEXT", "Friday, November 27, 2026 at 2:00 AM");
  ok(p.includes("Your OK"));
  ok(p.includes("passwords, keys or card numbers"));
  ok(p.includes("no way to spend money"));
  ok(p.endsWith("BRIEFING TEXT"));
});

Deno.test("Pacific day and month start, across the daylight-saving change", () => {
  // 2026-11-27 10:00 UTC = 2:00 AM PST (UTC-8)
  const winter = pacificPeriodStarts(new Date("2026-11-27T10:00:00Z"));
  assertEquals(winter.dayStart, "2026-11-27T08:00:00.000Z");
  assertEquals(winter.monthStart, "2026-11-01T08:00:00.000Z");
  // 2026-07-04 06:00 UTC = 11:00 PM PDT on July 3 (UTC-7)
  const summer = pacificPeriodStarts(new Date("2026-07-04T06:00:00Z"));
  assertEquals(summer.dayStart, "2026-07-03T07:00:00.000Z");
});

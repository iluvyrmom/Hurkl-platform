import { deepStrictEqual as assertEquals, ok } from "node:assert";
import { NEEDS_APPROVAL, TOOLS, WRITE_TOOLS } from "./mason_tools.ts";

Deno.test("toolbox has the nine tools the plug has always offered", () => {
  assertEquals(TOOLS.map((t) => t.name).sort(), [
    "add_memory", "add_task", "get_ai_roster", "log_ai_job", "mason_briefing",
    "read_company_file", "recommend_ai", "search_memory", "update_task",
  ]);
});

Deno.test("every write tool is a real tool, and every tool has an input schema", () => {
  const names = new Set(TOOLS.map((t) => t.name));
  for (const w of WRITE_TOOLS) ok(names.has(w), w);
  for (const t of TOOLS) ok(t.inputSchema && t.inputSchema.type === "object", t.name);
});

Deno.test("rules and decisions always wait for the founder", () => {
  ok(NEEDS_APPROVAL.has("rule"));
  ok(NEEDS_APPROVAL.has("decision"));
  ok(!NEEDS_APPROVAL.has("note"));
});

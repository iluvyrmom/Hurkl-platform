// HURKL — the HURKL plug: Mason's memory and AI roster as a remote MCP server.
//
// Any approved AI tool (Claude, ChatGPT, coding sessions, ...) connects here so they all share
// ONE memory: Mason's. Each tool gets its own key, created by the founder in the Mason app.
// Only the key's SHA-256 hash is stored; keys can be revoked any time.
//
// Transport: MCP Streamable HTTP, stateless, JSON responses (POST only).
// Auth:      Authorization: Bearer mason_<48 hex>   (checked by public.mason_connector_check)
// Limits:    per-key daily write limit (database), body size cap, result size caps.
// Safety:    the database refuses anything that looks like a password, key or card number;
//            rules/decisions (and any replacement of an existing entry) written through the plug
//            wait for the founder's approval; nothing is ever deleted.
// Makes no AI-model calls, so it adds no AI cost.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const SERVER = { name: "hurkl-mason", title: "Mason (HURKL)", version: "1.0.0" };
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_BODY = 64 * 1024;
const KINDS = ["decision", "rule", "lesson", "fact", "task", "note"] as const;
const SCOPES = ["hurkl_core", "company", "founder"] as const;
const TASK_TYPES = ["planning", "writing", "coding", "testing", "design", "animation", "video", "voice", "research", "data", "marketing"];
const NEEDS_APPROVAL = new Set(["decision", "rule"]);

const INSTRUCTIONS =
  "You are working for HURKL under Mason, the founder's AI office manager. Mason's memory is the single source of truth. " +
  "At the START of every session call mason_briefing. Before answering questions about HURKL, its companies, rules or past " +
  "decisions, call search_memory. At the END of meaningful work, record what you did (add_memory kind 'note' or 'lesson'), " +
  "update tasks, and log_ai_job for the AI roster. Rules and decisions you write wait for the founder's approval. " +
  "Never send passwords, keys or card numbers. Keep each company's private details in its own company file (scope 'company').";

type Ctx = { sb: SupabaseClient; token: string; connector: string };

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}
const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
const text = (t: string, isError = false) => ({ content: [{ type: "text", text: t }], isError });

function str(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

// ---------- tool definitions ----------
const TOOLS = [
  {
    name: "mason_briefing",
    title: "Mason briefing (start here)",
    description: "Start-of-session briefing from Mason: active HURKL rules and decisions, open tasks, items waiting for the founder's approval, and the list of companies. Call this first in every session.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "search_memory",
    title: "Search Mason's memory",
    description: "Search Mason's memory (decisions, rules, lessons, facts, tasks, notes). Use before answering anything about HURKL, its companies, past decisions or how things work.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to search for." },
        scope: { type: "string", enum: [...SCOPES], description: "Optional: hurkl_core, company or founder." },
        company: { type: "string", description: "Optional company slug or name, e.g. a1-best-moving or Executive Drains." },
        kind: { type: "string", enum: [...KINDS] },
        include_history: { type: "boolean", description: "Also return replaced/declined entries. Default false." },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "read_company_file",
    title: "Read a company's file",
    description: "Everything Mason knows about one company (its private file): active rules, decisions, facts and open tasks. Never use one company's details for another company.",
    inputSchema: {
      type: "object",
      properties: { company: { type: "string", description: "Company slug or name." } },
      required: ["company"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "add_memory",
    title: "Add to Mason's memory",
    description: "Record something in Mason's memory. kind 'rule' or 'decision', or anything that replaces an existing entry, waits for the founder's approval. Use scope 'company' (with company) for anything specific to one company, 'hurkl_core' for Mason's general skills and lessons, 'founder' for the founder's own notes.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["decision", "rule", "lesson", "fact", "note"] },
        title: { type: "string", maxLength: 200 },
        body: { type: "string", maxLength: 8000 },
        scope: { type: "string", enum: [...SCOPES] },
        company: { type: "string", description: "Required when scope is 'company'." },
        tags: { type: "array", items: { type: "string", maxLength: 40 }, maxItems: 10 },
        replaces_id: { type: "string", description: "Optional id of the entry this replaces." },
        session: { type: "string", description: "Optional link or name of the session this came from." },
      },
      required: ["kind", "title", "body", "scope"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "add_task",
    title: "Add a task",
    description: "Add a task to Mason's task list.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 200 },
        body: { type: "string", maxLength: 8000 },
        scope: { type: "string", enum: [...SCOPES] },
        company: { type: "string" },
        assigned_to: { type: "string", maxLength: 80, description: "Who is doing it: Josh, Claude, ChatGPT, ..." },
        session: { type: "string" },
      },
      required: ["title", "scope"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "update_task",
    title: "Update a task",
    description: "Change a task's status (open, in_progress, done) or who it's assigned to, with an optional progress note.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        task_status: { type: "string", enum: ["open", "in_progress", "done"] },
        assigned_to: { type: "string", maxLength: 80 },
        note: { type: "string", maxLength: 4000 },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_ai_roster",
    title: "Mason's AI roster",
    description: "The AI tools Mason can use, what each is best at, what it costs, how it's connected, and its track record.",
    inputSchema: {
      type: "object",
      properties: { task_type: { type: "string", enum: TASK_TYPES } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "recommend_ai",
    title: "Which AI for this job?",
    description: "Mason's pick for a task type: proven results first, then what's already connected, then cheapest.",
    inputSchema: {
      type: "object",
      properties: { task_type: { type: "string", enum: TASK_TYPES } },
      required: ["task_type"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "log_ai_job",
    title: "Log how a job went",
    description: "Record how an AI tool did on a job, so Mason's picks improve. Use honest outcomes: great, ok, redo or failed.",
    inputSchema: {
      type: "object",
      properties: {
        ai_name: { type: "string", description: "Exactly as named in the roster." },
        task_type: { type: "string", enum: TASK_TYPES },
        outcome: { type: "string", enum: ["great", "ok", "redo", "failed"] },
        cost_usd: { type: "number", minimum: 0 },
        summary: { type: "string", maxLength: 2000 },
      },
      required: ["ai_name", "task_type", "outcome"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];
const WRITE_TOOLS = new Set(["add_memory", "add_task", "update_task", "log_ai_job"]);

// ---------- helpers ----------
async function resolveCompany(sb: SupabaseClient, ref: string | null) {
  if (!ref) return null;
  const r = ref.toLowerCase().trim();
  const all = await companyNames(sb);
  const exact = all.filter((c: any) => (c.website_slug ?? "").toLowerCase() === r || String(c.name).toLowerCase() === r);
  if (exact.length === 1) return exact[0];
  const loose = all.filter((c: any) => String(c.name).toLowerCase().includes(r) || (c.website_slug ?? "").toLowerCase().includes(r));
  return loose.length === 1 ? loose[0] : null;
}

function fmtEntry(m: any, companies: Map<string, string>): string {
  const where = m.scope === "company" ? `company: ${companies.get(m.company_id) ?? m.company_id}` : m.scope;
  const status = m.kind === "task" ? `task ${m.task_status}${m.assigned_to ? `, ${m.assigned_to}` : ""}` : m.status;
  const body = (m.body ?? "").length > 1200 ? m.body.slice(0, 1200) + "…" : m.body ?? "";
  return `• [${m.kind} | ${where} | ${status}] ${m.title}\n  id ${m.id} · from ${m.source} · ${String(m.created_at).slice(0, 10)}${body ? `\n  ${body.replace(/\n/g, "\n  ")}` : ""}`;
}

async function companyNames(sb: SupabaseClient) {
  const { data } = await sb.from("companies").select("id, name, website_slug").order("name");
  return data ?? [];
}

// ---------- tool handlers ----------
async function callTool(ctx: Ctx, name: string, a: Record<string, unknown>) {
  const { sb } = ctx;
  const comps = await companyNames(sb);
  const cmap = new Map(comps.map((c: any) => [c.id, c.name]));

  switch (name) {
    case "mason_briefing": {
      const [{ data: rules }, { data: tasks }, { count: pending }] = await Promise.all([
        sb.from("mason_memory").select("*").in("scope", ["hurkl_core", "founder"]).eq("status", "active").in("kind", ["rule", "decision"]).order("created_at", { ascending: false }).limit(40),
        sb.from("mason_memory").select("*").eq("kind", "task").eq("status", "active").neq("task_status", "done").order("created_at", { ascending: false }).limit(30),
        sb.from("mason_memory").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
      ]);
      const out = [
        `MASON BRIEFING for ${ctx.connector}`,
        INSTRUCTIONS,
        `\nCOMPANIES (each has its own private file; use read_company_file):\n` + comps.map((c: any) => `• ${c.name} (${c.website_slug ?? "no slug"})`).join("\n"),
        `\nACTIVE HURKL RULES AND DECISIONS (${rules?.length ?? 0}):\n` + ((rules ?? []).map((m) => fmtEntry(m, cmap)).join("\n") || "none yet"),
        `\nOPEN TASKS (${tasks?.length ?? 0}):\n` + ((tasks ?? []).map((m) => fmtEntry(m, cmap)).join("\n") || "none"),
        `\nWAITING FOR THE FOUNDER'S APPROVAL: ${pending ?? 0}`,
      ];
      return text(out.join("\n").slice(0, 60_000));
    }

    case "search_memory": {
      const q = str(a.query, 200);
      if (!q) return text("Give some words to search for.", true);
      const limit = Math.min(Math.max(Number(a.limit) || 10, 1), 20);
      let query = sb.from("mason_memory").select("*").textSearch("search", q, { type: "websearch", config: "english" }).order("created_at", { ascending: false }).limit(limit);
      if (!a.include_history) query = query.in("status", ["active", "pending_approval"]);
      if (a.scope && SCOPES.includes(a.scope as any)) query = query.eq("scope", a.scope as string);
      if (a.kind && KINDS.includes(a.kind as any)) query = query.eq("kind", a.kind as string);
      if (a.company) {
        const c = await resolveCompany(sb, str(a.company, 80));
        if (!c) return text(`No single company matches "${a.company}". Companies: ${comps.map((x: any) => x.name).join(", ")}`, true);
        query = query.eq("company_id", c.id);
      }
      let { data, error } = await query;
      if (error) return text("Search failed. Try simpler words.", true);
      if (!data?.length) {
        // Fallback: simple contains-match on the title for short or unusual words.
        const { data: loose } = await sb.from("mason_memory").select("*").ilike("title", `%${q.replace(/[%_]/g, "").slice(0, 60)}%`).in("status", ["active", "pending_approval"]).limit(limit);
        data = loose ?? [];
      }
      return text(data.length ? data.map((m) => fmtEntry(m, cmap)).join("\n") : `Nothing in Mason's memory matches "${q}".`);
    }

    case "read_company_file": {
      const c = await resolveCompany(sb, str(a.company, 80));
      if (!c) return text(`No single company matches "${a.company}". Companies: ${comps.map((x: any) => x.name).join(", ")}`, true);
      const { data } = await sb.from("mason_memory").select("*").eq("scope", "company").eq("company_id", c.id).in("status", ["active", "pending_approval"]).order("kind").order("created_at", { ascending: false }).limit(80);
      return text(`${c.name} (${c.website_slug ?? ""}) — company file\n` + ((data ?? []).map((m) => fmtEntry(m, cmap)).join("\n") || "Nothing recorded yet."));
    }

    case "add_memory":
    case "add_task": {
      const isTask = name === "add_task";
      const kind = isTask ? "task" : String(a.kind ?? "");
      if (!isTask && !["decision", "rule", "lesson", "fact", "note"].includes(kind)) return text("kind must be decision, rule, lesson, fact or note.", true);
      const scope = String(a.scope ?? "");
      if (!SCOPES.includes(scope as any)) return text("scope must be hurkl_core, company or founder.", true);
      const title = str(a.title, 200);
      if (!title) return text("A title is required.", true);
      let company_id: string | null = null;
      if (scope === "company") {
        const c = await resolveCompany(sb, str(a.company, 80));
        if (!c) return text(`Name the company. Companies: ${comps.map((x: any) => x.name).join(", ")}`, true);
        company_id = c.id;
      }
      let replaces_id: string | null = null;
      if (!isTask && a.replaces_id) {
        const { data: old } = await sb.from("mason_memory").select("id, status").eq("id", String(a.replaces_id)).maybeSingle();
        if (!old || old.status !== "active") return text("replaces_id must be an active entry's id.", true);
        replaces_id = old.id;
      }
      const pending = !isTask && (NEEDS_APPROVAL.has(kind) || replaces_id !== null);
      const tags = Array.isArray(a.tags) ? (a.tags as unknown[]).slice(0, 10).map((t) => String(t).slice(0, 40)) : [];
      const row = {
        scope, company_id, kind, title, body: str(a.body, 8000) ?? "", tags, replaces_id,
        status: pending ? "pending_approval" : "active",
        task_status: isTask ? "open" : null,
        assigned_to: isTask ? str(a.assigned_to, 80) : null,
        source: ctx.connector, source_ref: str(a.session, 300),
      };
      const { data, error } = await sb.from("mason_memory").insert(row).select("id").single();
      if (error) {
        if (String(error.message).includes("refused_secret")) return text("Refused: that looks like a password, key or card number. Those never go in Mason's memory.", true);
        console.error(JSON.stringify({ msg: "mason_mcp_insert_failed", connector: ctx.connector, error: error.message }));
        return text("Couldn't save that. Check the fields and try again.", true);
      }
      if (!pending && replaces_id) await sb.from("mason_memory").update({ status: "replaced" }).eq("id", replaces_id);
      return text(pending
        ? `Saved (id ${data.id}). It's waiting for the founder's approval before Mason treats it as final.`
        : `Saved (id ${data.id}).`);
    }

    case "update_task": {
      const id = str(a.id, 60);
      const { data: t } = await sb.from("mason_memory").select("*").eq("id", id ?? "").eq("kind", "task").maybeSingle();
      if (!t) return text("No task with that id.", true);
      const patch: Record<string, unknown> = {};
      if (a.task_status && ["open", "in_progress", "done"].includes(String(a.task_status))) patch.task_status = a.task_status;
      if (a.assigned_to !== undefined) patch.assigned_to = str(a.assigned_to, 80);
      if (Object.keys(patch).length) {
        const { error } = await sb.from("mason_memory").update(patch).eq("id", t.id);
        if (error) return text("Couldn't update the task.", true);
      }
      const note = str(a.note, 4000);
      if (note) {
        const { error } = await sb.from("mason_memory").insert({
          scope: t.scope, company_id: t.company_id, kind: "note", title: `Update on task: ${t.title}`.slice(0, 200),
          body: note, tags: [`task:${t.id}`], source: ctx.connector, status: "active",
        });
        if (error && String(error.message).includes("refused_secret")) return text("Task updated, but the note was refused: it looks like a password, key or card number.", true);
      }
      return text(`Task updated${patch.task_status ? ` (now ${patch.task_status})` : ""}.`);
    }

    case "get_ai_roster": {
      let q = sb.from("mason_ai_roster").select("*").eq("active", true).order("name");
      if (a.task_type) q = q.contains("best_for", [String(a.task_type)]);
      const [{ data: roster }, { data: picks }] = await Promise.all([q, sb.from("mason_ai_picks").select("*")]);
      const lines = (roster ?? []).map((r: any) => {
        const rec = (picks ?? []).filter((p: any) => p.id === r.id && p.jobs_done > 0).map((p: any) => `${p.task_type}: ${p.jobs_done} jobs, score ${p.success_score}`).join("; ");
        return `• ${r.name}${r.maker ? ` (${r.maker})` : ""} — ${r.connection}\n  best for: ${(r.best_for ?? []).join(", ") || "not set"}\n  cost: ${r.monthly_cost_usd != null ? `$${r.monthly_cost_usd}/mo` : "unknown"}${r.cost_notes ? ` · ${r.cost_notes}` : ""}\n  ${r.notes ?? ""}${rec ? `\n  track record: ${rec}` : ""}\n  facts last checked: ${r.last_verified_on ?? "not yet verified"}`;
      });
      return text(lines.join("\n") || "The roster is empty.");
    }

    case "recommend_ai": {
      const tt = String(a.task_type ?? "");
      const { data } = await sb.from("mason_ai_picks").select("*").eq("task_type", tt);
      if (!data?.length) return text(`No AI on the roster is marked for ${tt} yet.`);
      const rank: Record<string, number> = { plugged_in: 0, api_ready: 1, opened_by_josh: 2, not_set_up: 3 };
      const sorted = [...data].sort((x: any, y: any) => {
        const sx = x.jobs_done ? Number(x.success_score) : 0.5, sy = y.jobs_done ? Number(y.success_score) : 0.5;
        if (Math.abs(sx - sy) > 0.15) return sy - sx;
        if (rank[x.connection] !== rank[y.connection]) return rank[x.connection] - rank[y.connection];
        return (Number(x.monthly_cost_usd ?? 9999) - Number(y.monthly_cost_usd ?? 9999));
      });
      const top = sorted[0] as any;
      return text(`For ${tt}, Mason picks: ${top.name} (${top.connection}${top.jobs_done ? `, ${top.jobs_done} jobs, score ${top.success_score}` : ", no track record yet"}).\n` +
        `Others, in order: ${sorted.slice(1).map((p: any) => p.name).join(", ") || "none"}.\n` +
        `Picks favor proven results, then what's connected, then the cheapest. Check costs before spending money.`);
    }

    case "log_ai_job": {
      const { data: r } = await sb.from("mason_ai_roster").select("id").ilike("name", String(a.ai_name ?? "").slice(0, 80)).maybeSingle();
      if (!r) return text("That AI isn't on the roster. Use the exact roster name (see get_ai_roster).", true);
      const { error } = await sb.from("mason_ai_jobs").insert({
        roster_id: r.id, task_type: String(a.task_type), outcome: String(a.outcome),
        cost_usd: typeof a.cost_usd === "number" ? a.cost_usd : null, summary: str(a.summary, 2000) ?? "", source: ctx.connector,
      });
      return error ? text("Couldn't log that job.", true) : text("Logged. Mason's picks will use it.");
    }
  }
  return null;
}

// ---------- HTTP / JSON-RPC ----------
Deno.serve(async (req: Request) => {
  if (req.method === "GET" || req.method === "DELETE") return json(405, { error: "method_not_allowed" }, { Allow: "POST" });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!/^mason_[a-f0-9]{48}$/.test(token)) {
    return json(401, { error: "unauthorized" }, { "WWW-Authenticate": 'Bearer realm="hurkl-mason"' });
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json(413, { error: "too_large" });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: "too_large" });

  let msg: any;
  try { msg = JSON.parse(raw); } catch { return json(400, rpcError(null, -32700, "Parse error")); }
  if (Array.isArray(msg)) return json(400, rpcError(null, -32600, "Batches are not supported"));
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return json(400, rpcError(msg?.id ?? null, -32600, "Invalid request"));

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const isWrite = msg.method === "tools/call" && WRITE_TOOLS.has(String(msg.params?.name));
  const { data: check, error: checkErr } = await sb.rpc("mason_connector_check", { p_token: token, p_is_write: isWrite });
  if (checkErr) {
    console.error(JSON.stringify({ msg: "mason_mcp_check_failed", error: checkErr.message }));
    return json(500, rpcError(msg.id ?? null, -32603, "Temporary error"));
  }
  const conn = Array.isArray(check) ? check[0] : null;
  if (!conn) return json(401, { error: "unauthorized" }, { "WWW-Authenticate": 'Bearer realm="hurkl-mason"' });

  // Notifications (no id) get an empty 202.
  if (msg.id === undefined || msg.id === null) return new Response(null, { status: 202 });

  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return json(200, rpcResult(msg.id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      }));
    }
    case "ping":
      return json(200, rpcResult(msg.id, {}));
    case "tools/list":
      return json(200, rpcResult(msg.id, { tools: TOOLS }));
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments && typeof msg.params.arguments === "object") ? msg.params.arguments : {};
      if (!TOOLS.some((t) => t.name === name)) return json(200, rpcError(msg.id, -32602, `Unknown tool: ${name}`));
      if (isWrite && !conn.allowed) return json(200, rpcResult(msg.id, text("Today's write limit for this AI is used up. Mason's memory is still readable; writing resumes tomorrow.", true)));
      try {
        const result = await callTool({ sb, token, connector: conn.connector_name }, name, args);
        console.log(JSON.stringify({ msg: "mason_mcp_tool", connector: conn.connector_name, tool: name }));
        return json(200, rpcResult(msg.id, result ?? text("Unknown tool.", true)));
      } catch (e) {
        console.error(JSON.stringify({ msg: "mason_mcp_tool_failed", connector: conn.connector_name, tool: name, error: String(e).slice(0, 200) }));
        return json(200, rpcResult(msg.id, text("Something went wrong on Mason's side. Try again in a moment.", true)));
      }
    }
    default:
      return json(200, rpcError(msg.id, -32601, `Method not found: ${msg.method}`));
  }
});

// HURKL — Mason's toolbox: the one shared set of memory and AI-roster tools.
//
// Used by the HURKL plug (mason-mcp, for outside AI tools) and by mason-talk (the founder
// talking to Mason in the Mason app). One copy, so both always behave the same.
// Safety lives here and in the database: secrets are refused by the database; rules and
// decisions (and any replacement of an existing entry) wait for the founder's approval;
// nothing is ever deleted. Makes no AI-model calls.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const KINDS = ["decision", "rule", "lesson", "fact", "task", "note"] as const;
export const SCOPES = ["hurkl_core", "company", "founder"] as const;
export const TASK_TYPES = [
  "planning",
  "writing",
  "coding",
  "testing",
  "design",
  "animation",
  "video",
  "voice",
  "research",
  "data",
  "marketing",
];
export const NEEDS_APPROVAL = new Set(["decision", "rule"]);

export const INSTRUCTIONS =
  "You work for HURKL under Mason. Mason's memory is the source of truth. Start every session with mason_briefing. " +
  "Read task conversations with read_task_thread and reply using update_task(note). Use read_memory for full entries. " +
  "These tools store shared messages; they do not start another AI session. Only claim receipt after an acknowledgment. " +
  "At the START of every session call mason_briefing. Before answering questions about HURKL, its companies, rules or past " +
  "decisions, call search_memory. At the END of meaningful work, record what you did (add_memory kind 'note' or 'lesson'), " +
  "update tasks, and log_ai_job for the AI roster. Rules and decisions you write wait for the founder's approval. " +
  "Never send passwords, keys or card numbers. Keep each company's private details in its own company file (scope 'company').";

/** Who is using the toolbox: the plug passes the AI tool's key name, mason-talk passes "Mason (talk)". */
export type Ctx = { sb: SupabaseClient; connector: string };

export const text = (t: string, isError = false) => ({
  content: [{ type: "text", text: t }],
  isError,
});

export function str(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

// ---------- tool definitions ----------
export const TOOLS = [
  {
    name: "mason_briefing",
    title: "Mason briefing (start here)",
    description:
      "Start-of-session briefing from Mason: active HURKL rules and decisions, open tasks, items waiting for the founder's approval, and the list of companies. Call this first in every session.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "search_memory",
    title: "Search Mason's memory",
    description:
      "Search Mason's memory (decisions, rules, lessons, facts, tasks, notes). Use before answering anything about HURKL, its companies, past decisions or how things work.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to search for." },
        scope: {
          type: "string",
          enum: [...SCOPES],
          description: "Optional: hurkl_core, company or founder.",
        },
        company: {
          type: "string",
          description: "Optional company slug or name, e.g. a1-best-moving or Executive Drains.",
        },
        kind: { type: "string", enum: [...KINDS] },
        include_history: {
          type: "boolean",
          description: "Also return replaced/declined entries. Default false.",
        },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "read_memory",
    title: "Read a complete memory entry",
    description:
      "Read an entry's full body by its id. Search and briefing results are previews, not the complete blueprint or message. Pending rules remain proposals. Optional scope/company constraints are enforced.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Entry id returned by search_memory or mason_briefing.",
        },
        scope: { type: "string", enum: [...SCOPES] },
        company: { type: "string" },
        include_history: {
          type: "boolean",
          description: "Explicitly include replaced/declined entries. Default false.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "read_task_thread",
    title: "Read a task's conversation",
    description:
      "Read a task and its full replies, oldest first, with author and time. Reply with update_task(note). Follow next_offset to read more. Reading a thread does not wake or notify another AI.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task id." },
        offset: { type: "integer", minimum: 0, maximum: 10000 },
        limit: { type: "integer", minimum: 1, maximum: 6 },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "read_company_file",
    title: "Read a company's file",
    description:
      "Everything Mason knows about one company (its private file): active rules, decisions, facts and open tasks. Never use one company's details for another company.",
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
    description:
      "Record something in Mason's memory. kind 'rule' or 'decision', or anything that replaces an existing entry, waits for the founder's approval. Use scope 'company' (with company) for anything specific to one company, 'hurkl_core' for Mason's general skills and lessons, 'founder' for the founder's own notes.",
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
        session: {
          type: "string",
          description: "Optional link or name of the session this came from.",
        },
      },
      required: ["kind", "title", "body", "scope"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
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
        assigned_to: {
          type: "string",
          maxLength: 80,
          description: "Who is doing it: Josh, Claude, ChatGPT, ...",
        },
        session: { type: "string" },
      },
      required: ["title", "scope"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "update_task",
    title: "Update a task",
    description:
      "Change a task's status/assignment, or append a reply with note. Replies retain the actual connector author and can be read with read_task_thread. This stores a message; it does not start the recipient's session.",
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "get_ai_roster",
    title: "Mason's AI roster",
    description:
      "The AI tools Mason can use, what each is best at, what it costs, how it's connected, and its track record.",
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
    description:
      "Mason's pick for a task type: proven results first, then what's already connected, then cheapest.",
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
    description:
      "Record how an AI tool did on a job, so Mason's picks improve. Use honest outcomes: great, ok, redo or failed.",
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
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
];
export const WRITE_TOOLS = new Set(["add_memory", "add_task", "update_task", "log_ai_job"]);

// ---------- helpers ----------
async function resolveCompany(sb: SupabaseClient, ref: string | null) {
  if (!ref) return null;
  const r = ref.toLowerCase().trim();
  const all = await companyNames(sb);
  const exact = all.filter(
    (c: any) => (c.website_slug ?? "").toLowerCase() === r || String(c.name).toLowerCase() === r,
  );
  if (exact.length === 1) return exact[0];
  const loose = all.filter(
    (c: any) =>
      String(c.name).toLowerCase().includes(r) || (c.website_slug ?? "").toLowerCase().includes(r),
  );
  return loose.length === 1 ? loose[0] : null;
}

function fmtEntry(m: any, companies: Map<string, string>): string {
  const where =
    m.scope === "company" ? `company: ${companies.get(m.company_id) ?? m.company_id}` : m.scope;
  const status =
    m.kind === "task"
      ? `task ${m.task_status}${m.assigned_to ? `, ${m.assigned_to}` : ""}`
      : m.status;
  const body =
    (m.body ?? "").length > 1200
      ? m.body.slice(0, 1200) + `… [preview; read_memory id ${m.id} for full text]`
      : (m.body ?? "");
  return `• [${m.kind} | ${where} | ${status}] ${m.title}\n  id ${m.id} · from ${m.source} · ${String(m.created_at).slice(0, 10)}${body ? `\n  ${body.replace(/\n/g, "\n  ")}` : ""}`;
}

async function companyNames(sb: SupabaseClient) {
  const { data } = await sb.from("companies").select("id, name, website_slug").order("name");
  return data ?? [];
}

/** Avoid duplicating generated search vectors or other internal columns in full reads. */
function fullEntry(m: any) {
  const {
    id,
    scope,
    company_id,
    kind,
    title,
    body,
    status,
    task_status,
    assigned_to,
    tags,
    source,
    source_ref,
    created_at,
    replaces_id,
  } = m;
  return {
    id,
    scope,
    company_id,
    kind,
    title,
    body,
    status,
    task_status,
    assigned_to,
    tags,
    source,
    source_ref,
    created_at,
    replaces_id,
  };
}

// ---------- tool handlers ----------
export async function callTool(ctx: Ctx, name: string, a: Record<string, unknown>) {
  const { sb } = ctx;
  const comps = await companyNames(sb);
  const cmap = new Map<string, string>(comps.map((c: any) => [c.id, c.name] as [string, string]));

  switch (name) {
    case "mason_briefing": {
      const [{ data: rules }, { data: tasks }, { count: pending }] = await Promise.all([
        sb
          .from("mason_memory")
          .select("*")
          .in("scope", ["hurkl_core", "founder"])
          .eq("status", "active")
          .in("kind", ["rule", "decision"])
          .order("created_at", { ascending: false })
          .limit(40),
        sb
          .from("mason_memory")
          .select("*")
          .eq("kind", "task")
          .eq("status", "active")
          .neq("task_status", "done")
          .order("created_at", { ascending: false })
          .limit(30),
        sb
          .from("mason_memory")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_approval"),
      ]);
      // Updates are separate append-only notes. Include them before older task/rule text so
      // Mason sees actual replies rather than only the original, potentially stale request.
      const updates = tasks?.length
        ? await sb
            .from("mason_memory")
            .select("*")
            .eq("kind", "note")
            .eq("status", "active")
            .overlaps(
              "tags",
              tasks.map((t: any) => `task:${t.id}`),
            )
            .order("created_at", { ascending: false })
            .limit(6)
        : { data: [], error: null };
      const out = [
        `MASON BRIEFING for ${ctx.connector}`,
        INSTRUCTIONS,
        `\nRECENT TASK REPLIES (use read_task_thread for full conversations):\n` +
          (updates.error
            ? "Replies could not be loaded; do not assume there are none."
            : (updates.data ?? []).map((m: any) => fmtEntry(m, cmap)).join("\n") || "none"),
        `\nCOMPANIES (each has its own private file; use read_company_file):\n` +
          comps.map((c: any) => `• ${c.name} (${c.website_slug ?? "no slug"})`).join("\n"),
        `\nACTIVE HURKL RULES AND DECISIONS (${rules?.length ?? 0}):\n` +
          ((rules ?? []).map((m: any) => fmtEntry(m, cmap)).join("\n") || "none yet"),
        `\nOPEN TASKS (${tasks?.length ?? 0}):\n` +
          ((tasks ?? []).map((m: any) => fmtEntry(m, cmap)).join("\n") || "none"),
        `\nWAITING FOR THE FOUNDER'S APPROVAL: ${pending ?? 0}`,
      ];
      return text(out.join("\n").slice(0, 60_000));
    }

    case "search_memory": {
      const q = str(a.query, 200);
      if (!q) return text("Give some words to search for.", true);
      const limit = Math.min(Math.max(Number(a.limit) || 10, 1), 20);
      let companyId: string | null = null;
      if (a.company) {
        const c = await resolveCompany(sb, str(a.company, 80));
        if (!c)
          return text(
            `No single company matches "${a.company}". Companies: ${comps.map((x: any) => x.name).join(", ")}`,
            true,
          );
        companyId = c.id;
      }
      const constrain = (query: any) => {
        if (!a.include_history) query = query.in("status", ["active", "pending_approval"]);
        if (a.scope && SCOPES.includes(a.scope as any))
          query = query.eq("scope", a.scope as string);
        if (a.kind && KINDS.includes(a.kind as any)) query = query.eq("kind", a.kind as string);
        if (companyId) query = query.eq("company_id", companyId);
        return query;
      };
      const query = constrain(
        sb
          .from("mason_memory")
          .select("*")
          .textSearch("search", q, { type: "websearch", config: "english" }),
      )
        .order("created_at", { ascending: false })
        .limit(limit);
      let { data, error } = await query;
      if (error) return text("Search failed. Try simpler words.", true);
      if (!data?.length) {
        // Fallback: simple contains-match on the title for short or unusual words.
        const { data: loose, error: fallbackError } = await constrain(
          sb
            .from("mason_memory")
            .select("*")
            .ilike("title", `%${q.replace(/[%_]/g, "").slice(0, 60)}%`),
        )
          .order("created_at", { ascending: false })
          .limit(limit);
        if (fallbackError) return text("Search failed. Try again later.", true);
        data = loose ?? [];
      }
      return text(
        data.length
          ? data.map((m: any) => fmtEntry(m, cmap)).join("\n")
          : `Nothing in Mason's memory matches "${q}".`,
      );
    }

    case "read_memory": {
      const id = str(a.id, 60);
      if (!id) return text("An entry id is required.", true);
      let query = sb.from("mason_memory").select("*").eq("id", id);
      if (!a.include_history) query = query.in("status", ["active", "pending_approval"]);
      if (a.scope && SCOPES.includes(a.scope as any)) query = query.eq("scope", a.scope as string);
      if (a.company) {
        const c = await resolveCompany(sb, str(a.company, 80));
        if (!c) return text("Name one matching company.", true);
        query = query.eq("scope", "company").eq("company_id", c.id);
      }
      const { data, error } = await query.maybeSingle();
      if (error) return text("The entry could not be read. Try again later.", true);
      if (!data) return text("No entry matches that id and scope.", true);
      return text(
        JSON.stringify({
          ...fullEntry(data),
          preview: false,
          authority:
            data.status === "pending_approval"
              ? "Proposal awaiting approval; not an active rule."
              : "Recorded entry; preserve its kind, source and evidence status.",
        }),
      );
    }

    case "read_task_thread": {
      const id = str(a.id, 60);
      const offset = a.offset === undefined ? 0 : Number(a.offset);
      const limit = a.limit === undefined ? 5 : Number(a.limit);
      if (
        !id ||
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset > 10000 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 6
      ) {
        return text("Give a task id, offset 0–10000 and limit 1–6.", true);
      }
      const { data: task, error: taskError } = await sb
        .from("mason_memory")
        .select("*")
        .eq("id", id)
        .eq("kind", "task")
        .eq("status", "active")
        .maybeSingle();
      if (taskError) return text("The task could not be read. Try again later.", true);
      if (!task) return text("No active task with that id.", true);
      let query = sb
        .from("mason_memory")
        .select("*")
        .eq("kind", "note")
        .eq("status", "active")
        .eq("scope", task.scope)
        .contains("tags", [`task:${task.id}`]);
      query = task.company_id
        ? query.eq("company_id", task.company_id)
        : query.is("company_id", null);
      const { data: notes, error } = await query
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + limit);
      if (error) return text("Task replies could not be read. Do not assume there are none.", true);
      return text(
        JSON.stringify({
          task: fullEntry(task),
          messages: (notes ?? []).slice(0, limit).map(fullEntry),
          next_offset: (notes?.length ?? 0) > limit ? offset + limit : null,
          delivery: "stored; each recipient reads and replies in an active session",
          preview: false,
        }),
      );
    }

    case "read_company_file": {
      const c = await resolveCompany(sb, str(a.company, 80));
      if (!c)
        return text(
          `No single company matches "${a.company}". Companies: ${comps.map((x: any) => x.name).join(", ")}`,
          true,
        );
      const { data } = await sb
        .from("mason_memory")
        .select("*")
        .eq("scope", "company")
        .eq("company_id", c.id)
        .in("status", ["active", "pending_approval"])
        .order("kind")
        .order("created_at", { ascending: false })
        .limit(80);
      return text(
        `${c.name} (${c.website_slug ?? ""}) — company file\n` +
          ((data ?? []).map((m: any) => fmtEntry(m, cmap)).join("\n") || "Nothing recorded yet."),
      );
    }

    case "add_memory":
    case "add_task": {
      const isTask = name === "add_task";
      const kind = isTask ? "task" : String(a.kind ?? "");
      if (!isTask && !["decision", "rule", "lesson", "fact", "note"].includes(kind))
        return text("kind must be decision, rule, lesson, fact or note.", true);
      const scope = String(a.scope ?? "");
      if (!SCOPES.includes(scope as any))
        return text("scope must be hurkl_core, company or founder.", true);
      const title = str(a.title, 200);
      if (!title) return text("A title is required.", true);
      let company_id: string | null = null;
      if (scope === "company") {
        const c = await resolveCompany(sb, str(a.company, 80));
        if (!c)
          return text(
            `Name the company. Companies: ${comps.map((x: any) => x.name).join(", ")}`,
            true,
          );
        company_id = c.id;
      }
      let replaces_id: string | null = null;
      if (!isTask && a.replaces_id) {
        const { data: old } = await sb
          .from("mason_memory")
          .select("id, status")
          .eq("id", String(a.replaces_id))
          .maybeSingle();
        if (!old || old.status !== "active")
          return text("replaces_id must be an active entry's id.", true);
        replaces_id = old.id;
      }
      const pending = !isTask && (NEEDS_APPROVAL.has(kind) || replaces_id !== null);
      const tags = Array.isArray(a.tags)
        ? (a.tags as unknown[]).slice(0, 10).map((t) => String(t).slice(0, 40))
        : [];
      const row = {
        scope,
        company_id,
        kind,
        title,
        body: str(a.body, 8000) ?? "",
        tags,
        replaces_id,
        status: pending ? "pending_approval" : "active",
        task_status: isTask ? "open" : null,
        assigned_to: isTask ? str(a.assigned_to, 80) : null,
        source: ctx.connector,
        source_ref: str(a.session, 300),
      };
      const { data, error } = await sb.from("mason_memory").insert(row).select("id").single();
      if (error) {
        if (String(error.message).includes("refused_secret"))
          return text(
            "Refused: that looks like a password, key or card number. Those never go in Mason's memory.",
            true,
          );
        console.error(
          JSON.stringify({
            msg: "mason_mcp_insert_failed",
            connector: ctx.connector,
            error: error.message,
          }),
        );
        return text("Couldn't save that. Check the fields and try again.", true);
      }
      if (!pending && replaces_id)
        await sb.from("mason_memory").update({ status: "replaced" }).eq("id", replaces_id);
      return text(
        pending
          ? `Saved (id ${data.id}). It's waiting for the founder's approval before Mason treats it as final.`
          : `Saved (id ${data.id}).`,
      );
    }

    case "update_task": {
      const id = str(a.id, 60);
      const { data: t } = await sb
        .from("mason_memory")
        .select("*")
        .eq("id", id ?? "")
        .eq("kind", "task")
        .maybeSingle();
      if (!t) return text("No task with that id.", true);
      const patch: Record<string, unknown> = {};
      if (a.task_status && ["open", "in_progress", "done"].includes(String(a.task_status)))
        patch.task_status = a.task_status;
      if (a.assigned_to !== undefined) patch.assigned_to = str(a.assigned_to, 80);
      if (Object.keys(patch).length) {
        const { error } = await sb.from("mason_memory").update(patch).eq("id", t.id);
        if (error) return text("Couldn't update the task.", true);
      }
      const note = str(a.note, 4000);
      if (note) {
        const { error } = await sb.from("mason_memory").insert({
          scope: t.scope,
          company_id: t.company_id,
          kind: "note",
          title: `Update on task: ${t.title}`.slice(0, 200),
          body: note,
          tags: [`task:${t.id}`],
          source: ctx.connector,
          status: "active",
        });
        if (error && String(error.message).includes("refused_secret"))
          return text(
            "Task updated, but the note was refused: it looks like a password, key or card number.",
            true,
          );
        if (error)
          return text(
            "Task fields updated, but the reply could not be saved. Check the thread before retrying.",
            true,
          );
      }
      return text(`Task updated${patch.task_status ? ` (now ${patch.task_status})` : ""}.`);
    }

    case "get_ai_roster": {
      let q = sb.from("mason_ai_roster").select("*").eq("active", true).order("name");
      if (a.task_type) q = q.contains("best_for", [String(a.task_type)]);
      const [{ data: roster }, { data: picks }] = await Promise.all([
        q,
        sb.from("mason_ai_picks").select("*"),
      ]);
      const lines = (roster ?? []).map((r: any) => {
        const rec = (picks ?? [])
          .filter((p: any) => p.id === r.id && p.jobs_done > 0)
          .map((p: any) => `${p.task_type}: ${p.jobs_done} jobs, score ${p.success_score}`)
          .join("; ");
        return `• ${r.name}${r.maker ? ` (${r.maker})` : ""} — ${r.connection}\n  best for: ${(r.best_for ?? []).join(", ") || "not set"}\n  cost: ${r.monthly_cost_usd != null ? `$${r.monthly_cost_usd}/mo` : "unknown"}${r.cost_notes ? ` · ${r.cost_notes}` : ""}\n  ${r.notes ?? ""}${rec ? `\n  track record: ${rec}` : ""}\n  facts last checked: ${r.last_verified_on ?? "not yet verified"}`;
      });
      return text(lines.join("\n") || "The roster is empty.");
    }

    case "recommend_ai": {
      // One copy of the pick logic: public.mason_recommend_ai (database).
      const tt = String(a.task_type ?? "");
      const { data, error } = await sb.rpc("mason_recommend_ai", { p_task_type: tt });
      if (error) return text("Couldn't get Mason's pick right now.", true);
      if (!data?.length) return text(`No AI on the roster is marked for ${tt} yet.`);
      const top = data[0] as any;
      return text(
        `For ${tt}, Mason picks: ${top.name} (${top.connection}${top.jobs_done ? `, ${top.jobs_done} jobs, score ${top.success_score}` : ", no track record yet"}).\n` +
          `Others, in order: ${
            data
              .slice(1)
              .map((p: any) => p.name)
              .join(", ") || "none"
          }.\n` +
          `Picks favor proven results, then what's connected, then the cheapest. Check costs before spending money.`,
      );
    }

    case "log_ai_job": {
      const { data: r } = await sb
        .from("mason_ai_roster")
        .select("id")
        .ilike("name", String(a.ai_name ?? "").slice(0, 80))
        .maybeSingle();
      if (!r)
        return text(
          "That AI isn't on the roster. Use the exact roster name (see get_ai_roster).",
          true,
        );
      const { error } = await sb.from("mason_ai_jobs").insert({
        roster_id: r.id,
        task_type: String(a.task_type),
        outcome: String(a.outcome),
        cost_usd: typeof a.cost_usd === "number" ? a.cost_usd : null,
        summary: str(a.summary, 2000) ?? "",
        source: ctx.connector,
      });
      return error
        ? text("Couldn't log that job.", true)
        : text("Logged. Mason's picks will use it.");
    }
  }
  return null;
}

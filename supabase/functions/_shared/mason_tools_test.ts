import { deepStrictEqual as assertEquals, ok } from "node:assert";
import { callTool, NEEDS_APPROVAL, TOOLS, WRITE_TOOLS, type Ctx } from "./mason_tools.ts";

Deno.test("toolbox preserves existing tools and adds full-entry/thread reads", () => {
  assertEquals(TOOLS.map((t) => t.name).sort(), [
    "add_memory",
    "add_task",
    "get_ai_roster",
    "log_ai_job",
    "mason_briefing",
    "read_company_file",
    "read_memory",
    "read_task_thread",
    "recommend_ai",
    "search_memory",
    "update_task",
  ]);
});

type Row = Record<string, any>;

// In-memory query adapter: exercise real filtering/ordering and injected DB failures,
// including records from a different company that must never enter a task thread.
function database(
  rows: Row[],
  options: { noFullText?: boolean; noteInsertError?: string; noteReadError?: boolean } = {},
) {
  class Query {
    filters: ((r: Row) => boolean)[] = [];
    orders: [string, boolean][] = [];
    first = 0;
    last = Infinity;
    single = false;
    countOnly = false;
    operation = "select";
    values: Row = {};
    noteQuery = false;
    select(_columns?: string, opt?: any) {
      this.countOnly = !!opt?.head;
      return this;
    }
    eq(k: string, v: unknown) {
      if (k === "kind" && v === "note") this.noteQuery = true;
      this.filters.push((r) => r[k] === v);
      return this;
    }
    neq(k: string, v: unknown) {
      this.filters.push((r) => r[k] !== v);
      return this;
    }
    in(k: string, v: unknown[]) {
      this.filters.push((r) => v.includes(r[k]));
      return this;
    }
    is(k: string, v: unknown) {
      return this.eq(k, v);
    }
    contains(k: string, v: string[]) {
      this.filters.push((r) => v.every((x) => r[k]?.includes(x)));
      return this;
    }
    overlaps(k: string, v: string[]) {
      this.filters.push((r) => v.some((x) => r[k]?.includes(x)));
      return this;
    }
    textSearch(_k: string, v: string) {
      this.filters.push(
        (r) =>
          !options.noFullText && `${r.title} ${r.body}`.toLowerCase().includes(v.toLowerCase()),
      );
      return this;
    }
    ilike(k: string, v: string) {
      this.filters.push((r) =>
        String(r[k] ?? "")
          .toLowerCase()
          .includes(v.replaceAll("%", "").toLowerCase()),
      );
      return this;
    }
    order(k: string, v?: any) {
      this.orders.push([k, v?.ascending !== false]);
      return this;
    }
    limit(n: number) {
      this.last = n - 1;
      return this;
    }
    range(a: number, b: number) {
      this.first = a;
      this.last = b;
      return this;
    }
    maybeSingle() {
      this.single = true;
      return this;
    }
    update(v: Row) {
      this.operation = "update";
      this.values = v;
      return this;
    }
    insert(v: Row) {
      this.operation = "insert";
      this.values = v;
      return this;
    }
    then(resolve: (v: any) => any, reject?: (e: unknown) => any) {
      try {
        if (this.operation === "insert") {
          if (options.noteInsertError)
            return Promise.resolve(
              resolve({ data: null, error: { message: options.noteInsertError } }),
            );
          rows.push({ id: "new-note", created_at: "2026-11-27T22:00:00Z", ...this.values });
          return Promise.resolve(resolve({ data: null, error: null }));
        }
        let found = rows.filter((r) => this.filters.every((f) => f(r)));
        if (this.operation === "update") found.forEach((r) => Object.assign(r, this.values));
        if (options.noteReadError && this.noteQuery) {
          return Promise.resolve(resolve({ data: null, error: { message: "unavailable" } }));
        }
        found.sort((a, b) => {
          for (const [k, asc] of this.orders) {
            const n = String(a[k] ?? "").localeCompare(String(b[k] ?? ""));
            if (n) return asc ? n : -n;
          }
          return 0;
        });
        const count = found.length;
        found = found.slice(this.first, this.last + 1);
        return Promise.resolve(
          resolve({
            data: this.countOnly ? null : this.single ? (found[0] ?? null) : found,
            error: null,
            count,
          }),
        );
      } catch (e) {
        if (reject) return Promise.resolve(reject(e));
        return Promise.reject(e);
      }
    }
  }
  return {
    from(table: string) {
      return table === "companies"
        ? {
            select: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    { id: "company-a", name: "Example A", website_slug: "example-a" },
                    { id: "company-b", name: "Example B", website_slug: "example-b" },
                  ],
                }),
            }),
          }
        : new Query();
    },
  } as unknown as Ctx["sb"];
}

const entry = (override: Row = {}): Row => ({
  id: "entry",
  scope: "hurkl_core",
  company_id: null,
  kind: "note",
  title: "Blueprint",
  body: "Recorded",
  status: "active",
  source: "Claude",
  created_at: "2026-11-27T21:00:00Z",
  tags: [],
  ...override,
});
const run = (rows: Row[], name: string, args: Row, options = {}) =>
  callTool({ sb: database(rows, options), connector: "ChatGPT (sign-in)" }, name, args);
const body = (r: any) => r.content[0].text;

Deno.test("full memory read preserves the entire blueprint and proposal status", async () => {
  const blueprint = "start " + "x".repeat(3500) + " final requirement";
  const r = await run(
    [entry({ body: blueprint, status: "pending_approval", search: "private generated index" })],
    "read_memory",
    { id: "entry" },
  );
  const data = JSON.parse(body(r));
  assertEquals(data.body, blueprint);
  assertEquals(data.preview, false);
  ok(data.authority.includes("awaiting approval"));
  ok(!("search" in data));
});

Deno.test("full memory reads enforce requested company and hide history by default", async () => {
  const rows = [entry({ scope: "company", company_id: "company-b" })];
  ok((await run(rows, "read_memory", { id: "entry", company: "example-a" }))?.isError);
  ok((await run([entry({ status: "replaced" })], "read_memory", { id: "entry" }))?.isError);
  ok(
    !(
      await run([entry({ status: "replaced" })], "read_memory", {
        id: "entry",
        include_history: true,
      })
    )?.isError,
  );
});

Deno.test(
  "task threads retain full attributed replies, paginate, and exclude other scopes/companies",
  async () => {
    const task = entry({
      id: "task-1",
      kind: "task",
      scope: "company",
      company_id: "company-a",
      body: "Approved scope",
      task_status: "in_progress",
    });
    const rows = [
      task,
      ...[1, 2, 3].map((n) =>
        entry({
          id: `reply-${n}`,
          source: n === 2 ? "Claude" : "ChatGPT",
          scope: "company",
          company_id: "company-a",
          tags: ["task:task-1"],
          body: `${n}:` + "x".repeat(2000),
          created_at: `2026-11-27T21:0${n}:00Z`,
        }),
      ),
      entry({
        id: "wrong-company",
        scope: "company",
        company_id: "company-b",
        tags: ["task:task-1"],
      }),
      entry({
        id: "wrong-scope",
        scope: "founder",
        company_id: "company-a",
        tags: ["task:task-1"],
      }),
    ];
    const first = JSON.parse(body(await run(rows, "read_task_thread", { id: "task-1", limit: 2 })));
    assertEquals(
      first.messages.map((m: Row) => m.id),
      ["reply-1", "reply-2"],
    );
    assertEquals(first.messages[1].source, "Claude");
    ok(first.messages[0].body.length > 1200);
    assertEquals(first.next_offset, 2);
    const second = JSON.parse(
      body(
        await run(rows, "read_task_thread", { id: "task-1", limit: 2, offset: first.next_offset }),
      ),
    );
    assertEquals(
      second.messages.map((m: Row) => m.id),
      ["reply-3"],
    );
    assertEquals(second.next_offset, null);
  },
);

Deno.test("thread reads reject invalid pagination and surface database failures", async () => {
  const rows = [entry({ kind: "task", id: "task-1" })];
  ok((await run(rows, "read_task_thread", { id: "task-1", offset: -1 }))?.isError);
  ok((await run(rows, "read_task_thread", { id: "task-1", limit: 20 }))?.isError);
  ok((await run(rows, "read_task_thread", { id: "missing" }))?.isError);
  const failed = await run(rows, "read_task_thread", { id: "task-1" }, { noteReadError: true });
  ok(failed?.isError);
  ok(body(failed).includes("Do not assume there are none"));
});

Deno.test("search title fallback keeps company/scope/kind/history filters", async () => {
  const rows = [
    entry({ id: "a", scope: "company", company_id: "company-a" }),
    entry({ id: "b", scope: "company", company_id: "company-b", body: "other company" }),
    entry({ id: "founder", scope: "founder" }),
    entry({ id: "rule", kind: "rule", scope: "company", company_id: "company-a" }),
    entry({ id: "old", status: "replaced", scope: "company", company_id: "company-a" }),
  ];
  const r = await run(
    rows,
    "search_memory",
    { query: "Blueprint", scope: "company", company: "example-a", kind: "note" },
    { noFullText: true },
  );
  ok(body(r).includes("id a ·"));
  for (const id of ["b", "founder", "rule", "old"]) ok(!body(r).includes(`id ${id} ·`));
});

Deno.test(
  "briefing exposes recent task replies instead of only stale task descriptions",
  async () => {
    const rows = [
      entry({ id: "task-1", kind: "task", task_status: "open", body: "Awaiting reply" }),
      entry({
        id: "reply",
        title: "Reply to planning",
        body: "Claude acknowledged the handoff",
        tags: ["task:task-1"],
      }),
    ];
    const r = await run(rows, "mason_briefing", {});
    ok(body(r).includes("RECENT TASK REPLIES"));
    ok(body(r).includes("Claude acknowledged the handoff"));
  },
);

Deno.test("failed note insert cannot falsely report a delivered reply", async () => {
  const r = await run(
    [entry({ id: "task-1", kind: "task" })],
    "update_task",
    { id: "task-1", note: "A reply" },
    { noteInsertError: "storage unavailable" },
  );
  ok(r?.isError);
  ok(body(r).includes("reply could not be saved"));
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

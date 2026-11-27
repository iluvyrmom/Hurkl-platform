/* Mason (founder) app — Mason's memory, items waiting for the founder's OK, tasks, the AI team, and
 * keys that plug other AI tools into Mason. HURKL admins only: every table is protected by row-level
 * security (is_hurkl_admin), so this page shows nothing to anyone else even if they open it.
 * Everything from the database is rendered with textContent (never innerHTML). */
(function () {
  "use strict";
  const cfg = window.HURKL_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  const PLUG_URL = `${cfg.supabaseUrl}/functions/v1/mason-mcp`;
  const $ = (id) => document.getElementById(id);
  const state = { companies: [], tab: "ask" };

  const KIND_LABEL = { decision: "Decision", rule: "Rule", lesson: "Lesson learned", fact: "Fact", task: "Task", note: "Note" };
  const JOB_TYPES = [
    ["planning", "Planning"], ["writing", "Writing"], ["coding", "Coding"], ["testing", "Testing"],
    ["design", "Design"], ["animation", "Animation"], ["video", "Video"], ["voice", "Voice"],
    ["research", "Research"], ["data", "Numbers and data"], ["marketing", "Marketing"],
  ];
  const CONNECTION_LABEL = {
    plugged_in: "Plugged into Mason", api_ready: "Ready for Mason to use directly",
    opened_by_josh: "You open it yourself for now", not_set_up: "Ready to set up",
  };

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    return el;
  }
  let toastTimer;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 4000);
  }
  function day(iso) {
    return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }
  function show(id) { for (const s of ["loading", "signin", "notAdmin", "main"]) $(s).hidden = s !== id; }
  function companyName(id) { const c = state.companies.find((x) => x.id === id); return c ? c.name : "a company"; }
  function where(m) { return m.scope === "company" ? companyName(m.company_id) : m.scope === "founder" ? "Your notes" : "HURKL (all companies)"; }
  function empty(text) { return h("p", { class: "empty" }, text); }

  function entryCard(m, extra) {
    const meta = [KIND_LABEL[m.kind] || m.kind, where(m), `from ${m.source}`, day(m.created_at)];
    return h("div", { class: "item" },
      h("div", { class: "item-title" }, m.title),
      h("div", { class: "item-meta" }, meta.join(" · ")),
      m.body ? h("div", { class: "item-body" }, m.body) : null,
      extra || null);
  }

  // ---------- tabs ----------
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => openTab(b.dataset.tab)));
  function openTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.dataset.panel !== tab));
    ({ ask: () => {}, approve: loadPending, tasks: loadTasks, team: loadTeam, connect: loadKeys })[tab]();
    window.scrollTo({ top: 0 });
  }

  // ---------- Ask ----------
  $("askForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("askQ").value.trim();
    const out = $("askResults");
    out.replaceChildren();
    if (!q) return;
    let { data, error } = await sb.from("mason_memory").select("*")
      .textSearch("search", q, { type: "websearch", config: "english" })
      .in("status", ["active", "pending_approval"]).order("created_at", { ascending: false }).limit(20);
    if (!error && (!data || !data.length)) {
      ({ data, error } = await sb.from("mason_memory").select("*").ilike("title", `%${q.replace(/[%_]/g, "")}%`)
        .in("status", ["active", "pending_approval"]).limit(20));
    }
    if (error) { out.append(empty("Mason couldn't search just now. Try again in a moment.")); return; }
    if (!data.length) { out.append(empty(`Mason hasn't recorded anything about "${q}" yet. Use "Tell Mason something" below to add it.`)); return; }
    data.forEach((m) => out.append(entryCard(m)));
  });

  $("noteForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("noteError").textContent = "";
    const kind = $("noteKind").value;
    const scopeVal = $("noteScope").value;
    const [scope, company_id] = scopeVal.startsWith("company:") ? ["company", scopeVal.slice(8)] : [scopeVal, null];
    const row = {
      kind, scope, company_id, title: $("noteTitle").value.trim(), body: $("noteBody").value.trim(),
      source: "Josh", status: "active", task_status: kind === "task" ? "open" : null,
    };
    if (!row.title) { $("noteError").textContent = "Add a short title."; return; }
    const { error } = await sb.from("mason_memory").insert(row);
    if (error) {
      $("noteError").textContent = String(error.message).includes("refused_secret")
        ? "Mason keeps passwords, keys and card numbers out of his memory. Remove that part and save again."
        : "That didn't save. Try again in a moment.";
      return;
    }
    $("noteTitle").value = ""; $("noteBody").value = "";
    toast("Saved to Mason's memory.");
    loadPendingCount();
  });

  // ---------- Approvals ----------
  async function loadPendingCount() {
    const { count } = await sb.from("mason_memory").select("id", { count: "exact", head: true }).eq("status", "pending_approval");
    const b = $("pendingBadge"); b.hidden = !count; b.textContent = count || "";
    $("topSub").textContent = count ? `${count} item${count === 1 ? "" : "s"} waiting for your OK` : "Here for you, Josh";
  }
  async function loadPending() {
    const list = $("pendingList");
    const { data, error } = await sb.from("mason_memory").select("*").eq("status", "pending_approval").order("created_at");
    list.replaceChildren();
    if (error) { list.append(empty("Mason couldn't load these just now. Try again in a moment.")); return; }
    if (!data.length) { list.append(empty("You're all caught up. Nothing is waiting for your OK.")); return; }
    for (const m of data) {
      const decide = async (approve, btn) => {
        btn.disabled = true;
        const { data: res, error: err } = await sb.rpc("mason_decide", { p_id: m.id, p_approve: approve });
        if (err) { btn.disabled = false; toast("That didn't go through. Try again."); return; }
        toast(res === "approved" ? "Approved. Mason now treats this as final." : "Set aside. Mason won't use it.");
        loadPending(); loadPendingCount();
      };
      const row = h("div", { class: "row" },
        h("button", { class: "primary", type: "button", onclick: (e) => decide(true, e.currentTarget) }, "Approve"),
        h("button", { class: "secondary", type: "button", onclick: (e) => decide(false, e.currentTarget) }, "Set aside"));
      list.append(entryCard(m, row));
    }
  }

  // ---------- Tasks ----------
  async function loadTasks() {
    const [{ data: open }, { data: done }] = await Promise.all([
      sb.from("mason_memory").select("*").eq("kind", "task").eq("status", "active").neq("task_status", "done").order("created_at"),
      sb.from("mason_memory").select("*").eq("kind", "task").eq("status", "active").eq("task_status", "done").order("updated_at", { ascending: false }).limit(15),
    ]);
    const list = $("taskList"); list.replaceChildren();
    if (!open || !open.length) list.append(empty("Every task is finished. Add a new one under Ask → Tell Mason something."));
    for (const t of open || []) {
      const who = t.assigned_to ? `With ${t.assigned_to}` : "Not assigned yet";
      const btn = h("button", { class: "secondary", type: "button", onclick: async (e) => {
        e.currentTarget.disabled = true;
        const { error } = await sb.from("mason_memory").update({ task_status: "done" }).eq("id", t.id);
        if (error) { e.currentTarget.disabled = false; toast("That didn't save. Try again."); return; }
        toast("Marked done."); loadTasks();
      } }, "Mark done");
      list.append(entryCard({ ...t, title: `${t.task_status === "in_progress" ? "In progress: " : ""}${t.title}` }, h("div", null, h("div", { class: "item-meta" }, who), btn)));
    }
    const dl = $("doneList"); dl.replaceChildren();
    if (!done || !done.length) dl.append(empty("Finished tasks will show here."));
    for (const t of done || []) dl.append(entryCard(t));
  }

  // ---------- AI team ----------
  const pickSel = $("pickType");
  for (const [v, label] of JOB_TYPES) pickSel.append(h("option", { value: v }, label));
  pickSel.addEventListener("change", showPick);
  async function showPick() {
    const tt = pickSel.value;
    // One copy of the pick logic lives in the database: mason_recommend_ai.
    const { data } = await sb.rpc("mason_recommend_ai", { p_task_type: tt });
    const out = $("pickResult"); out.replaceChildren();
    if (!data || !data.length) { out.append("Mason hasn't marked anyone for this kind of job yet."); return; }
    const top = data[0];
    out.append("Mason's pick: ", h("b", null, top.name),
      h("div", { class: "item-meta" }, top.jobs_done ? `${top.jobs_done} jobs so far, score ${top.success_score} of 1` : "Picked by strengths and cost; his track record builds as jobs are logged."),
      data.length > 1 ? h("div", { class: "item-meta" }, `Next choices: ${data.slice(1).map((p) => p.name).join(", ")}`) : null);
  }
  async function loadTeam() {
    showPick();
    const { data } = await sb.from("mason_ai_roster").select("*").eq("active", true).order("name");
    const list = $("rosterList"); list.replaceChildren();
    if (!data || !data.length) { list.append(empty("Mason's AI team list is being set up.")); return; }
    const labels = Object.fromEntries(JOB_TYPES);
    for (const r of data) {
      list.append(h("div", { class: "item" },
        h("div", { class: "item-title" }, r.name),
        h("div", { class: "item-meta" }, [r.maker, CONNECTION_LABEL[r.connection] || r.connection].filter(Boolean).join(" · ")),
        h("div", { class: "item-body" }, `Best for: ${(r.best_for || []).map((t) => labels[t] || t).join(", ") || "being decided"}`),
        h("div", { class: "item-meta" }, r.monthly_cost_usd != null ? `About $${r.monthly_cost_usd} a month${r.cost_notes ? ` · ${r.cost_notes}` : ""}` : (r.cost_notes || "Cost being confirmed")),
        r.notes ? h("div", { class: "item-body" }, r.notes) : null,
        h("div", { class: "item-meta" }, r.last_verified_on ? `Facts checked ${day(r.last_verified_on)}` : "Facts to be checked at the monthly review")));
    }
  }

  // ---------- Connect ----------
  $("plugUrl").textContent = PLUG_URL;
  $("copyUrlBtn").addEventListener("click", async () => { try { await navigator.clipboard.writeText(PLUG_URL); toast("Address copied."); } catch { toast("Press and hold the address to copy it."); } });
  $("makeKeyBtn").addEventListener("click", async (e) => {
    const name = $("keyName").value.trim();
    if (!name) { toast("Name the AI first, like Claude (my phone)."); return; }
    e.currentTarget.disabled = true;
    const { data, error } = await sb.rpc("mason_create_connector", { p_name: name });
    e.currentTarget.disabled = false;
    if (error || !data) { toast("That key didn't save. Try again in a moment."); return; }
    $("newKeyValue").textContent = data;
    $("newKey").hidden = false;
    $("keyName").value = "";
    loadKeys();
  });
  $("copyKeyBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("newKeyValue").textContent); toast("Key copied. Paste it into the AI's connector settings."); }
    catch { toast("Press and hold the key to copy it."); }
  });
  async function loadKeys() {
    const { data } = await sb.from("mason_connectors").select("id, name, created_at, last_used_at, revoked_at").is("revoked_at", null).order("created_at", { ascending: false });
    const list = $("keyList"); list.replaceChildren();
    if (!data || !data.length) { list.append(empty("Your first key will show here once you make it.")); return; }
    for (const k of data) {
      list.append(h("div", { class: "item" },
        h("div", { class: "item-title" }, k.name),
        h("div", { class: "item-meta" }, `Made ${day(k.created_at)} · ${k.last_used_at ? `last used ${day(k.last_used_at)}` : "ready for first use"}`),
        h("button", { class: "secondary", type: "button", onclick: async (e) => {
          if (!confirm(`Turn off the key for ${k.name}? That AI will lose access to Mason until you make it a new key.`)) return;
          e.currentTarget.disabled = true;
          const { error } = await sb.rpc("mason_revoke_connector", { p_id: k.id });
          if (error) { e.currentTarget.disabled = false; toast("That didn't go through. Try again."); return; }
          toast("Key turned off."); loadKeys();
        } }, "Turn off this key")));
    }
  }

  // ---------- sign in ----------
  $("signinForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("email").value.trim().toLowerCase();
    const token = $("code").value.replace(/\D/g, "");
    $("signinError").textContent = "";
    if (!email || token.length < 6 || token.length > 8) { $("signinError").textContent = "Enter your email and your sign-in code."; return; }
    $("signinBtn").disabled = true;
    let { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
    if (error) ({ error } = await sb.auth.verifyOtp({ email, token, type: "magiclink" }));
    $("signinBtn").disabled = false;
    if (error) { $("signinError").textContent = "That code has expired or was already used. HURKL can send a fresh one in seconds."; return; }
    start();
  });
  $("signOutBtn").addEventListener("click", async () => {
    if (!confirm("Sign out of Mason on this phone?")) return;
    await sb.auth.signOut(); location.reload();
  });

  async function redeemInvite() {
    const token = new URLSearchParams(location.search).get("invite");
    if (!token) return null;
    history.replaceState(null, "", location.pathname);
    $("loading").textContent = "Signing you in…";
    try {
      const r = await fetch(`${cfg.supabaseUrl}/functions/v1/redeem-invite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const j = await r.json();
      if (!r.ok || !j.code) throw new Error("invite_failed");
      let { error } = await sb.auth.verifyOtp({ email: j.email, token: j.code, type: "email" });
      if (error) ({ error } = await sb.auth.verifyOtp({ email: j.email, token: j.code, type: "magiclink" }));
      if (error) throw error;
      return null;
    } catch {
      return "This sign-in link has already been used or has expired. HURKL can send a fresh one in seconds.";
    }
  }

  async function start() {
    const problem = await redeemInvite();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { show("signin"); if (problem) $("signinError").textContent = problem; return; }
    const { data: profile } = await sb.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
    if (!profile || profile.role !== "hurkl_admin") { show("notAdmin"); return; }
    const { data: companies } = await sb.from("companies").select("id, name, website_slug").order("name");
    state.companies = (companies || []).filter((c) => c.website_slug);
    const scopeSel = $("noteScope");
    scopeSel.replaceChildren(
      h("option", { value: "hurkl_core" }, "HURKL (all companies)"),
      h("option", { value: "founder" }, "My private notes"),
      ...state.companies.map((c) => h("option", { value: `company:${c.id}` }, `${c.name} only`)));
    show("main");
    openTab("ask");
    loadPendingCount();
  }

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("main").hidden) loadPendingCount(); });
  start();
})();

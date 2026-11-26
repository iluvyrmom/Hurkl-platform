/* HURKL owner app — leads, alerts, Mason switches, setup info, and "From HURKL" posts.
 * All data access goes through Supabase with row-level security: an owner only ever sees their own company.
 * Everything from the database is rendered with textContent (never innerHTML). */
(function () {
  "use strict";
  const cfg = window.HURKL_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  const $ = (id) => document.getElementById(id);
  const state = { profile: null, company: null, openLead: null, copy: {} };

  // ---------- tiny DOM helper ----------
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
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 4000);
  }

  function ago(iso) {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
    return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  function prettyPhone(p) {
    const d = String(p || "").replace(/\D/g, "");
    const t = d.length === 11 && d[0] === "1" ? d.slice(1) : d;
    return t.length === 10 ? `(${t.slice(0, 3)}) ${t.slice(3, 6)}-${t.slice(6)}` : String(p || "");
  }

  function show(id) {
    for (const s of ["loading", "signin", "main"]) $(s).hidden = s !== id;
    $("refreshBtn").hidden = id !== "main";
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
    if (error) { $("signinError").textContent = "That code doesn't match or has expired. Codes last about an hour. HURKL can send you a fresh one."; return; }
    await start();
  });

  $("signOutBtn").addEventListener("click", async () => {
    if (!confirm("Sign out of the Mason app on this phone?")) return;
    await sb.auth.signOut();
    location.reload();
  });
  $("refreshBtn").addEventListener("click", () => loadAll());

  // ---------- leads ----------
  function leadStatus(l) {
    switch (l.followup_status) {
      case "active": return { text: "Mason is reaching out", cls: "" };
      case "answered": return { text: "Mason spoke with them", cls: "good" };
      case "responded": return { text: "They called or texted back", cls: "good" };
      case "exhausted": return { text: "Your turn: give them a call", cls: "warn" };
      case "stopped": return { text: "Your turn: give them a call", cls: "warn" };
      default:
        if (l.status === "booked") return { text: "Booked", cls: "good" };
        return { text: "New", cls: "" };
    }
  }

  function attemptLine(a) {
    const what = a.channel === "sms" ? "Text sent" : `Call ${a.step === 1 ? "1" : a.step === 2 ? "2" : "3"}`;
    const outcome = a.channel === "sms"
      ? (a.status === "sent" ? "" : " (didn't send)")
      : a.outcome === "answered" ? ": they answered" : a.outcome === "no_answer" ? ": no answer" : a.status === "failed" ? ": didn't go through" : "";
    return `${new Date(a.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${what}${outcome}`;
  }

  async function renderLeads() {
    const list = $("leadList");
    const { data: leads, error } = await sb.from("leads")
      .select("id, name, first_name, phone, service_requested, service_address, city, state, postal_code, comments, source, status, followup_status, created_at")
      .order("created_at", { ascending: false }).limit(40);
    list.replaceChildren();
    if (error) { list.append(h("p", { class: "empty" }, "Couldn't load leads. Pull down or tap Refresh.")); return; }
    if (!leads.length) { list.append(h("p", { class: "empty" }, "Your leads will appear here the moment they arrive.")); return; }

    const ids = leads.map((l) => l.id);
    const { data: attempts } = await sb.from("lead_contact_attempts").select("lead_id, step, channel, status, outcome, created_at").in("lead_id", ids).order("created_at");
    const byLead = {};
    for (const a of attempts || []) (byLead[a.lead_id] = byLead[a.lead_id] || []).push(a);

    for (const l of leads) {
      const st = leadStatus(l);
      const open = state.openLead === l.id;
      const addr = [l.service_address, l.city, [l.state, l.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      const detail = h("div", { class: "lead-detail", hidden: !open },
        l.phone ? h("a", { class: "call-btn", href: `tel:${String(l.phone).replace(/[^\d+]/g, "")}` }, `Call ${prettyPhone(l.phone)}`) : null,
        h("dl", {},
          addr ? [h("dt", {}, "Address"), h("dd", {}, addr)] : null,
          l.comments ? [h("dt", {}, "What they wrote"), h("dd", {}, l.comments)] : null,
          (byLead[l.id] || []).length ? [h("dt", {}, "What Mason did"), h("dd", {}, h("ul", { class: "timeline" }, (byLead[l.id]).map((a) => h("li", {}, attemptLine(a)))))] : null,
        ),
      );
      const card = h("div", { class: "lead", id: `lead-${l.id}` },
        h("button", {
          type: "button", "aria-expanded": open ? "true" : "false",
          onclick: () => { state.openLead = state.openLead === l.id ? null : l.id; renderLeads(); },
        },
          h("div", { class: "lead-name" }, l.name || "New customer"),
          h("div", { class: "lead-meta" }, [l.service_requested, l.city, ago(l.created_at)].filter(Boolean).join(" · ")),
          h("span", { class: `chip ${st.cls}` }, st.text),
        ),
        detail,
      );
      list.append(card);
    }
  }

  // ---------- needs you ----------
  async function renderAttention() {
    const list = $("attentionList");
    const { data, error } = await sb.from("owner_escalations").select("id, customer_summary, created_at, status").neq("status", "resolved").order("created_at", { ascending: false }).limit(20);
    list.replaceChildren();
    if (error) { list.append(h("p", { class: "empty" }, "Couldn't load alerts.")); return; }
    if (!data.length) { list.append(h("p", { class: "empty" }, "You're all caught up.")); return; }
    for (const a of data) {
      const label = (String(a.customer_summary || "").match(/^\[([^\]]+)\]/) || [])[1] || "Needs your attention";
      const text = String(a.customer_summary || "").replace(/^\[[^\]]+\]\s*/, "");
      list.append(h("div", { class: "alert" },
        h("div", { class: "alert-title" }, label),
        h("p", {}, text),
        h("p", { class: "lead-meta" }, ago(a.created_at)),
        h("button", { type: "button", class: "secondary", onclick: async (ev) => {
          ev.currentTarget.disabled = true;
          const { error: e2 } = await sb.from("owner_escalations").update({ status: "resolved" }).eq("id", a.id);
          if (e2) { toast("Couldn't update. Try again."); ev.currentTarget.disabled = false; return; }
          toast("Marked as handled.");
          renderAttention();
        } }, "Mark as handled"),
      ));
    }
  }

  // ---------- switches (slide to change) ----------
  // Default wording. HURKL can change any of it from the database (mason_feature_copy) without an app update.
  const SWITCHES = [
    { key: "angi_followup", col: "auto_callback_enabled", title: "Angi lead follow-up",
      on: "Mason calls every new Angi lead within a minute, day or night. If they miss the call, he tries again, sends a text, and lets you know when it's your turn to call.",
      off: "Paused. New Angi leads still appear here so you can call them yourself. Slide to turn Mason's follow-up back on." },
    { key: "owner_texts", col: "owner_texts_enabled", title: "Text message alerts",
      on: "You get a text message with the details of every new lead, in addition to your app notifications.",
      off: "You get app notifications for every new lead. Slide to also get a text message for each one." },
    { key: "business_line", col: "business_line_enabled", ready: "business_line_ready", title: "Mason answers your business line",
      on: "Mason answers every call to your business number, takes the details, and sends them to you.",
      off: "Calls to your business number ring you as usual. Slide to have Mason answer them.",
      soon: "Mason will answer every call to your business number, take the details, and send them straight to you. HURKL will set this up with you." },
    { key: "booking", col: "booking_enabled", ready: "booking_ready", title: "Booking simple jobs",
      on: "Mason books simple jobs into the time slots you choose and sends you the details.",
      off: "Mason takes the details and you confirm the time. Slide to let Mason book simple jobs.",
      soon: "Mason will book your simple jobs into the time slots you choose, so customers get a confirmed time right away." },
  ];

  function makeSlider(sw, isOn, ready) {
    const label = h("div", { class: "slider-label" }, !ready ? "Available soon" : isOn ? "Slide to turn off" : "Slide to turn on");
    const fill = h("div", { class: "slider-fill" });
    const thumb = h("button", { type: "button", class: "thumb", "aria-label": `${sw.title}: slide right to turn ${isOn ? "off" : "on"}`, disabled: !ready }, "›");
    const track = h("div", { class: `slider ${isOn ? "on" : ""} ${ready ? "" : "disabled"}` }, fill, label, thumb);
    if (!ready) return track;

    let startX = 0, dx = 0, dragging = false, max = 0;
    const setPos = (x) => { thumb.style.transform = `translateX(${x}px)`; fill.style.width = `${x + 30}px`; };
    const reset = () => { thumb.style.transition = "transform .2s"; fill.style.transition = "width .2s"; setPos(0); setTimeout(() => { thumb.style.transition = ""; fill.style.transition = ""; }, 220); };

    async function commit() {
      track.classList.add("busy");
      label.textContent = "Saving…";
      const { error } = await sb.rpc("set_mason_feature", { feature: sw.key, enabled: !isOn });
      track.classList.remove("busy");
      if (error) {
        toast(/not_ready/.test(error.message) ? "This feature is coming soon. HURKL will set it up with you." : "That change didn't save. Please check your signal and try again.");
        reset();
        label.textContent = isOn ? "Slide to turn off" : "Slide to turn on";
        return;
      }
      toast(`${sw.title} is now ${!isOn ? "ON" : "OFF"}.`);
      await loadCompany();
      renderSwitches();
    }

    thumb.addEventListener("pointerdown", (e) => {
      dragging = true; startX = e.clientX; dx = 0;
      max = track.clientWidth - thumb.offsetWidth - 8;
      thumb.setPointerCapture(e.pointerId);
    });
    thumb.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dx = Math.min(max, Math.max(0, e.clientX - startX));
      setPos(dx);
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      if (dx >= max * 0.9) { setPos(max); commit(); } else reset();
    };
    thumb.addEventListener("pointerup", end);
    thumb.addEventListener("pointercancel", () => { dragging = false; reset(); });
    // Keyboard / screen reader: two deliberate steps (Right arrow, then Enter) instead of one tap.
    let armed = false;
    thumb.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { armed = true; max = track.clientWidth - thumb.offsetWidth - 8; setPos(max * 0.5); label.textContent = "Press Enter to confirm"; e.preventDefault(); }
      else if (e.key === "Enter" && armed) { armed = false; setPos(max); commit(); e.preventDefault(); }
      else if (e.key === "Escape" || e.key === "ArrowLeft") { armed = false; reset(); label.textContent = isOn ? "Slide to turn off" : "Slide to turn on"; }
    });
    thumb.addEventListener("click", (e) => e.preventDefault()); // a tap never changes anything
    return track;
  }

  function renderSwitches() {
    const list = $("switchList");
    list.replaceChildren();
    for (const base of SWITCHES) {
      const sw = { ...base, ...(state.copy[base.key] || {}) };
      const c = state.company || {};
      const isOn = !!c[sw.col];
      const ready = sw.ready ? !!c[sw.ready] : true;
      list.append(h("div", { class: "sw" },
        h("div", { class: "sw-head" },
          h("div", { class: "sw-title" }, sw.title),
          h("span", { class: `state ${!ready ? "soon" : isOn ? "on" : "off"}` }, !ready ? "COMING SOON" : isOn ? "ON" : "OFF"),
        ),
        h("p", {}, !ready ? sw.soon : isOn ? sw.on : sw.off),
        makeSlider(sw, isOn, ready),
      ));
    }
    // Emergency protocol: always on, never a switch.
    const pic = state.company && state.company.shutoff_image_custom;
    list.append(h("div", { class: "sw emergency" },
      h("div", { class: "sw-head" },
        h("div", { class: "sw-title" }, "Emergency protocol"),
        h("span", { class: "state on" }, "ALWAYS ON"),
      ),
      h("p", {}, "When a customer has water leaking right now, Mason follows these steps:"),
      h("ol", { class: "steps" },
        h("li", {}, "Connects the customer straight to you."),
        h("li", {}, "If you're busy, asks whether they know where their water meter box is and how to shut the water off."),
        h("li", {}, "If they need help, walks them through it step by step and texts them a picture that shows exactly how."),
      ),
      h("div", { class: "bill-row" }, h("span", {}, "Shut-off picture"), h("strong", {}, pic ? "Your picture" : "HURKL standard picture")),
    ));
  }

  // ---------- setup info ----------
  const SETUP = [
    { title: "Texting approval", why: "Phone carriers require this before Mason can send text messages for your business.", fields: [
      { k: "legal_business_name", label: "Legal business name (exactly as it appears with the IRS)" },
      { k: "ein", label: "EIN (federal tax ID)", ein: true },
      { k: "business_address", label: "Business mailing address" },
      { k: "business_email", label: "Business email", type: "email" },
      { k: "business_website", label: "Website (optional)", optional: true },
    ] },
    { title: "Angi and your phone", why: "This lets Mason take over your Angi leads and reach you fast when it matters.", fields: [
      { k: "angi_account_number", label: "Your Angi account number" },
      { k: "lead_alert_cell", label: "Cell number for your text alerts", type: "tel" },
      { k: "business_number_is_cell", label: "Which number do your customers call?", choice: [["no", "A separate business number"], ["yes", "My personal cell"]] },
      { k: "business_number", label: "Your business number (if separate)", type: "tel", optional: true },
      { k: "emergency_transfer_number", label: "Best number to reach you for emergencies", type: "tel" },
    ] },
    { title: "Simple booking", why: "We start with a few simple jobs and grow from there as Mason learns how you work.", fields: [
      { k: "simple_jobs", label: "Which simple jobs should Mason book first? (for example: drain cleaning, toilet replacement, estimate visits)", area: true },
      { k: "time_slots", label: "Which 2–3 time slots would you like to offer each week? (for example: Tuesday 9–11 AM)", area: true },
      { k: "service_area", label: "Which cities or ZIP codes do you serve?", area: true },
      { k: "jobs_wanted", label: "Which jobs would you like more of? (optional)", area: true, optional: true },
    ] },
  ];

  async function renderSetup() {
    const list = $("setupList");
    const { data: info } = await sb.from("company_setup_info").select("*").maybeSingle();
    const v = info || {};
    let done = 0, total = 0;
    list.replaceChildren();
    for (const group of SETUP) {
      const inputs = {};
      const groupDone = group.fields.every((f) => f.optional || (f.ein ? v.ein_on_file : !!v[f.k]));
      const form = h("form", { novalidate: true });
      const box = h("details", { class: "card", open: !groupDone },
        h("summary", { class: "setup-summary" }, `${groupDone ? "✓ " : ""}${group.title}`),
        form);
      form.append(h("p", { class: "muted", style: "margin-top:8px" }, group.why));
      for (const f of group.fields) {
        if (!f.optional) { total++; if (f.ein ? v.ein_on_file : v[f.k]) done++; }
        const id = `f_${f.k}`;
        form.append(h("label", { for: id }, f.label));
        let input;
        if (f.choice) {
          input = h("select", { id, class: "field" },
            h("option", { value: "" }, "Choose…"), f.choice.map(([val, txt]) => h("option", { value: val, selected: v[f.k] === val }, txt)));
        } else if (f.area) {
          input = h("textarea", { id, rows: 3, class: "field" });
          input.value = v[f.k] || "";
        } else if (f.ein) {
          input = h("input", { id, type: "text", inputmode: "numeric", autocomplete: "off", placeholder: v.ein_on_file ? "On file ✓ (type to replace)" : "12-3456789" });
        } else {
          input = h("input", { id, type: f.type || "text", autocomplete: "off" });
          input.value = v[f.k] || "";
        }
        inputs[f.k] = input;
        form.append(input);
      }
      const err = h("p", { class: "error", role: "alert" });
      const btn = h("button", { class: "primary", type: "submit" }, "Save");
      form.append(btn, err);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        err.textContent = "";
        const payload = {};
        let ein = null;
        for (const f of group.fields) {
          if (f.ein) { const raw = inputs[f.k].value.trim(); if (raw) ein = raw; continue; }
          payload[f.k] = inputs[f.k].value;
        }
        if (ein && ein.replace(/\D/g, "").length !== 9) { err.textContent = "An EIN has 9 digits, like 12-3456789."; return; }
        btn.disabled = true; btn.textContent = "Saving…";
        const { error } = await sb.rpc("save_setup_info", { info: payload, ein });
        btn.disabled = false; btn.textContent = "Save";
        if (error) { err.textContent = "Couldn't save. Check your signal and try again."; return; }
        toast(`${group.title} saved.`);
        renderSetup();
      });
      list.append(box);
    }
    // While setup is unfinished it sits at the top; once done it moves below the switches.
    const main = $("main");
    if (done >= total) main.insertBefore($("setup"), $("hurkl"));
    else main.insertBefore($("setup"), $("attention"));
    $("setupProgress").textContent = done >= total
      ? "All set. Thank you! You can update anything here at any time."
      : `${done} of ${total} done. Fill this in right here; it stays private to your company.`;
  }

  // ---------- From HURKL ----------
  async function renderNews() {
    const list = $("newsList");
    const { data } = await sb.from("hurkl_announcements").select("id, title, body, cta_label, cta_url, created_at").eq("published", true).order("created_at", { ascending: false }).limit(10);
    list.replaceChildren();
    list.append(h("div", { class: "news welcome" },
      h("img", { src: "/mason-face-256.png", alt: "" }),
      h("div", {}, h("div", { class: "news-title" }, "Welcome to Mason by HURKL"),
        h("p", {}, "I answer your leads in seconds, day or night, so you can focus on the work. New features and updates from HURKL show up right here."))));
    if (!data || !data.length) return;
    for (const n of data) {
      const safeUrl = /^(https:\/\/|tel:|sms:)/.test(n.cta_url || "") ? n.cta_url : null;
      list.append(h("div", { class: "news" },
        h("div", { class: "news-title" }, n.title),
        h("p", {}, n.body),
        safeUrl && n.cta_label ? h("a", { class: "secondary", href: safeUrl, target: safeUrl.startsWith("https") ? "_blank" : null, rel: "noopener" }, n.cta_label) : null,
        h("div", { class: "news-date" }, ago(n.created_at)),
      ));
    }
  }

  // ---------- billing ----------
  // Amounts shown come from the server; the card form is Stripe's own (card numbers never touch HURKL).
  const money = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
  const day = (unix) => new Date(unix * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const dayOfMonth = (unix) => { const d = new Date(unix * 1000).getDate(); const s = ["th", "st", "nd", "rd"][(d % 100 - 20) % 10] || ["th", "st", "nd", "rd"][d % 100] || "th"; return `${d}${s}`; };

  async function billingCall(action) {
    const { data, error } = await sb.functions.invoke("owner-billing", { body: { action } });
    if (error) {
      let msg = null;
      try { msg = (await error.context.json()).message; } catch { /* ignore */ }
      return { error: msg || "Billing isn't reachable right now. Try again in a minute." };
    }
    return data;
  }

  async function payWithCardForm(box, res, title, buttonText) {
    if (!window.Stripe) { toast("The secure card form didn't load. Check your signal and try again."); return; }
    const stripeJs = window.Stripe(res.publishable_key);
    const elements = stripeJs.elements({ clientSecret: res.client_secret, appearance: { theme: "night", variables: { fontSizeBase: "18px", colorPrimary: "#D4AF37", colorBackground: "#16161A", colorText: "#F5F1E6", colorDanger: "#FF8A80", borderRadius: "10px" } } });
    const mount = h("div", { id: "payElement" });
    const err = h("p", { class: "error", role: "alert" });
    const btn = h("button", { class: "primary", type: "button" }, buttonText);
    const cancel = h("button", { class: "secondary", type: "button", onclick: () => renderBilling() }, "Cancel");
    box.replaceChildren(h("h2", {}, title), h("p", { class: "fine" }, "Secured by Stripe. HURKL never sees your card number."), mount, btn, err, cancel);
    elements.create("payment", { layout: "tabs" }).mount(mount);
    btn.addEventListener("click", async () => {
      btn.disabled = true; btn.textContent = "Processing…"; err.textContent = "";
      const opts = { elements, redirect: "if_required", confirmParams: { return_url: `${location.origin}/#billing` } };
      const { error } = res.setup ? await stripeJs.confirmSetup(opts) : await stripeJs.confirmPayment(opts);
      if (error) { err.textContent = error.message || "That didn't go through. Check the card and try again."; btn.disabled = false; btn.textContent = buttonText; return; }
      toast(res.setup ? "Card saved." : "Payment received. Thank you!");
      box.replaceChildren(h("p", { class: "muted" }, "Updating…"));
      for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 1500)); const s = await billingCall("status"); if (res.setup || ["active"].includes(s.status)) break; }
      renderBilling(); loadCompany().then(renderSwitches);
    });
  }

  async function renderBilling() {
    const box = $("billingBox");
    const s = await billingCall("status");
    box.replaceChildren();
    if (s.error) { box.append(h("p", { class: "muted" }, s.error)); return; }
    if (s.exempt) { box.append(h("div", { class: "banner good" }, "Partner account. Mason is included at no cost.")); return; }
    if (!s.configured) {
      box.append(h("div", { class: "bill-amount" }, `${money(s.plan_cents)}/month`), h("div", { class: "banner warn" }, "Online payment is being set up. Your pay button will appear right here very soon."));
      return;
    }
    const act = (label, action, cls = "primary") => h("button", { class: cls, type: "button", onclick: async (e) => {
      e.currentTarget.disabled = true;
      const res = await billingCall(action);
      if (res.error) { toast(res.error); e.currentTarget.disabled = false; return; }
      if (res.client_secret) return payWithCardForm(box, res, label, action === "update_card" ? "Save card" : `Pay ${money(res.amount_cents)}`);
      toast(res.paid ? "Payment received. Mason is on." : "Done.");
      renderBilling(); loadCompany().then(renderSwitches);
    } }, label);

    box.append(h("div", { class: "bill-amount" }, `${money(s.plan_cents)}/month`), h("p", { class: "muted" }, "Flat rate. Renews automatically on the same day each month."));

    if (s.status === "none" || s.status === "canceled") {
      box.append(
        h("p", {}, "Mason starts the moment your first payment goes through. That day becomes your billing date every month."),
        act(`Start Mason: pay ${money(s.plan_cents)}`, "start"),
      );
    } else if (s.status === "active") {
      box.append(
        h("div", { class: "banner good" }, "Active. Mason is working for you."),
        s.next_charge ? h("div", { class: "bill-row" }, h("span", {}, "Next charge"), h("strong", {}, `${money(s.plan_cents)} on ${day(s.next_charge)}`)) : null,
        s.card ? h("div", { class: "bill-row" }, h("span", {}, "Card on file"), h("strong", {}, `${s.card.brand.toUpperCase()} •••• ${s.card.last4}`)) : null,
        act("Update card", "update_card", "secondary"),
      );
    } else if (s.status === "past_due") {
      box.append(
        h("div", { class: "banner warn" }, `Your last payment didn't go through. Mason keeps working until ${s.grace_ends_at ? new Date(s.grace_ends_at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "the 72-hour mark"}.`),
        s.open_bill ? h("div", { class: "bill-row" }, h("span", {}, "Amount due"), h("strong", {}, money(s.open_bill.amount_cents))) : null,
        s.card ? act(`Pay now with ${s.card.brand.toUpperCase()} •••• ${s.card.last4}`, "pay_now") : null,
        act("Pay with a different card", "pay_new_card", s.card ? "secondary" : "primary"),
      );
    } else if (s.status === "paused") {
      const billDay = s.open_bill ? dayOfMonth(s.open_bill.created) : "same day";
      box.append(
        h("div", { class: "banner bad" }, "Mason is paused. New leads still show up here and you still get alerts, but Mason isn't calling them."),
        h("p", {}, "Pay to turn Mason back on right away:"),
        act(`Pay ${money(s.open_bill ? s.open_bill.amount_cents : s.plan_cents)}, keep my billing date (the ${billDay})`, "pay_new_card"),
        act(`Pay ${money(s.plan_cents + s.restart_fee_cents)}, restart my month today`, "restart_today", "secondary"),
        h("p", { class: "fine" }, `Restarting today costs ${money(s.restart_fee_cents)} extra and moves your billing date to today.`),
      );
    }

    if (s.receipts && s.receipts.length) {
      box.append(h("h2", { style: "margin-top:18px" }, "Receipts"), h("ul", { class: "receipts" },
        s.receipts.map((r) => h("li", {}, h("span", {}, day(r.date)),
          r.url && /^https:\/\//.test(r.url) ? h("a", { href: r.url, target: "_blank", rel: "noopener" }, `${money(r.amount_cents)} · View`) : h("span", {}, money(r.amount_cents))))));
    }
    box.append(h("p", { class: "fine" }, "If a payment ever needs attention, Mason keeps working for 72 hours while you update it. You can cancel anytime, and service continues through the month you've paid for."));
  }

  // ---------- notifications ----------
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  function b64ToBytes(s) {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const bin = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  async function setupNotifyCard() {
    const card = $("notifyCard");
    if (!("serviceWorker" in navigator)) { card.hidden = true; return; }
    const reg = await navigator.serviceWorker.register("/sw.js");
    if (!("PushManager" in window) || !("Notification" in window)) {
      if (isIOS && !standalone) {
        card.hidden = false;
        $("notifyText").textContent = "On iPhone: tap the Share button, then \"Add to Home Screen\". Open Mason from your home screen, then turn on notifications here.";
        $("notifyBtn").hidden = true;
      } else card.hidden = true;
      return;
    }
    const existing = await reg.pushManager.getSubscription();
    if (existing && Notification.permission === "granted") { await saveSubscription(existing); card.hidden = true; return; }
    if (Notification.permission === "denied") {
      card.hidden = false;
      $("notifyText").textContent = "Notifications are blocked for this app. Turn them on in your phone's settings for this app, then come back.";
      $("notifyBtn").hidden = true;
      return;
    }
    card.hidden = false;
    $("notifyBtn").onclick = async () => {
      $("notifyError").textContent = "";
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { $("notifyError").textContent = "Notifications are still off. Tap the button again and choose Allow."; return; }
        const r = await fetch(`${cfg.supabaseUrl}/functions/v1/owner-push?public-key`);
        const { publicKey } = await r.json();
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
        await saveSubscription(sub);
        card.hidden = true;
        toast("Notifications are on. You'll hear about every new lead.");
      } catch (e) {
        $("notifyError").textContent = "Couldn't turn on notifications. Try again.";
      }
    };
  }

  async function saveSubscription(sub) {
    const j = sub.toJSON();
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from("push_subscriptions").insert({
      company_id: state.profile.company_id, user_id: user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200),
    });
    if (error && error.code !== "23505") throw error; // 23505 = already saved
  }

  // ---------- load ----------
  async function loadCompany() {
    const { data } = await sb.from("companies").select("id, name, auto_callback_enabled, owner_texts_enabled, shutoff_guide_enabled, business_line_enabled, business_line_ready, booking_enabled, booking_ready").eq("id", state.profile.company_id).maybeSingle();
    state.company = data;
    const { data: copy } = await sb.from("mason_feature_copy").select("feature, title, on_text, off_text, soon_text");
    state.copy = {};
    for (const r of copy || []) state.copy[r.feature] = Object.fromEntries(Object.entries({ title: r.title, on: r.on_text, off: r.off_text, soon: r.soon_text }).filter(([, v]) => v));
    $("companyName").textContent = data ? data.name : "Mason";
  }

  async function loadAll() {
    await loadCompany();
    renderSwitches();
    await Promise.all([renderAttention(), renderLeads(), renderSetup(), renderNews(), renderBilling()]);
    const target = location.hash && document.querySelector(location.hash.replace(/[^#\w-]/g, ""));
    if (target) target.scrollIntoView({ block: "start" });
  }

  // One-time invite link (?invite=...): sign the owner in without typing anything.
  async function redeemInvite() {
    const token = new URLSearchParams(location.search).get("invite");
    if (!token) return;
    history.replaceState(null, "", location.pathname + location.hash); // the link works once; remove it from the address bar
    $("loading").textContent = "Signing you in…";
    try {
      const r = await fetch(`${cfg.supabaseUrl}/functions/v1/redeem-invite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const j = await r.json();
      if (!r.ok || !j.code) throw new Error(j.error || "invite_failed");
      let { error } = await sb.auth.verifyOtp({ email: j.email, token: j.code, type: "email" });
      if (error) ({ error } = await sb.auth.verifyOtp({ email: j.email, token: j.code, type: "magiclink" }));
      if (error) throw error;
    } catch (e) {
      state.inviteProblem = "This invite link has already been used or has expired. HURKL can send you a fresh one in seconds.";
    }
  }

  async function start() {
    await redeemInvite();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { show("signin"); if (state.inviteProblem) $("signinError").textContent = state.inviteProblem; return; }
    const { data: profile } = await sb.from("profiles").select("company_id, role, full_name").eq("id", session.user.id).maybeSingle();
    if (!profile || !profile.company_id) {
      show("signin");
      $("signinError").textContent = "This login is almost ready. Text HURKL and we'll finish connecting it to your business.";
      return;
    }
    state.profile = profile;
    show("main");
    await loadAll();
    setupNotifyCard().catch(() => {});
  }

  document.addEventListener("visibilitychange", () => { if (!document.hidden && state.profile) loadAll(); });
  window.addEventListener("hashchange", () => { const m = location.hash.match(/^#lead-([0-9a-f-]{36})$/); if (m) { state.openLead = m[1]; renderLeads(); } });
  const m = location.hash.match(/^#lead-([0-9a-f-]{36})$/);
  if (m) state.openLead = m[1];
  start();
})();

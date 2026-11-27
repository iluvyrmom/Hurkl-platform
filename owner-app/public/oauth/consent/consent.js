/* Mason — sign-in consent page for AI tools that connect by signing in (ChatGPT).
 *
 * Supabase Auth's OAuth server sends the founder here with ?authorization_id=… after an AI tool
 * asks to connect to the HURKL plug. Only a signed-in HURKL admin can approve. Approving lets that
 * tool use the plug (https://hurkl-mason-app.netlify.app/mcp) with the same limits as a plug key;
 * the plug itself re-checks admin rights on every call. Nothing here stores anything.
 * Everything from the server is shown with textContent (never innerHTML). */
(function () {
  "use strict";
  const cfg = window.HURKL_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, lock: async (_n, _t, fn) => fn() },
  });
  const $ = (id) => document.getElementById(id);
  const authorizationId = new URLSearchParams(location.search).get("authorization_id") || "";

  function show(id) {
    for (const s of ["loading", "signin", "ask", "message"]) $(s).hidden = s !== id;
  }
  function message(title, text) {
    $("messageTitle").textContent = title;
    $("messageText").textContent = text;
    show("message");
  }

  async function oauthCall(method, path, body) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("not_signed_in");
    const r = await fetch(`${cfg.supabaseUrl}/auth/v1/oauth/authorizations/${encodeURIComponent(authorizationId)}${path}`, {
      method,
      headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.msg || j.message || j.error_description || `http_${r.status}`);
    return j;
  }

  function safeRedirect(url) {
    try {
      const u = new URL(url);
      if (u.protocol === "https:") { location.assign(u.toString()); return true; }
    } catch { /* fall through */ }
    return false;
  }

  async function decide(action) {
    $("approveBtn").disabled = true; $("denyBtn").disabled = true; $("askError").textContent = "";
    try {
      const j = await oauthCall("POST", "/consent", { action });
      if (j.redirect_url && safeRedirect(j.redirect_url)) return;
      message("All set", "You can go back to the AI tool now.");
    } catch {
      $("approveBtn").disabled = false; $("denyBtn").disabled = false;
      $("askError").textContent = "That didn't go through. Tap again, or start the connection again from the AI tool.";
    }
  }

  async function start() {
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(authorizationId)) {
      message("Start from the AI tool", "This page opens on its own when an AI tool like ChatGPT asks to connect to Mason.");
      return;
    }
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { show("signin"); return; }

    const { data: profile } = await sb.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
    if (profile?.role !== "hurkl_admin") {
      message("This connection is for the HURKL founder", "Only the HURKL founder can connect AI tools to Mason.");
      return;
    }

    let details;
    try {
      details = await oauthCall("GET", "");
    } catch {
      message("This request has expired", "Start the connection again from the AI tool, and this page will open fresh.");
      return;
    }
    // Already approved before: go straight back to the AI tool.
    if (!details.authorization_id && details.redirect_url) {
      if (safeRedirect(details.redirect_url)) return;
    }
    const name = (details.client && (details.client.client_name || details.client.name)) || "An AI tool";
    let host = "";
    try { host = new URL(details.redirect_uri).host; } catch { /* leave blank */ }
    $("askTitle").textContent = `Connect ${name} to Mason?`;
    $("askWho").textContent = host ? `It will return you to ${host} when you're done.` : "";
    show("ask");
  }

  $("approveBtn").addEventListener("click", () => decide("approve"));
  $("denyBtn").addEventListener("click", () => decide("deny"));

  $("sendCodeBtn").addEventListener("click", async () => {
    const email = $("email").value.trim().toLowerCase();
    $("signinError").textContent = ""; $("signinNote").textContent = "";
    if (!email) { $("signinError").textContent = "Enter your email first."; return; }
    $("sendCodeBtn").disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    $("sendCodeBtn").disabled = false;
    if (error) { $("signinError").textContent = "We couldn't send a code just now. Wait a minute and try again."; return; }
    $("signinNote").textContent = "Check your email for the code, then enter it below.";
  });

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
    if (error) { $("signinError").textContent = "That code has expired or was already used. Tap \"Email me a sign-in code\" for a fresh one."; return; }
    show("loading");
    start();
  });

  start();
})();

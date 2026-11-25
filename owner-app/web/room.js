/* HURKL Job Room — guest page. No account: the link itself is the key, and it only ever opens one room.
 * The link's secret lives in the page's #fragment, so it is never sent to any web server's logs. */
(function () {
  "use strict";
  const cfg = window.HURKL_CONFIG;
  const UI = window.JobRoomUI;
  const $ = (id) => document.getElementById(id);
  const FN = `${cfg.supabaseUrl}/functions/v1/job-room`;

  const token = (location.hash.match(/^#(?:t=)?([A-Za-z0-9_-]{40,100})$/) || [])[1] || null;
  const secretKey = token ? `jr_secret_${token.slice(0, 12)}` : null;
  let secret = null;
  try {
    secret = secretKey ? localStorage.getItem(secretKey) : null;
  } catch {
    /* private mode */
  }
  let pollTimer = null;

  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 4000);
  }

  async function call(action, extra) {
    let res;
    try {
      res = await fetch(FN, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: cfg.supabaseKey },
        body: JSON.stringify({ action, token, secret, ...extra }),
      });
    } catch {
      throw new Error("No connection. Check your signal and try again.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.message || "Something went wrong. Please try again.");
      e.code = data.error;
      throw e;
    }
    return data;
  }

  function show(id) {
    for (const s of ["loading", "problem", "nameCard", "chat"]) $(s).hidden = s !== id;
  }

  function problem(title, text) {
    $("problemTitle").textContent = title;
    $("problemText").textContent = text;
    show("problem");
    stopPolling();
  }

  function forgetSecret() {
    secret = null;
    try {
      localStorage.removeItem(secretKey);
    } catch {
      /* ignore */
    }
  }

  async function load() {
    let room;
    try {
      room = await call("guest_open");
    } catch (e) {
      if (!$("chat").hidden) toast(e.message);
      else problem("Couldn't open this room", e.message);
      return;
    }

    if (room.status === "not_found")
      return problem(
        "This link isn't working",
        "Double-check the link you were sent, or ask the business for a new one.",
      );
    const from = room.company_name
      ? ` Ask ${room.company_name} for a new link.`
      : " Ask the business for a new link.";
    if (room.status === "off")
      return problem(
        "This link has been turned off",
        `The business turned this room's link off.${from}`,
      );
    if (room.status === "expired")
      return problem("This link has expired", `Rooms close after 90 days with no activity.${from}`);

    document.title = `${room.room_name} · Job Room`;
    $("roomName").textContent = room.room_name;
    $("companyName").textContent = room.company_name || "";

    if (!room.guest_name) {
      if (secret) forgetSecret(); // an old name from a replaced link
      show("nameCard");
      $("guestName").focus();
      return;
    }
    show("chat");
    UI.renderMessages($("msgs"), room.messages || [], { viewer: "guest" });
    startPolling();
  }

  // Ask for a name the first time.
  $("nameForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("guestName").value.trim().replace(/\s+/g, " ");
    $("nameError").textContent = "";
    if (!name) {
      $("nameError").textContent = "Please enter your name.";
      return;
    }
    $("nameBtn").disabled = true;
    try {
      const res = await call("guest_join", { name });
      secret = res.secret;
      try {
        localStorage.setItem(secretKey, secret);
      } catch {
        /* private mode: name is asked again next visit */
      }
      await load();
    } catch (ex) {
      $("nameError").textContent = ex.message;
    } finally {
      $("nameBtn").disabled = false;
    }
  });

  function handleAuthError(e) {
    if (e.code === "name_needed") {
      forgetSecret();
      load();
      return true;
    }
    if (e.code === "link_unavailable" || e.code === "not_found") {
      load();
      return true;
    }
    return false;
  }

  const form = UI.composer();
  $("composerSlot").append(form);
  UI.wireComposer(form, {
    send: async (body) => {
      try {
        await call("guest_post", { body });
      } catch (e) {
        if (handleAuthError(e)) return;
        throw e;
      }
      await load();
    },
    photo: async (file) => {
      try {
        await UI.uploadPhoto(
          file,
          (info) => call("guest_photo_start", info),
          (message_id) => call("guest_photo_done", { message_id }),
        );
      } catch (e) {
        if (handleAuthError(e)) return;
        throw e;
      }
    },
    refresh: () => load(),
  });

  // New messages appear on their own while the page is open (every 15 seconds).
  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      if (!document.hidden) load();
    }, 15000);
  }
  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !$("chat").hidden) load();
  });

  if (!token)
    problem(
      "This link isn't complete",
      "The link looks cut off. Try opening it again from the text message, or ask the business to send it again.",
    );
  else load();
})();

/* HURKL owner app — Job Rooms (add-on). Kept in its own file so the rest of the app (app.js) is untouched.
 * Shows only when HURKL has turned the Job Rooms add-on on for this business; otherwise it stays invisible.
 * Uses the owner's existing sign-in (read-only: this file never signs in, out, or refreshes the session).
 * Every action is checked again by the database: owner only, own company only, add-on on. */
(function () {
  "use strict";
  const cfg = window.HURKL_CONFIG;
  const UI = window.JobRoomUI;
  const h = UI.h;
  const $ = (id) => document.getElementById(id);
  const REF = new URL(cfg.supabaseUrl).hostname.split(".")[0];
  const state = { rooms: [], open: null, poll: null, loaded: false };

  // ---------- plumbing ----------
  function accessToken() {
    try {
      const raw = JSON.parse(localStorage.getItem(`sb-${REF}-auth-token`) || "null");
      const s = raw && (raw.access_token ? raw : raw.currentSession);
      return s && s.access_token ? s.access_token : null;
    } catch {
      return null;
    }
  }

  function friendly(code, fallback) {
    switch (code) {
      case "job_rooms_off":
        return "Job Rooms isn't turned on for your business. Text Josh at HURKL to add it.";
      case "owner_only":
        return "Only the business owner can use Job Rooms.";
      case "not_signed_in":
      case "PGRST301":
        return "Your sign-in expired. Tap Refresh at the top.";
      case "rate_limited":
        return "That's a lot at once. Wait a few minutes and try again.";
      case "bad_name":
        return "Give the room a name (up to 80 letters).";
      case "bad_message":
        return "Messages can be up to 2,000 characters.";
      case "too_many_rooms":
        return "You've reached the Job Room limit. Contact HURKL.";
      default:
        return fallback || "Something went wrong. Check your signal and try again.";
    }
  }

  async function request(url, payload) {
    const token = accessToken();
    if (!token) {
      const e = new Error(friendly("not_signed_in"));
      e.code = "not_signed_in";
      throw e;
    }
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: cfg.supabaseKey,
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload || {}),
      });
    } catch {
      throw new Error("No connection. Check your signal and try again.");
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // Edge Function errors: { error: "code", message: "plain words" }.
      // Database (PostgREST) errors: { code: "42501", message: "code" }; expired sign-in: PGRST30x.
      const d = data || {};
      const fromFn =
        typeof d.error === "string" && /^[a-z_]+$/.test(d.error) && typeof d.message === "string";
      const code = fromFn
        ? d.error
        : /^PGRST30/.test(String(d.code || "")) || res.status === 401
          ? "not_signed_in"
          : (String(d.message || "").match(/^[a-z_]+$/) || [""])[0];
      const e = new Error(fromFn ? d.message : friendly(code));
      e.code = code;
      throw e;
    }
    return data;
  }

  const rpc = (name, args) => request(`${cfg.supabaseUrl}/rest/v1/rpc/${name}`, args);
  const fn = (action, extra) =>
    request(`${cfg.supabaseUrl}/functions/v1/job-room`, { action, ...extra });

  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 4000);
  }

  const linkFor = (room) => `${location.origin}/room.html#${room.link_token}`;
  const shareText = (room) =>
    `Here's a private link for "${room.name}". Open it to share photos and ideas for the job: ${linkFor(room)}`;

  function statusChip(status) {
    if (status === "expired") return h("span", { class: "chip warn" }, "Link expired");
    if (status === "off") return h("span", { class: "chip bad" }, "Link off");
    return h("span", { class: "chip good" }, "Link on");
  }

  function ago(iso) {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // ---------- room list ----------
  async function loadRooms() {
    if (!accessToken()) return;
    let rooms;
    try {
      rooms = await rpc("jr_owner_rooms");
    } catch (e) {
      // Add-on off (or not the owner): keep the whole section invisible.
      if (e.code === "job_rooms_off" || e.code === "owner_only") {
        $("jobrooms").hidden = true;
        return;
      }
      if (!state.loaded) return; // don't show a broken section on first load
      toast(e.message);
      return;
    }
    state.loaded = true;
    state.rooms = rooms || [];
    $("jobrooms").hidden = false;
    renderRooms();
    const m = location.hash.match(/^#room-([0-9a-f-]{36})$/);
    if (m && (!state.open || state.open.id !== m[1])) openRoom(m[1]);
  }

  function renderRooms() {
    const list = $("roomList");
    list.replaceChildren();
    if (!state.rooms.length) {
      list.append(
        h(
          "p",
          { class: "empty" },
          "No Job Rooms yet. Tap New Job Room, name it after the job, then text the link to your customer.",
        ),
      );
      return;
    }
    for (const r of state.rooms) {
      list.append(
        h(
          "button",
          {
            type: "button",
            class: "room-card",
            onclick: () => {
              location.hash = `room-${r.id}`;
            },
          },
          h(
            "div",
            { class: "room-card-head" },
            h("div", { class: "room-card-name" }, r.name),
            Number(r.unread) > 0
              ? h("span", { class: "unread", "aria-label": `${r.unread} new` }, String(r.unread))
              : null,
          ),
          h(
            "div",
            { class: "lead-meta" },
            `Active ${ago(r.last_activity_at)} · ${r.guests} ${Number(r.guests) === 1 ? "guest" : "guests"}`,
          ),
          statusChip(r.status),
        ),
      );
    }
  }

  // New room: a simple inline form (no pop-ups).
  function newRoomForm() {
    const box = $("newRoomBox");
    if (!box.hidden) {
      box.hidden = true;
      return;
    }
    const input = h("input", {
      id: "newRoomName",
      type: "text",
      maxlength: 80,
      placeholder: "Smith kitchen remodel",
      autocomplete: "off",
    });
    const err = h("p", { class: "error", role: "alert" });
    const btn = h("button", { class: "primary", type: "submit" }, "Create room");
    const form = h(
      "form",
      { novalidate: true },
      h("label", { for: "newRoomName" }, "Name this job"),
      input,
      btn,
      h(
        "button",
        {
          class: "link-btn",
          type: "button",
          onclick: () => {
            box.hidden = true;
          },
        },
        "Cancel",
      ),
      err,
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) {
        err.textContent = "Give the room a name, like the customer's last name and the job.";
        return;
      }
      btn.disabled = true;
      btn.textContent = "Creating…";
      try {
        const room = await rpc("jr_create_room", { p_name: name });
        box.hidden = true;
        toast("Job Room created. Now text the link.");
        await loadRooms();
        location.hash = `room-${room.id}`;
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
        btn.textContent = "Create room";
      }
    });
    box.replaceChildren(h("div", { class: "card" }, form));
    box.hidden = false;
    input.focus();
  }

  // ---------- one room ----------
  async function openRoom(id) {
    state.open = { id };
    $("roomView").hidden = false;
    document.body.style.overflow = "hidden";
    $("roomTitle").textContent = (state.rooms.find((r) => r.id === id) || {}).name || "Job Room";
    $("roomMsgs").replaceChildren(h("p", { class: "loading" }, "Loading…"));
    delete $("roomMsgs").dataset.drawn;
    $("roomLinkBox").replaceChildren();
    await refreshRoom();
    clearInterval(state.poll);
    state.poll = setInterval(() => {
      if (!document.hidden && state.open) refreshRoom();
    }, 15000);
  }

  function closeRoom() {
    state.open = null;
    clearInterval(state.poll);
    $("roomView").hidden = true;
    document.body.style.overflow = "";
    if (/^#room-/.test(location.hash))
      history.replaceState(null, "", `${location.pathname}#jobrooms`);
    loadRooms();
  }

  async function refreshRoom() {
    if (!state.open) return;
    const id = state.open.id;
    let res;
    try {
      res = await fn("owner_messages", { room_id: id });
    } catch (e) {
      if (e.code === "room_not_found") {
        toast("That Job Room wasn't found.");
        closeRoom();
        return;
      }
      toast(e.message);
      return;
    }
    if (!state.open || state.open.id !== id) return;
    state.open = res.room;
    $("roomTitle").textContent = res.room.name;
    renderLinkBox(res.room);
    UI.renderMessages($("roomMsgs"), res.messages || [], {
      viewer: "owner",
      onDelete: deleteMessage,
      scroller: document.querySelector(".room-body"),
    });
  }

  function renderLinkBox(room) {
    const box = $("roomLinkBox");
    const act = (label, cls, onclick) =>
      h("button", { type: "button", class: cls, onclick }, label);
    const run = async (work, done) => {
      try {
        await work();
        if (done) toast(done);
        await refreshRoom();
      } catch (e) {
        toast(e.message);
      }
    };
    const expires = new Date(room.expires_at).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const parts = [
      h(
        "div",
        { class: "sw-head" },
        h("div", { class: "sw-title" }, "Share link"),
        statusChip(room.status),
      ),
    ];
    if (room.status === "ok") {
      parts.push(
        h(
          "p",
          { class: "muted", style: "margin:6px 0 0" },
          `Anyone with this link sees only this room. It closes after 90 days with no activity (now ${expires}).`,
        ),
        h(
          "div",
          { class: "link-row" },
          h(
            "a",
            { class: "primary", href: `sms:?&body=${encodeURIComponent(shareText(room))}` },
            "Text the link",
          ),
          act(navigator.share ? "Share…" : "Copy link", "secondary", async () => {
            try {
              if (navigator.share)
                await navigator.share({ title: room.name, text: shareText(room) });
              else {
                await navigator.clipboard.writeText(linkFor(room));
                toast("Link copied.");
              }
            } catch {
              /* share sheet closed */
            }
          }),
        ),
        h("span", { class: "link-url" }, linkFor(room)),
      );
    } else if (room.status === "expired") {
      parts.push(
        h(
          "p",
          { class: "muted", style: "margin:6px 0 0" },
          "This link expired after 90 days with no activity. Renew it to open it again.",
        ),
        act("Renew link for 90 days", "primary", () =>
          run(() => rpc("jr_renew", { p_room_id: room.id }), "Link renewed."),
        ),
      );
    } else {
      parts.push(
        h(
          "p",
          { class: "muted", style: "margin:6px 0 0" },
          "The link is off. Nobody can open this room until you turn it back on.",
        ),
        act("Turn link back on", "primary", () =>
          run(
            () => rpc("jr_set_link_enabled", { p_room_id: room.id, p_enabled: true }),
            "Link is on.",
          ),
        ),
      );
    }
    parts.push(
      h(
        "details",
        {},
        h("summary", {}, "Link settings"),
        room.status === "ok"
          ? act("Turn link off", "secondary danger", () => {
              if (
                confirm("Turn this link off? Nobody can open the room until you turn it back on.")
              )
                run(
                  () => rpc("jr_set_link_enabled", { p_room_id: room.id, p_enabled: false }),
                  "Link is off.",
                );
            })
          : null,
        act("Make a new link", "secondary", () => {
          if (
            confirm(
              "Make a new link? The old link stops working right away, so you'll need to send the new one.",
            )
          )
            run(
              () => rpc("jr_new_link", { p_room_id: room.id }),
              "New link ready. Send it to your customer.",
            );
        }),
      ),
    );
    box.replaceChildren(h("div", { class: "card link-box" }, ...parts));
  }

  async function deleteMessage(m) {
    if (
      !confirm(
        m.photo_type
          ? "Delete this photo? This can't be undone."
          : "Delete this message? This can't be undone.",
      )
    )
      return;
    try {
      await fn("owner_delete", { message_id: m.id });
      toast("Deleted.");
    } catch (e) {
      toast(e.message);
    }
    refreshRoom();
  }

  // ---------- wire up ----------
  function init() {
    $("newRoomBtn").addEventListener("click", newRoomForm);
    $("roomBack").addEventListener("click", closeRoom);

    const form = UI.composer();
    $("roomComposerSlot").append(form);
    UI.wireComposer(form, {
      send: async (body) => {
        await rpc("jr_owner_post", { p_room_id: state.open.id, p_body: body });
        await refreshRoom();
      },
      photo: (file) =>
        UI.uploadPhoto(
          file,
          (info) => fn("owner_photo_start", { room_id: state.open.id, ...info }),
          (message_id) => fn("owner_photo_done", { message_id }),
        ),
      refresh: () => refreshRoom(),
    });

    window.addEventListener("hashchange", () => {
      const m = location.hash.match(/^#room-([0-9a-f-]{36})$/);
      if (m) {
        if (!state.open || state.open.id !== m[1]) openRoom(m[1]);
      } else if (state.open) closeRoom();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      if (state.open) refreshRoom();
      else loadRooms();
    });
    $("refreshBtn").addEventListener("click", () => (state.open ? refreshRoom() : loadRooms()));

    // Load once the owner is signed in and the main screen is showing.
    const main = $("main");
    const kick = () => {
      if (!main.hidden && accessToken()) loadRooms();
    };
    new MutationObserver(kick).observe(main, { attributes: true, attributeFilter: ["hidden"] });
    setTimeout(kick, 800);
  }

  init();
})();

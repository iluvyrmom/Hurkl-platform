/* HURKL Job Rooms — chat + photo UI shared by the owner app (app.js) and the guest page (room.js).
 * Everything from the server is rendered with textContent / attributes (never innerHTML).
 * Photos arrive as short-lived signed links; they are never public. */
(function () {
  "use strict";

  const MAX_BYTES = 10 * 1024 * 1024;
  const TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif"];

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat())
      if (kid !== null && kid !== undefined && kid !== false)
        el.append(kid instanceof Node ? kid : String(kid));
    return el;
  }

  function when(iso) {
    const d = new Date(iso);
    const today = new Date();
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (d.toDateString() === today.toDateString()) return time;
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
  }

  /** The photo type we'll send, or null if it isn't an allowed photo. */
  function photoType(file) {
    const t = String(file.type || "").toLowerCase();
    if (t === "image/jpg") return "image/jpeg";
    if (TYPES.includes(t)) return t;
    if (!t || t === "application/octet-stream") {
      const n = String(file.name || "").toLowerCase();
      if (/\.jpe?g$/.test(n)) return "image/jpeg";
      if (/\.png$/.test(n)) return "image/png";
      if (/\.heic$/.test(n)) return "image/heic";
      if (/\.heif$/.test(n)) return "image/heif";
    }
    return null;
  }

  /** Checks a picked file before uploading. Returns an error message or null. */
  function checkPhoto(file) {
    if (!photoType(file)) return "Photos only: JPG, PNG, or HEIC.";
    if (file.size > MAX_BYTES) return "That photo is over 10 MB. Try a smaller one.";
    if (file.size === 0) return "That file is empty.";
    return null;
  }

  /**
   * Uploads one photo: ask the server for a one-time upload link, send the file
   * straight to private storage, then ask the server to check it and post it.
   */
  async function uploadPhoto(file, start, done) {
    const problem = checkPhoto(file);
    if (problem) throw new Error(problem);
    const type = photoType(file);
    const s = await start({ type, size: file.size, name: file.name });
    const put = await fetch(s.upload_url, {
      method: "PUT",
      headers: {
        "content-type": s.type || type,
        "x-upsert": "false",
        "cache-control": "max-age=3600",
      },
      body: file,
    });
    if (!put.ok)
      throw new Error(
        put.status === 413
          ? "That photo is over 10 MB. Try a smaller one."
          : "The photo didn't upload. Check your signal and try again.",
      );
    await done(s.message_id);
  }

  function photoEl(m) {
    if (!m.photo_url) return h("p", { class: "msg-note" }, "Photo is loading… pull to refresh.");
    const link = h("a", {
      href: m.photo_url,
      target: "_blank",
      rel: "noopener noreferrer",
      class: "msg-photo-link",
      "aria-label": "Open photo full size",
    });
    const img = h("img", {
      src: m.photo_url,
      alt: `Photo from ${m.author_name || "someone"}`,
      class: "msg-photo",
      loading: "lazy",
      referrerpolicy: "no-referrer",
    });
    // Some Android browsers can't show iPhone HEIC photos inline. Offer the file instead.
    img.addEventListener("error", () =>
      link.replaceChildren(h("span", { class: "msg-photo-fallback" }, "📷 Photo (tap to open)")),
    );
    link.append(img);
    return link;
  }

  /**
   * Draws the message list. opts.viewer = "owner" | "guest".
   * opts.onDelete(message) adds a Delete button to every message (owner only).
   */
  function renderMessages(box, messages, opts) {
    // The element that actually scrolls (the room panel for owners, the page for guests).
    const sc = opts.scroller || document.scrollingElement || document.documentElement;
    const nearBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 160;
    const first = !box.dataset.drawn;
    box.replaceChildren();
    if (!messages.length) {
      box.append(
        h(
          "p",
          { class: "empty" },
          opts.viewer === "owner"
            ? "No messages yet. Share the link, then photos and messages from your customer show up here."
            : "No messages yet. Say hello or add a photo below.",
        ),
      );
    }
    for (const m of messages) {
      const mine = opts.viewer === "owner" ? m.author_kind === "owner" : m.mine;
      const who =
        opts.viewer === "owner" && m.author_kind === "owner" ? "You" : mine ? "You" : m.author_name;
      box.append(
        h(
          "div",
          { class: `msg ${mine ? "mine" : "theirs"}` },
          h("div", { class: "msg-who" }, who || ""),
          m.photo_type ? photoEl(m) : null,
          m.body ? h("p", { class: "msg-body" }, m.body) : null,
          h(
            "div",
            { class: "msg-foot" },
            h("span", {}, when(m.created_at)),
            opts.onDelete
              ? h(
                  "button",
                  { type: "button", class: "msg-delete", onclick: () => opts.onDelete(m) },
                  "Delete",
                )
              : null,
          ),
        ),
      );
    }
    box.dataset.drawn = "1";
    if (first || nearBottom) sc.scrollTop = sc.scrollHeight;
  }

  /** Wires a composer form: text box, Send, and Add photo. */
  function wireComposer(form, handlers) {
    const text = form.querySelector("textarea");
    const send = form.querySelector("[data-send]");
    const fileInput = form.querySelector("input[type=file]");
    const photoBtn = form.querySelector("[data-photo]");
    const err = form.querySelector("[data-error]");
    const busy = (on, label) => {
      send.disabled = on;
      photoBtn.disabled = on;
      if (label) photoBtn.textContent = label;
    };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = text.value.trim();
      err.textContent = "";
      if (!body) return;
      if (body.length > 2000) {
        err.textContent = "Messages can be up to 2,000 characters.";
        return;
      }
      busy(true);
      try {
        await handlers.send(body);
        text.value = "";
      } catch (ex) {
        err.textContent = ex.message || "Couldn't send. Try again.";
      } finally {
        busy(false);
      }
    });
    photoBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const files = Array.from(fileInput.files || []).slice(0, 10);
      fileInput.value = "";
      err.textContent = "";
      for (let i = 0; i < files.length; i++) {
        busy(true, files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : "Uploading…");
        try {
          await handlers.photo(files[i]);
        } catch (ex) {
          err.textContent = ex.message || "The photo didn't upload. Try again.";
          break;
        }
      }
      busy(false, "📷 Add photo");
      handlers.refresh();
    });
  }

  /** Composer markup (big buttons, phone-sized). */
  function composer() {
    return h(
      "form",
      { class: "composer", novalidate: true },
      h("label", { class: "sr-only", for: "jrText" }, "Message"),
      h("textarea", {
        id: "jrText",
        rows: 2,
        maxlength: 2000,
        placeholder: "Type a message…",
        class: "field",
      }),
      h(
        "div",
        { class: "composer-row" },
        h(
          "button",
          { type: "button", class: "secondary composer-photo", "data-photo": true },
          "📷 Add photo",
        ),
        h("button", { type: "submit", class: "primary composer-send", "data-send": true }, "Send"),
      ),
      h("input", {
        type: "file",
        accept: "image/jpeg,image/png,image/heic,image/heif,.heic,.heif",
        multiple: true,
        hidden: true,
      }),
      h("p", { class: "error", role: "alert", "data-error": true }),
    );
  }

  window.JobRoomUI = {
    h,
    when,
    checkPhoto,
    photoType,
    uploadPhoto,
    renderMessages,
    wireComposer,
    composer,
  };
})();

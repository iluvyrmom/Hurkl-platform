// HURKL — job-room: the only door into a Job Room for guests, and the photo
// handler for owners. Deployed with verify_jwt = false because guests have no
// account; every action authenticates itself:
//   * guest_* actions: the room's link token (+ the guest's device secret),
//     checked inside the database by the jr_guest_* functions.
//   * owner_* actions: the owner's signed-in session (Authorization header),
//     checked inside the database by the jr_owner_* functions (owner role,
//     add-on on, room belongs to their company).
// Photos are stored in a PRIVATE bucket and only ever leave as 15-minute
// signed URLs. Uploads go straight from the phone to storage using a one-time
// signed upload URL, then this function checks the real file contents before
// the photo becomes visible.
//
// POST { action, ... } -> JSON. See owner-app/README.md for the action list.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  contentMatches,
  declaredPhotoType,
  friendlyError,
  IpLimiter,
  isSecretShaped,
  isUuid,
  MAX_PHOTO_BYTES,
  PHOTO_BUCKET,
  publicMessage,
  type RoomMessage,
  SIGNED_URL_SECONDS,
  sniffPhotoType,
} from "./_shared/job_rooms_core.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 120 requests per 5 minutes per IP per instance (the database enforces the
// real per-guest and per-room limits).
const ipLimiter = new IpLimiter(120, 5 * 60 * 1000);

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS },
  });
}

function fail(err: unknown): Response {
  const f = friendlyError(err);
  if (f.code === "server_error") {
    console.error(
      JSON.stringify({
        msg: "job_room_error",
        error: String((err as Error)?.message ?? err).slice(0, 300),
      }),
    );
  }
  return reply(f.status, { error: f.code, message: f.message });
}

async function rpc<T>(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

async function signMessages(admin: SupabaseClient, messages: RoomMessage[]) {
  const paths = messages.map((m) => m.photo_path).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data, error } = await admin.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) throw new Error(`sign_failed: ${error.message}`);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }
  return messages.map((m) => publicMessage(m, signed));
}

async function startUpload(admin: SupabaseClient, path: string) {
  const { data, error } = await admin.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`upload_url_failed: ${error?.message}`);
  return data.signedUrl;
}

/** Checks the uploaded file really is the photo it claims to be. Removes it if not. */
async function verifyUpload(
  admin: SupabaseClient,
  path: string,
  declared: string,
): Promise<number> {
  const { data: blob, error } = await admin.storage.from(PHOTO_BUCKET).download(path);
  if (error || !blob) throw new Error("upload_not_found");
  const head = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
  const decl = declaredPhotoType(declared);
  const ok =
    blob.size > 0 &&
    blob.size <= MAX_PHOTO_BYTES &&
    decl &&
    contentMatches(decl, sniffPhotoType(head));
  if (!ok) {
    await admin.storage.from(PHOTO_BUCKET).remove([path]);
    throw new Error(blob.size > MAX_PHOTO_BYTES ? "photo_too_big" : "bad_photo_type");
  }
  return blob.size;
}

async function pendingMime(admin: SupabaseClient, messageId: string): Promise<string> {
  const { data } = await admin
    .from("job_room_messages")
    .select("photo_mime")
    .eq("id", messageId)
    .maybeSingle();
  return String(data?.photo_mime ?? "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!ipLimiter.allow(ip)) return fail("rate_limited");

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "bad_input" });
  }
  const action = String(body.action ?? "");

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // ---------------- guests (link token) ----------------
    if (action.startsWith("guest_")) {
      const token = body.token;
      if (!isSecretShaped(token)) throw new Error("not_found");
      const secret = isSecretShaped(body.secret) ? body.secret : null;

      if (action === "guest_open") {
        const room = await rpc<Record<string, unknown>>(admin, "jr_guest_open", {
          p_token: token,
          p_secret: secret,
        });
        const messages = Array.isArray(room.messages)
          ? await signMessages(admin, room.messages as RoomMessage[])
          : [];
        return reply(200, { ...room, room_id: undefined, messages });
      }
      if (action === "guest_join") {
        const res = await rpc<{ secret: string; name: string }>(admin, "jr_guest_join", {
          p_token: token,
          p_name: String(body.name ?? ""),
        });
        return reply(200, res);
      }
      if (!secret) throw new Error("name_needed");
      if (action === "guest_post") {
        await rpc(admin, "jr_guest_post", {
          p_token: token,
          p_secret: secret,
          p_body: String(body.body ?? ""),
        });
        return reply(200, { ok: true });
      }
      if (action === "guest_photo_start") {
        const mime = declaredPhotoType(body.type, body.name);
        if (!mime) throw new Error("bad_photo_type");
        const begun = await rpc<{ message_id: string; path: string }>(
          admin,
          "jr_guest_photo_begin",
          {
            p_token: token,
            p_secret: secret,
            p_mime: mime,
            p_bytes: Math.floor(Number(body.size) || 0),
          },
        );
        return reply(200, {
          message_id: begun.message_id,
          upload_url: await startUpload(admin, begun.path),
          type: mime,
        });
      }
      if (action === "guest_photo_done") {
        if (!isUuid(body.message_id)) throw new Error("upload_not_found");
        const path = await rpc<string>(admin, "jr_guest_pending_photo", {
          p_token: token,
          p_secret: secret,
          p_message_id: body.message_id,
        });
        try {
          const size = await verifyUpload(admin, path, await pendingMime(admin, body.message_id));
          await rpc(admin, "jr_photo_finish", { p_message_id: body.message_id, p_bytes: size });
        } catch (e) {
          await rpc(admin, "jr_photo_discard", { p_message_id: body.message_id }).catch(() => {});
          throw e;
        }
        return reply(200, { ok: true });
      }
      return reply(400, { error: "bad_input" });
    }

    // ---------------- owners (signed-in session) ----------------
    if (action.startsWith("owner_")) {
      const auth = req.headers.get("authorization") ?? "";
      if (!/^Bearer\s+\S+/.test(auth)) throw new Error("not_signed_in");
      // Acts as the owner: every jr_* call below runs with their identity, so the
      // database decides what they may touch.
      const asOwner = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: auth } },
        auth: { persistSession: false, autoRefreshToken: false },
      });

      if (action === "owner_messages") {
        if (!isUuid(body.room_id)) throw new Error("room_not_found");
        const res = await rpc<{ room: unknown; messages: RoomMessage[] }>(
          asOwner,
          "jr_owner_messages",
          { p_room_id: body.room_id },
        );
        return reply(200, {
          room: res.room,
          messages: await signMessages(admin, res.messages ?? []),
        });
      }
      if (action === "owner_photo_start") {
        if (!isUuid(body.room_id)) throw new Error("room_not_found");
        const mime = declaredPhotoType(body.type, body.name);
        if (!mime) throw new Error("bad_photo_type");
        const begun = await rpc<{ message_id: string; path: string }>(
          asOwner,
          "jr_owner_photo_begin",
          {
            p_room_id: body.room_id,
            p_mime: mime,
            p_bytes: Math.floor(Number(body.size) || 0),
          },
        );
        return reply(200, {
          message_id: begun.message_id,
          upload_url: await startUpload(admin, begun.path),
          type: mime,
        });
      }
      if (action === "owner_photo_done") {
        if (!isUuid(body.message_id)) throw new Error("upload_not_found");
        const path = await rpc<string>(asOwner, "jr_owner_pending_photo", {
          p_message_id: body.message_id,
        });
        try {
          const size = await verifyUpload(admin, path, await pendingMime(admin, body.message_id));
          await rpc(admin, "jr_photo_finish", { p_message_id: body.message_id, p_bytes: size });
        } catch (e) {
          await rpc(admin, "jr_photo_discard", { p_message_id: body.message_id }).catch(() => {});
          throw e;
        }
        return reply(200, { ok: true });
      }
      if (action === "owner_delete") {
        if (!isUuid(body.message_id)) throw new Error("message_not_found");
        const path = await rpc<string | null>(asOwner, "jr_delete_message", {
          p_message_id: body.message_id,
        });
        if (path) {
          const { error } = await admin.storage.from(PHOTO_BUCKET).remove([path]);
          if (error)
            console.error(JSON.stringify({ msg: "photo_remove_failed", error: error.message }));
        }
        return reply(200, { ok: true });
      }
      return reply(400, { error: "bad_input" });
    }

    return reply(400, { error: "bad_input" });
  } catch (e) {
    return fail(e);
  }
});

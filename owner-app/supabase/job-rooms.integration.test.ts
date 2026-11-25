/**
 * Job Rooms — proves the database rules in
 * owner-app/supabase/migrations/20261125100000_job_rooms.sql against a real,
 * local, disposable Postgres (same harness as lib/db/*.integration.test.ts):
 * add-on switch, owner-only access, company isolation, guest access by link
 * only, link off / 90-day expiry, rate limits, delete, and notification
 * throttling.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyTestSchema } from "../../lib/db/test-support/apply-schema";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/hurkl_test";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(
  path.join(here, "migrations", "20261125100000_job_rooms.sql"),
  "utf8",
);

const COMPANY_A = "00000000-0000-0000-0000-00000000000a";
const COMPANY_B = "00000000-0000-0000-0000-00000000000b";
const OWNER_A = "00000000-0000-0000-0000-0000000000a1";
const EMPLOYEE_A = "00000000-0000-0000-0000-0000000000a2";
const OWNER_B = "00000000-0000-0000-0000-0000000000b1";

let client: Client;

type Role = "authenticated" | "anon" | "service_role";

/** Runs fn inside a transaction as the given role/user, then rolls back. */
async function as<T>(role: Role, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  await client.query(`set local role ${role}`);
  if (userId) {
    await client.query("select set_config('app.test_current_user_id', $1, true)", [userId]);
  }
  try {
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

/** Same, but commits (for setup steps later tests depend on). */
async function asCommit<T>(role: Role, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  await client.query(`set local role ${role}`);
  if (userId) {
    await client.query("select set_config('app.test_current_user_id', $1, true)", [userId]);
  }
  try {
    const out = await fn();
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}

async function one<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await client.query(sql, params);
  return Object.values(rows[0])[0] as T;
}

async function setAddon(companyId: string, on: boolean) {
  await client.query("update public.companies set job_rooms_addon = $2 where id = $1", [
    companyId,
    on,
  ]);
}

async function createRoom(
  owner: string,
  name: string,
): Promise<{ id: string; link_token: string }> {
  return asCommit("authenticated", owner, () => one("select public.jr_create_room($1)", [name]));
}

async function joinGuest(token: string, name: string): Promise<string> {
  const res = await asCommit("service_role", null, () =>
    one<{ secret: string }>("select public.jr_guest_join($1, $2)", [token, name]),
  );
  return res.secret;
}

beforeAll(async () => {
  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  await applyTestSchema(client);
  await client.query(MIGRATION);
  await client.query(
    "insert into public.companies (id, name) values ($1, 'Company A'), ($2, 'Company B')",
    [COMPANY_A, COMPANY_B],
  );
  await client.query("insert into auth.users (id) values ($1), ($2), ($3)", [
    OWNER_A,
    EMPLOYEE_A,
    OWNER_B,
  ]);
  await client.query(
    `insert into public.profiles (id, company_id, role) values
       ($1, $2, 'owner'), ($3, $2, 'employee'), ($4, $5, 'owner')`,
    [OWNER_A, COMPANY_A, EMPLOYEE_A, OWNER_B, COMPANY_B],
  );
});

afterAll(async () => {
  await client?.end();
});

describe("add-on switch", () => {
  it("is off for every company by default, and blocks the owner functions", async () => {
    const addon = await one("select job_rooms_addon from public.companies where id = $1", [
      COMPANY_A,
    ]);
    expect(addon).toBe(false);
    await expect(
      as("authenticated", OWNER_A, () => one("select public.jr_create_room('Kitchen')")),
    ).rejects.toThrow(/job_rooms_off/);
  });

  it("cannot be turned on by an owner through a table write", async () => {
    await as("authenticated", OWNER_A, async () => {
      const res = await client.query(
        "update public.companies set job_rooms_addon = true where id = $1",
        [COMPANY_A],
      );
      expect(res.rowCount).toBe(0); // companies has no UPDATE policy
    });
  });
});

describe("owner access", () => {
  let room: { id: string; link_token: string };

  beforeAll(async () => {
    await setAddon(COMPANY_A, true);
    await setAddon(COMPANY_B, true);
    room = await createRoom(OWNER_A, "  Smith kitchen remodel  ");
  });

  it("creates a room with a long, random link", async () => {
    expect(room.link_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const other = await createRoom(OWNER_A, "Second job");
    expect(other.link_token).not.toBe(room.link_token);
    const rooms = await as("authenticated", OWNER_A, () =>
      one<{ name: string; status: string }[]>("select public.jr_owner_rooms()"),
    );
    expect(rooms.map((r) => r.name)).toContain("Smith kitchen remodel");
    expect(rooms.every((r) => r.status === "ok")).toBe(true);
  });

  it("is owner-only: an employee of the same company is refused", async () => {
    await expect(
      as("authenticated", EMPLOYEE_A, () => one("select public.jr_create_room('Nope')")),
    ).rejects.toThrow(/owner_only/);
    await expect(
      as("authenticated", EMPLOYEE_A, () => one("select public.jr_owner_rooms()")),
    ).rejects.toThrow(/owner_only/);
    await as("authenticated", EMPLOYEE_A, async () => {
      const { rows } = await client.query("select id from public.job_rooms");
      expect(rows).toHaveLength(0);
    });
  });

  it("keeps companies apart: Company B's owner cannot see or touch Company A's room", async () => {
    const rooms = await as("authenticated", OWNER_B, () =>
      one<unknown[]>("select public.jr_owner_rooms()"),
    );
    expect(rooms).toEqual([]);
    await as("authenticated", OWNER_B, async () => {
      const { rows } = await client.query("select id from public.job_rooms");
      expect(rows).toHaveLength(0);
    });
    for (const sql of [
      "select public.jr_owner_messages($1)",
      "select public.jr_owner_post($1, 'hi')",
      "select public.jr_new_link($1)",
      "select public.jr_set_link_enabled($1, false)",
      "select public.jr_renew($1)",
    ]) {
      await expect(as("authenticated", OWNER_B, () => one(sql, [room.id]))).rejects.toThrow(
        /room_not_found/,
      );
    }
  });

  it("owners cannot write the tables directly", async () => {
    await as("authenticated", OWNER_A, async () => {
      await expect(
        client.query(
          "insert into public.job_rooms (company_id, name, link_token) values ($1, 'x', repeat('a', 43))",
          [COMPANY_A],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });
});

describe("guest access", () => {
  let room: { id: string; link_token: string };
  let secret: string;

  beforeAll(async () => {
    await setAddon(COMPANY_A, true);
    room = await createRoom(OWNER_A, "Guest test room");
    secret = await joinGuest(room.link_token, "  Sarah   Smith ");
  });

  it("signed-out and signed-in browsers cannot call the guest functions directly", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(
        as(role, role === "authenticated" ? OWNER_A : null, () =>
          one("select public.jr_guest_open($1, null)", [room.link_token]),
        ),
      ).rejects.toThrow(/permission denied/);
    }
    await expect(
      as("anon", null, () => client.query("select * from public.job_room_messages")),
    ).rejects.toThrow(/permission denied/);
  });

  it("opens only the one room the link belongs to, and asks for a name first", async () => {
    const before = await as("service_role", null, () =>
      one<Record<string, unknown>>("select public.jr_guest_open($1, null)", [room.link_token]),
    );
    expect(before.status).toBe("ok");
    expect(before.room_name).toBe("Guest test room");
    expect(before.company_name).toBe("Company A");
    expect(before.guest_name).toBeNull();
    expect(before.messages).toEqual([]);

    const after = await as("service_role", null, () =>
      one<Record<string, unknown>>("select public.jr_guest_open($1, $2)", [
        room.link_token,
        secret,
      ]),
    );
    expect(after.guest_name).toBe("Sarah Smith");
    // Nothing else about the company leaks: only these keys.
    expect(Object.keys(after).sort()).toEqual(
      ["company_name", "guest_name", "messages", "room_id", "room_name", "status"].sort(),
    );
  });

  it("rejects wrong or guessed links", async () => {
    const res = await as("service_role", null, () =>
      one<{ status: string }>("select public.jr_guest_open($1, null)", ["x".repeat(43)]),
    );
    expect(res.status).toBe("not_found");
    await expect(
      as("service_role", null, () =>
        one("select public.jr_guest_post($1, $2, 'hi')", ["short", secret]),
      ),
    ).rejects.toThrow(/not_found/);
  });

  it("a guest from one room cannot post in another room", async () => {
    const other = await createRoom(OWNER_A, "Other room");
    await expect(
      as("service_role", null, () =>
        one("select public.jr_guest_post($1, $2, 'hello')", [other.link_token, secret]),
      ),
    ).rejects.toThrow(/name_needed/);
  });

  it("guest and owner messages show up for both sides with names", async () => {
    await asCommit("service_role", null, () =>
      one("select public.jr_guest_post($1, $2, 'Here is the kitchen')", [room.link_token, secret]),
    );
    await asCommit("authenticated", OWNER_A, () =>
      one("select public.jr_owner_post($1, 'Thanks, got it')", [room.id]),
    );
    const owner = await as("authenticated", OWNER_A, () =>
      one<{ messages: { author_name: string; body: string; author_kind: string }[] }>(
        "select public.jr_owner_messages($1)",
        [room.id],
      ),
    );
    expect(owner.messages.map((m) => [m.author_kind, m.author_name, m.body])).toEqual([
      ["guest", "Sarah Smith", "Here is the kitchen"],
      ["owner", "Company A", "Thanks, got it"],
    ]);
    const guest = await as("service_role", null, () =>
      one<{ messages: { mine: boolean }[] }>("select public.jr_guest_open($1, $2)", [
        room.link_token,
        secret,
      ]),
    );
    expect(guest.messages.map((m) => m.mine)).toEqual([true, false]);
  });

  it("only sends one owner alert per room every 10 minutes", async () => {
    const first = await one<string>("select last_notified_at from public.job_rooms where id = $1", [
      room.id,
    ]);
    expect(first).not.toBeNull();
    await asCommit("service_role", null, () =>
      one("select public.jr_guest_post($1, $2, 'one more')", [room.link_token, secret]),
    );
    const second = await one<string>(
      "select last_notified_at from public.job_rooms where id = $1",
      [room.id],
    );
    expect(second).toEqual(first);
  });

  it("photos: only JPG/PNG/HEIC up to 10 MB, hidden until the upload is checked", async () => {
    const bad = [
      ["image/gif", 1000],
      ["application/pdf", 1000],
      ["image/jpeg", 10485761],
      ["image/jpeg", 0],
    ] as const;
    for (const [mime, bytes] of bad) {
      await expect(
        as("service_role", null, () =>
          one("select public.jr_guest_photo_begin($1, $2, $3, $4)", [
            room.link_token,
            secret,
            mime,
            bytes,
          ]),
        ),
      ).rejects.toThrow(/bad_photo_type|photo_too_big/);
    }

    const begun = await asCommit("service_role", null, () =>
      one<{ message_id: string; path: string }>(
        "select public.jr_guest_photo_begin($1, $2, 'image/heic', 2000000)",
        [room.link_token, secret],
      ),
    );
    expect(begun.path).toBe(`${COMPANY_A}/${room.id}/${begun.message_id}`);

    const pendingPath = await as("service_role", null, () =>
      one("select public.jr_guest_pending_photo($1, $2, $3)", [
        room.link_token,
        secret,
        begun.message_id,
      ]),
    );
    expect(pendingPath).toBe(begun.path);

    const countVisible = async () =>
      (
        await as("authenticated", OWNER_A, () =>
          one<{ messages: unknown[] }>("select public.jr_owner_messages($1)", [room.id]),
        )
      ).messages.length;
    const beforeFinish = await countVisible();
    await asCommit("service_role", null, () =>
      one("select public.jr_photo_finish($1, 1999999)", [begun.message_id]),
    );
    expect(await countVisible()).toBe(beforeFinish + 1);
  });

  it("owner can delete any message or photo and gets the file path back to remove it", async () => {
    const msgs = await as("authenticated", OWNER_A, () =>
      one<{ messages: { id: string; photo_path: string | null }[] }>(
        "select public.jr_owner_messages($1)",
        [room.id],
      ),
    );
    const photo = msgs.messages.find((m) => m.photo_path)!;
    const returned = await asCommit("authenticated", OWNER_A, () =>
      one("select public.jr_delete_message($1)", [photo.id]),
    );
    expect(returned).toBe(photo.photo_path);
    const after = await as("authenticated", OWNER_A, () =>
      one<{ messages: { id: string }[] }>("select public.jr_owner_messages($1)", [room.id]),
    );
    expect(after.messages.find((m) => m.id === photo.id)).toBeUndefined();
    // Another company's owner cannot delete Company A's messages.
    await setAddon(COMPANY_B, true);
    await expect(
      as("authenticated", OWNER_B, () =>
        one("select public.jr_delete_message($1)", [after.messages[0].id]),
      ),
    ).rejects.toThrow(/message_not_found/);
  });
});

describe("link off, expiry and add-on off", () => {
  it("owner can turn a link off; the guest is locked out until it's back on", async () => {
    await setAddon(COMPANY_A, true);
    const room = await createRoom(OWNER_A, "Switchable");
    const secret = await joinGuest(room.link_token, "Pat");
    await asCommit("authenticated", OWNER_A, () =>
      one("select public.jr_set_link_enabled($1, false)", [room.id]),
    );
    const open = await as("service_role", null, () =>
      one<{ status: string; room_name?: string }>("select public.jr_guest_open($1, $2)", [
        room.link_token,
        secret,
      ]),
    );
    expect(open.status).toBe("off");
    expect(open.room_name).toBeUndefined();
    await expect(
      as("service_role", null, () =>
        one("select public.jr_guest_post($1, $2, 'hi')", [room.link_token, secret]),
      ),
    ).rejects.toThrow(/link_unavailable/);
    await asCommit("authenticated", OWNER_A, () =>
      one("select public.jr_set_link_enabled($1, true)", [room.id]),
    );
    const reopened = await as("service_role", null, () =>
      one<{ status: string }>("select public.jr_guest_open($1, $2)", [room.link_token, secret]),
    );
    expect(reopened.status).toBe("ok");
  });

  it("a new link replaces the old one", async () => {
    const room = await createRoom(OWNER_A, "Rotate");
    const fresh = await asCommit("authenticated", OWNER_A, () =>
      one<string>("select public.jr_new_link($1)", [room.id]),
    );
    expect(fresh).not.toBe(room.link_token);
    const old = await as("service_role", null, () =>
      one<{ status: string }>("select public.jr_guest_open($1, null)", [room.link_token]),
    );
    expect(old.status).toBe("not_found");
  });

  it("expires after 90 days without activity; the owner can renew it", async () => {
    const room = await createRoom(OWNER_A, "Old job");
    await client.query(
      "update public.job_rooms set last_activity_at = now() - interval '91 days' where id = $1",
      [room.id],
    );
    const expired = await as("service_role", null, () =>
      one<{ status: string }>("select public.jr_guest_open($1, null)", [room.link_token]),
    );
    expect(expired.status).toBe("expired");
    await asCommit("authenticated", OWNER_A, () => one("select public.jr_renew($1)", [room.id]));
    const renewed = await as("service_role", null, () =>
      one<{ status: string }>("select public.jr_guest_open($1, null)", [room.link_token]),
    );
    expect(renewed.status).toBe("ok");
  });

  it("turning the add-on off closes every link for that company", async () => {
    const room = await createRoom(OWNER_A, "Addon test");
    await setAddon(COMPANY_A, false);
    const res = await as("service_role", null, () =>
      one<{ status: string }>("select public.jr_guest_open($1, null)", [room.link_token]),
    );
    expect(res.status).toBe("off");
    await setAddon(COMPANY_A, true);
  });
});

describe("rate limits", () => {
  it("a guest can send at most 20 messages in 10 minutes", async () => {
    await setAddon(COMPANY_A, true);
    const room = await createRoom(OWNER_A, "Spam test");
    const secret = await joinGuest(room.link_token, "Spammer");
    await as("service_role", null, async () => {
      for (let i = 0; i < 20; i++) {
        await client.query("select public.jr_guest_post($1, $2, $3)", [
          room.link_token,
          secret,
          `msg ${i}`,
        ]);
      }
      await expect(
        client.query("select public.jr_guest_post($1, $2, 'one too many')", [
          room.link_token,
          secret,
        ]),
      ).rejects.toThrow(/rate_limited/);
    });
  });

  it("a guest can start at most 15 photo uploads an hour", async () => {
    const room = await createRoom(OWNER_A, "Photo spam test");
    const secret = await joinGuest(room.link_token, "Uploader");
    await as("service_role", null, async () => {
      for (let i = 0; i < 15; i++) {
        await client.query("select public.jr_guest_photo_begin($1, $2, 'image/jpeg', 5000)", [
          room.link_token,
          secret,
        ]);
      }
      await expect(
        client.query("select public.jr_guest_photo_begin($1, $2, 'image/jpeg', 5000)", [
          room.link_token,
          secret,
        ]),
      ).rejects.toThrow(/rate_limited/);
    });
  });

  it("at most 20 new guest names per room per day", async () => {
    const room = await createRoom(OWNER_A, "Join spam test");
    await as("service_role", null, async () => {
      for (let i = 0; i < 20; i++) {
        await client.query("select public.jr_guest_join($1, $2)", [room.link_token, `G${i}`]);
      }
      await expect(
        client.query("select public.jr_guest_join($1, 'G21')", [room.link_token]),
      ).rejects.toThrow(/rate_limited/);
    });
  });

  it("rejects empty or overly long names and messages", async () => {
    const room = await createRoom(OWNER_A, "Validation");
    await expect(
      as("service_role", null, () =>
        one("select public.jr_guest_join($1, '   ')", [room.link_token]),
      ),
    ).rejects.toThrow(/bad_name/);
    const secret = await joinGuest(room.link_token, "Val");
    await expect(
      as("service_role", null, () =>
        one("select public.jr_guest_post($1, $2, $3)", [room.link_token, secret, "x".repeat(2001)]),
      ),
    ).rejects.toThrow(/bad_message/);
    await expect(
      as("authenticated", OWNER_A, () => one("select public.jr_create_room($1)", ["x".repeat(81)])),
    ).rejects.toThrow(/bad_name/);
  });
});

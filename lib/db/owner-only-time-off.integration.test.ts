/**
 * Founder decision (Session 013): only the owner sees customer information
 * and changes the company calendar; employees can only ask for days off or
 * take their own request back. Runs the real migration
 * 00000000000012_owner_only_and_time_off.sql against a disposable Postgres.
 *
 * company_calendar_blocks and booking_reservations were created on the live
 * database by migrations that are not in this repository yet, so minimal
 * stand-ins carrying the SAME original policies are created here first.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyTestSchema } from "./test-support/apply-schema";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/hurkl_test";

const CO_A = "00000000-0000-0000-0000-00000000000a";
const CO_B = "00000000-0000-0000-0000-00000000000b";
const OWNER = "00000000-0000-0000-0000-0000000000a1";
const EMP1 = "00000000-0000-0000-0000-0000000000a2";
const EMP2 = "00000000-0000-0000-0000-0000000000a3";
const MGR = "00000000-0000-0000-0000-0000000000a4";
const OTHER_OWNER = "00000000-0000-0000-0000-0000000000b1";
const ADMIN = "00000000-0000-0000-0000-0000000000ad";

let client: Client;

async function asUser<T>(userId: string, fn: (c: Client) => Promise<T>): Promise<T> {
  await client.query("begin");
  await client.query("set local role authenticated");
  await client.query("select set_config('app.test_current_user_id', $1, true)", [userId]);
  try {
    return await fn(client);
  } finally {
    await client.query("rollback");
  }
}

beforeAll(async () => {
  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  await applyTestSchema(client);

  // Stand-ins for live tables whose migrations are not in this repo yet,
  // with the original (pre-lock-down) staff policies.
  await client.query(`
    create table public.company_calendar_blocks (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null references public.companies(id) on delete cascade,
      service_date date not null,
      status text not null check (status in ('limited','unavailable')),
      reason text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (company_id, service_date)
    );
    alter table public.company_calendar_blocks enable row level security;
    create policy company_calendar_blocks_select_own_company on public.company_calendar_blocks
      for select using (company_id = public.current_company_id() or public.is_hurkl_admin());
    create policy company_calendar_blocks_insert_staff on public.company_calendar_blocks
      for insert with check (company_id = public.current_company_id()
        and "current_role"() = any (array['owner','manager','employee']::user_role[]));
    create policy company_calendar_blocks_update_staff on public.company_calendar_blocks
      for update using (company_id = public.current_company_id()
        and "current_role"() = any (array['owner','manager','employee']::user_role[]));
    create policy company_calendar_blocks_delete_staff on public.company_calendar_blocks
      for delete using (company_id = public.current_company_id()
        and "current_role"() = any (array['owner','manager','employee']::user_role[]));

    create table public.booking_reservations (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null references public.companies(id) on delete cascade,
      status text not null default 'paid'
    );
    alter table public.booking_reservations enable row level security;
    create policy booking_reservations_select_own_company on public.booking_reservations
      for select using (company_id = public.current_company_id() or public.is_hurkl_admin());

    grant select, insert, update, delete on all tables in schema public to authenticated;
  `);

  const here = path.dirname(fileURLToPath(import.meta.url));
  const migration = readFileSync(
    path.join(
      here,
      "..",
      "..",
      "supabase",
      "migrations",
      "00000000000012_owner_only_and_time_off.sql",
    ),
    "utf8",
  );
  await client.query(migration);
  // The migration's own grants run first; re-grant the new table like the live project does.
  await client.query(
    "grant select, insert, update, delete on all tables in schema public to authenticated",
  );
  await client.query("revoke update on public.profiles from authenticated");
  await client.query("grant update (full_name) on public.profiles to authenticated");

  await client.query("insert into public.companies (id, name) values ($1,'A'), ($2,'B')", [
    CO_A,
    CO_B,
  ]);
  await client.query("insert into auth.users (id) values ($1),($2),($3),($4),($5),($6)", [
    OWNER,
    EMP1,
    EMP2,
    MGR,
    OTHER_OWNER,
    ADMIN,
  ]);
  await client.query(
    `insert into public.profiles (id, company_id, role) values
      ($1,$7,'owner'), ($2,$7,'employee'), ($3,$7,'employee'), ($4,$7,'manager'),
      ($5,$8,'owner'), ($6,null,'hurkl_admin')`,
    [OWNER, EMP1, EMP2, MGR, OTHER_OWNER, ADMIN, CO_A, CO_B],
  );
  await client.query(
    "insert into public.leads (company_id, name) values ($1,'Secret A'), ($2,'Secret B')",
    [CO_A, CO_B],
  );
  await client.query("insert into public.customers (company_id, name) values ($1,'Cust A')", [
    CO_A,
  ]);
  await client.query("insert into public.booking_reservations (company_id) values ($1)", [CO_A]);
  await client.query(
    "insert into public.company_calendar_blocks (company_id, service_date, status, reason) values ($1,'2099-03-01','unavailable','private note')",
    [CO_A],
  );
});

afterAll(async () => {
  await client.end();
});

describe("customer information is owner-only", () => {
  it("the owner sees their own company's leads, customers and bookings only", async () => {
    await asUser(OWNER, async (c) => {
      expect((await c.query("select name from public.leads")).rows).toEqual([{ name: "Secret A" }]);
      expect((await c.query("select * from public.customers")).rowCount).toBe(1);
      expect((await c.query("select * from public.booking_reservations")).rowCount).toBe(1);
    });
  });

  it.each([
    ["employee", EMP1],
    ["manager", MGR],
  ])("a %s sees no leads, customers, bookings, conversations or messages", async (_name, id) => {
    await asUser(id, async (c) => {
      for (const table of [
        "leads",
        "customers",
        "booking_reservations",
        "conversations",
        "messages",
        "owner_escalations",
        "audit_log",
      ]) {
        const r = await c.query(`select 1 from public.${table}`);
        expect(r.rowCount, table).toBe(0);
      }
    });
  });

  it("an employee cannot edit leads or customers", async () => {
    await asUser(EMP1, async (c) => {
      expect((await c.query("update public.leads set name='X'")).rowCount).toBe(0);
      expect((await c.query("update public.customers set name='X'")).rowCount).toBe(0);
    });
  });

  it("a HURKL admin can still see customer data", async () => {
    await asUser(ADMIN, async (c) => {
      expect((await c.query("select 1 from public.leads")).rowCount).toBe(2);
    });
  });
});

describe("nobody can promote themselves", () => {
  it("an employee cannot change their own role or company", async () => {
    await asUser(EMP1, async (c) => {
      await expect(
        c.query("update public.profiles set role='owner' where id=$1", [EMP1]),
      ).rejects.toThrow(/permission denied/i);
    });
    await asUser(EMP1, async (c) => {
      await expect(
        c.query("update public.profiles set company_id=$1 where id=$2", [CO_B, EMP1]),
      ).rejects.toThrow(/permission denied/i);
    });
  });
  it("a person can still edit their own name", async () => {
    await asUser(EMP1, async (c) => {
      const r = await c.query("update public.profiles set full_name='Sam' where id=$1", [EMP1]);
      expect(r.rowCount).toBe(1);
    });
  });
});

describe("company calendar: staff see it, only the owner changes it", () => {
  it("an employee can see blocked days", async () => {
    await asUser(EMP1, async (c) => {
      expect((await c.query("select 1 from public.company_calendar_blocks")).rowCount).toBe(1);
    });
  });
  it("an employee cannot block, change or open a day", async () => {
    await asUser(EMP1, async (c) => {
      await expect(
        c.query(
          "insert into public.company_calendar_blocks (company_id, service_date, status) values ($1,'2099-04-01','unavailable')",
          [CO_A],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
    await asUser(EMP1, async (c) => {
      expect(
        (await c.query("update public.company_calendar_blocks set status='limited'")).rowCount,
      ).toBe(0);
      expect((await c.query("delete from public.company_calendar_blocks")).rowCount).toBe(0);
    });
  });
  it("the owner can block and open days", async () => {
    await asUser(OWNER, async (c) => {
      const ins = await c.query(
        "insert into public.company_calendar_blocks (company_id, service_date, status) values ($1,'2099-04-01','limited')",
        [CO_A],
      );
      expect(ins.rowCount).toBe(1);
      expect(
        (
          await c.query(
            "delete from public.company_calendar_blocks where service_date='2099-03-01'",
          )
        ).rowCount,
      ).toBe(1);
    });
  });
});

describe("days-off requests", () => {
  async function ask(c: Client, who: string, date: string) {
    return c.query(
      "insert into public.time_off_requests (company_id, profile_id, service_date) values ($1,$2,$3) returning id",
      [CO_A, who, date],
    );
  }

  it("an employee can ask for a day off and cancel it", async () => {
    await asUser(EMP1, async (c) => {
      const id = (await ask(c, EMP1, "2099-05-01")).rows[0].id;
      const cancel = await c.query(
        "update public.time_off_requests set status='cancelled' where id=$1 returning status",
        [id],
      );
      expect(cancel.rows[0].status).toBe("cancelled");
    });
  });
  it("an employee cannot ask on someone else's behalf", async () => {
    await asUser(EMP1, async (c) => {
      await expect(ask(c, EMP2, "2099-05-02")).rejects.toThrow(/row-level security/i);
    });
  });
  it("an employee cannot approve their own request, on insert or later", async () => {
    await asUser(EMP1, async (c) => {
      await expect(
        c.query(
          "insert into public.time_off_requests (company_id, profile_id, service_date, status) values ($1,$2,'2099-05-03','approved')",
          [CO_A, EMP1],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
    for (const sql of [
      "update public.time_off_requests set status='approved' where id=$1",
      "update public.time_off_requests set decided_by=$2 where id=$1",
    ]) {
      // Each attempt gets its own transaction (a failed statement aborts it).
      await asUser(EMP1, async (c) => {
        const id = (await ask(c, EMP1, "2099-05-04")).rows[0].id;
        const params = sql.includes("$2") ? [id, EMP1] : [id];
        await expect(c.query(sql, params)).rejects.toThrow(/row-level security/i);
      });
    }
  });
  it("employees cannot see or change each other's requests", async () => {
    await client.query(
      "insert into public.time_off_requests (id, company_id, profile_id, service_date) values ('00000000-0000-0000-0000-0000000000f1',$1,$2,'2099-06-01')",
      [CO_A, EMP2],
    );
    await asUser(EMP1, async (c) => {
      expect((await c.query("select 1 from public.time_off_requests")).rowCount).toBe(0);
      expect(
        (
          await c.query(
            "update public.time_off_requests set status='cancelled' where id='00000000-0000-0000-0000-0000000000f1'",
          )
        ).rowCount,
      ).toBe(0);
    });
  });
  it("the owner sees the whole company's requests and can approve or turn down", async () => {
    await asUser(OWNER, async (c) => {
      expect((await c.query("select 1 from public.time_off_requests")).rowCount).toBe(1);
      const r = await c.query(
        "update public.time_off_requests set status='approved', decided_by=$1, decided_at=now() where id='00000000-0000-0000-0000-0000000000f1' returning status",
        [OWNER],
      );
      expect(r.rows[0].status).toBe("approved");
    });
  });
  it("another company's owner sees none of it", async () => {
    await asUser(OTHER_OWNER, async (c) => {
      expect((await c.query("select 1 from public.time_off_requests")).rowCount).toBe(0);
    });
  });
});

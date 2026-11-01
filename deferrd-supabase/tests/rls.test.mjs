// Runs the DEFERRD migration in an in-process Postgres (PGlite) with a tiny stand-in
// for Supabase's auth, then checks who can see/do what. Usage: node tests/rls.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`);
for (const f of readdirSync(new URL('../migrations/', import.meta.url)).filter((x) => x.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
}
await db.exec(`grant all on all tables in schema public to service_role;
  grant execute on all functions in schema public to service_role;`);

const A='00000000-0000-0000-0000-00000000000a', B='00000000-0000-0000-0000-00000000000b',
      ADM='00000000-0000-0000-0000-0000000000ad', O1='00000000-0000-0000-0000-0000000000a1',
      O2='00000000-0000-0000-0000-0000000000a2';
const ORG1='11111111-1111-1111-1111-111111111111', ORG2='22222222-2222-2222-2222-222222222222';
await db.exec(`
  insert into auth.users(id,email) values ('${A}','a@x'),('${B}','b@x'),('${ADM}','adm@x'),('${O1}','o1@x'),('${O2}','o2@x');
  insert into profiles(id,email,role) values ('${A}','a@x','customer'),('${B}','b@x','customer'),('${ADM}','adm@x','admin'),
    ('${O1}','o1@x','customer'),('${O2}','o2@x','customer');
  insert into organizations(id,name) values ('${ORG1}','Company One'),('${ORG2}','Company Two');
  insert into organization_members(org_id,user_id,role) values ('${ORG1}','${O1}','owner'),('${ORG2}','${O2}','owner');
  insert into contacts(org_id,name,email) values ('${ORG1}',null,'c1@x'),('${ORG2}','Pat','c2@x');
  insert into campaigns(id,org_id,name) values ('33333333-3333-3333-3333-333333333333','${ORG1}','C1'),
    ('44444444-4444-4444-4444-444444444444','${ORG2}','C2');
  insert into campaign_recipients(campaign_id,org_id,contact_id)
    select '33333333-3333-3333-3333-333333333333', org_id, id from contacts where org_id='${ORG1}';
  insert into campaign_recipients(campaign_id,org_id,contact_id)
    select '44444444-4444-4444-4444-444444444444', org_id, id from contacts where org_id='${ORG2}';
  insert into gift_requests(customer_id,status) values ('${B}','Draft');
  insert into card_templates(name,category) values ('x','y');
`);

let pass = 0, fail = 0;
async function as(role, uid, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid||''}',false); set role ${role};`);
  try { const r = await db.query(sql); await db.exec('reset role'); return { ok:true, rows:r.rows, n:r.affectedRows ?? r.rows.length }; }
  catch (e) { await db.exec('reset role'); return { ok:false, err:e.message }; }
}
function check(name, cond, extra='') { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra); } }
const show = (r) => r.ok ? '' : r.err;

// --- customers
let r = await as('authenticated', A, `insert into gift_requests(customer_id) values ('${A}') returning id`);
check('customer can start a Draft request', r.ok, show(r));
const myGift = r.rows?.[0]?.id;
if (!myGift) { console.log('cannot continue without a first request'); process.exit(1); }
r = await as('authenticated', A, `select * from gift_requests`);
check('customer sees only own requests', r.ok && r.rows.length === 1 && r.rows[0].customer_id === A);
r = await as('authenticated', A, `insert into gift_requests(customer_id, status) values ('${A}','Paid — Monitoring Active')`);
check('customer cannot create a request already marked paid', !r.ok);
r = await as('authenticated', A, `insert into gift_requests(customer_id, total_due_today) values ('${A}', 0.01)`);
check('customer cannot set the total due', !r.ok);
r = await as('authenticated', A, `insert into gift_requests(customer_id) values ('${B}')`);
check('customer cannot create a request for someone else', !r.ok);
r = await as('authenticated', A, `update gift_requests set gift_message='Happy birthday' where id='${myGift}'`);
check('customer can edit message on own Draft', r.ok && r.n === 1);
r = await as('authenticated', A, `update gift_requests set payment_status='paid' where id='${myGift}'`);
check('customer cannot mark own request paid', !r.ok);
r = await as('authenticated', A, `update gift_requests set status='Delivered' where id='${myGift}'`);
check('customer cannot change status to Delivered', !r.ok);
r = await as('authenticated', A, `update gift_requests set service_fee=0 where id='${myGift}'`);
check('customer cannot change the service fee', !r.ok);
r = await as('authenticated', A, `update gift_requests set gift_message='hack' where customer_id='${B}'`);
check('customer cannot edit another customer request', r.ok && r.n === 0);
await db.exec(`update gift_requests set status='Paid — Monitoring Active', payment_status='paid' where id='${myGift}'`);
r = await as('authenticated', A, `update gift_requests set gift_message='late change' where id='${myGift}'`);
check('customer cannot edit after payment', r.ok ? r.n === 0 : true);
r = await as('authenticated', A, `delete from gift_requests where id='${myGift}'`);
check('customer cannot delete a paid request', r.ok && r.n === 0);
r = await as('authenticated', A, `update profiles set role='admin' where id='${A}'`);
check('customer cannot make themselves admin', !r.ok);
r = await as('authenticated', A, `select * from profiles`);
check('customer sees only own profile', r.ok && r.rows.length === 1);
for (const t of ['revenue_settings','transactions','ops_alerts','product_checks','stripe_events','organization_subscriptions']) {
  r = await as('authenticated', A, `select * from ${t}`);
  check(`customer cannot read ${t}`, !r.ok || r.rows.length === 0);
}
r = await as('authenticated', A, `select * from payments`);
check('customer sees no one else payments', r.ok && r.rows.length === 0);
r = await as('authenticated', A, `insert into organization_members(org_id,user_id,role) values ('${ORG1}','${A}','owner')`);
check('customer cannot add themselves to a company', !r.ok);
r = await as('authenticated', A, `select * from contacts`);
check('customer sees no company contacts', r.ok && r.rows.length === 0);
r = await as('authenticated', A, `select next_confirmation_number()`);
check('browser cannot call the confirmation-number function', !r.ok);

// --- anonymous
for (const t of ['gift_requests','contacts','campaign_recipients','card_templates','profiles']) {
  r = await as('anon', '', `select * from ${t}`);
  check(`anonymous cannot read ${t}`, !r.ok);
}

// --- companies
r = await as('authenticated', O1, `select * from contacts`);
check('company member sees only own contacts', r.ok && r.rows.length === 1 && r.rows[0].org_id === ORG1);
r = await as('authenticated', O1, `insert into contacts(org_id,email) values ('${ORG1}','new@x')`);
check('company member can add a contact with no name', r.ok);
r = await as('authenticated', O1, `insert into contacts(org_id,email) values ('${ORG2}','evil@x')`);
check('company member cannot add contacts to another company', !r.ok);
r = await as('authenticated', O1, `select * from campaigns`);
check('company member sees only own campaigns', r.ok && r.rows.length === 1 && r.rows[0].org_id === ORG1);
r = await as('authenticated', O1, `insert into campaigns(org_id,name,status) values ('${ORG1}','free','paid_ready_for_fulfillment')`);
check('company member cannot create campaigns directly (server only)', !r.ok);
r = await as('authenticated', O1, `update campaigns set status='completed' where id='33333333-3333-3333-3333-333333333333'`);
check('company member cannot change campaign status', !r.ok);
r = await as('authenticated', O1, `select card_token, org_id from campaign_recipients`);
check('company member sees only own recipients', r.ok && r.rows.length === 1 && r.rows[0].org_id === ORG1);
r = await as('authenticated', O1, `update campaign_recipients set gift_card_status='issued'`);
check('company member cannot mark gift cards issued', !r.ok);
r = await as('authenticated', O1, `select * from organizations`);
check('company member sees only own company', r.ok && r.rows.length === 1);
r = await as('authenticated', O1, `update organizations set owner_user_id='${O1}' where id='${ORG2}'`);
check('company member cannot edit another company', !r.ok || r.n === 0);
r = await as('authenticated', O1, `select * from campaign_charges`);
check('company member cannot see other company charges', r.ok && r.rows.length === 0);

// --- card templates + admin
r = await as('authenticated', A, `select * from card_templates`);
check('signed-in user can see card templates', r.ok && r.rows.length === 1);
r = await as('authenticated', A, `insert into card_templates(name,category) values ('mine','y')`);
check('customer cannot add card templates', !r.ok);
r = await as('authenticated', ADM, `select * from gift_requests`);
check('admin sees all requests', r.ok && r.rows.length >= 2);
r = await as('authenticated', ADM, `update gift_requests set status='Shipped', tracking_number='1Z' where id='${myGift}'`);
check('admin can update status and tracking', r.ok && r.n === 1);
r = await as('authenticated', ADM, `select * from revenue_settings`);
check('admin can read revenue settings', r.ok && r.rows.length === 1);
r = await as('authenticated', ADM, `insert into revenue_settings default values`);
check('only one revenue settings row allowed', !r.ok);

// --- data rules
r = await as('postgres', '', `select length(card_token) as n, count(distinct card_token) as d, count(*) as c from campaign_recipients group by 1`);
check('card tokens are 48 hex chars and unique', r.ok && r.rows.every(x => Number(x.n) === 48 && Number(x.d) === Number(x.c)), JSON.stringify(r.rows));
r = await as('postgres', '', `select confirmation_number from gift_requests`);
check('confirmation numbers made by the server and unique', r.ok && new Set(r.rows.map(x=>x.confirmation_number)).size === r.rows.length && r.rows.every(x=>/^DEF-/.test(x.confirmation_number)));
r = await as('service_role', '', `insert into stripe_events(id,type) values ('evt_1','x'),('evt_1','x')`);
check('same Stripe event cannot be recorded twice', !r.ok);
r = await as('service_role', '', `update gift_requests set status='Delivered', payment_status='paid' where id='${myGift}'`);
check('server (service role) can update protected fields', r.ok);

// --- checkout lock + Stripe event claims
await db.exec(`update gift_requests set status='Awaiting Payment', payment_status='pending', order_id='o1', total_due_today=10 where id='${myGift}'`);
r = await as('authenticated', A, `update gift_requests set original_product_price=0.01, gift_message='x' where id='${myGift}'`);
check('customer cannot change price once checkout has started', !r.ok || r.n === 0);
r = await as('authenticated', A, `update gift_requests set status='Draft' where id='${myGift}'`);
check('customer cannot reopen a request that is awaiting payment', !r.ok || r.n === 0);
r = await as('authenticated', A, `select claim_stripe_event('evt_x','checkout.session.completed')`);
check('browser cannot claim Stripe events', !r.ok);
r = await as('service_role', '', `select claim_stripe_event('evt_1','t') as c`);
check('first delivery of a Stripe event is claimed', r.ok && r.rows[0].c === true, show(r));
r = await as('service_role', '', `select claim_stripe_event('evt_1','t') as c`);
check('duplicate delivery while processing is refused', r.ok && r.rows[0].c === false);
await db.exec(`select finish_stripe_event('evt_1', true)`);
r = await as('service_role', '', `select claim_stripe_event('evt_1','t') as c`);
check('finished event is never processed again', r.ok && r.rows[0].c === false);
await db.exec(`select claim_stripe_event('evt_2','t'); select finish_stripe_event('evt_2', false, 'boom')`);
r = await as('service_role', '', `select claim_stripe_event('evt_2','t') as c`);
check('failed event can be retried', r.ok && r.rows[0].c === true);
await db.exec(`select claim_stripe_event('evt_3','t'); update stripe_events set received_at = now() - interval '10 minutes' where id='evt_3'`);
r = await as('service_role', '', `select claim_stripe_event('evt_3','t') as c`);
check('event stuck after a crash can be taken over', r.ok && r.rows[0].c === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

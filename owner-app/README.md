# HURKL owner app — Job Rooms add-on

The owner app is the phone app business owners use (`hurkl-mason-app.netlify.app`): Leads, Needs you, Mason switches, Billing, and From HURKL. It is a plain static web app that talks straight to the `Hurkl-production` Supabase project, plus Supabase Edge Functions.

**Source of truth:** as of 2026-11-25 the live app and its Edge Functions were deployed directly (Netlify upload and Supabase dashboard/MCP), **not from git**. This folder holds only the **Job Rooms** add-on and the files it touches. It is not a full copy of the owner app. `app.js`, `app.css`, `sw.js`, `config.js`, `supabase.js` and the images stay exactly as they are live, and Job Rooms does not change them.

## What Job Rooms does

- The owner taps **New Job Room**, names it (for example "Smith kitchen remodel"), and gets a private link to text to a customer, contractor, or property manager.
- The guest opens the link on their phone with no app and no account, types their name once, and can chat and share photos in **only that one room**.
- The owner can turn a link off, make a new link (the old one stops working), renew it, and delete any message or photo.
- Links close after **90 days with no activity**. The owner can renew them.
- The owner gets a phone notification when a guest posts, at most one per room every 10 minutes.

## Files

| File | What it is |
|---|---|
| `supabase/migrations/20261125100000_job_rooms.sql` | Tables, add-on switch, all rules (owner-only, company isolation, link on/off, expiry, rate limits), private photo bucket |
| `supabase/functions/job-room/` | New Edge Function: the only way guests reach a room; also owner photo upload, viewing and deleting |
| `supabase/functions/owner-push/` | The live `owner-push` function with one addition: the `job_room` notification type |
| `web/index.html` | The live page plus the Job Rooms section (after Leads) and the full-screen room view |
| `web/jobrooms-owner.js`, `web/jobroom-ui.js`, `web/jobrooms.css` | Owner-side Job Rooms code and the chat UI shared with the guest page |
| `web/room.html`, `web/room.js` | The guest page (`/room.html#<link>`) |
| `supabase/job-rooms.integration.test.ts` | 22 database tests (run with `npm run test:integration`) |
| `supabase/functions/job-room/_shared/job_rooms_core.test.ts` | Photo-check and input tests (run with `npm test`) |

## Security in short

- **Add-on switch:** `companies.job_rooms_addon`, off for everyone by default. Only HURKL can turn it on. Owners have no way to change it.
- **Owners** read and write only through `jr_*` database functions. Each one checks: signed in, role is owner, add-on on, and the room belongs to their company. RLS select policies are a second layer.
- **Guests** never touch the database. The `job-room` function calls service-role-only functions that resolve everything from the 256-bit link token. The guest's name is tied to a separate device secret that only their browser holds; the database stores only its SHA-256 hash.
- The link's secret sits in the URL **#fragment**, so it never reaches any server log. The guest page sends no referrer and is marked noindex.
- **Photos:** JPG, PNG and HEIC only, 10 MB max (checked in the browser, by the database, by the bucket, and again from the file's real bytes after upload). They live in the private bucket `job-room-photos` and are shown only through 15-minute signed links.
- **Rate limits** are enforced in the database:
  - Per guest: 20 messages per 10 minutes and 15 photos per hour.
  - Per room: 20 new guest names per day, 300 guest messages per day, 100 guest photos per day, and 400 photos in total (this caps storage cost).
  - There is also a per-IP limit in the function.
- Every owner action (create, link on/off, new link, renew, delete) is written to `audit_log`.

## Turn Job Rooms on for a business (HURKL only)

```sql
update public.companies set job_rooms_addon = true where id = '<company id>';
```

Turning it off (`= false`) hides the section in that owner's app and closes every one of that company's links immediately. Nothing is deleted.

## Putting it live (in this order)

1. Apply `supabase/migrations/20261125100000_job_rooms.sql` to `Hurkl-production`. It is additive, and every company starts with the add-on off.
2. Deploy the Edge Function `job-room` (`verify_jwt = false`, because it authenticates every request itself).
3. Redeploy `owner-push` from `supabase/functions/owner-push/`. **Before deploying, diff `index.ts` against the live version.** The only intended change is the `job_room` kind.
4. Add the six `web/` files to the live site **together with every existing live file** (a Netlify upload replaces the whole site). Before deploying, compare `web/index.html` with the live `index.html`. It was rebuilt from the live page, and the only intended changes are the Job Rooms section, the room view, the `jobrooms.css` link, the two new script tags, and `hidden` on the toast.
5. Check the site's `_headers` file. If it sets a Content-Security-Policy, it must allow `img-src` and `connect-src` for `https://atwaixmsvzehheotdymf.supabase.co` (signed photo links and uploads).
6. Turn the add-on on for **HURKL App Test** only, then run through the test below on a real Android phone and a real iPhone before turning it on for a paying customer.

## Manual test (real phones)

1. Owner: open the app, tap **New Job Room**, name it, and tap **Text the link**.
2. Guest (a second phone, signed out): open the link, enter a name, send a message, and add a photo (try one from an iPhone camera, which is HEIC).
3. Owner: check that the notification arrives, the room shows an unread badge, and the photo displays.
4. Owner: delete the photo, then turn the link off. Guest: reload, and the page says the link is turned off.

## Known limits

- **HEIC on Android:** some Android browsers can't display iPhone HEIC photos. The app shows a "Photo (tap to open)" button instead. iPhones usually send JPEG from the browser anyway.
- **No live updates:** new messages appear every 15 seconds and on return to the app, not instantly.
- Guests are notified of nothing. They see new messages when they open the link.

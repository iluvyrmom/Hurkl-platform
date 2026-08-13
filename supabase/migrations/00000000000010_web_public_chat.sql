-- Mason's public web chat — a new, anonymous, unauthenticated channel
-- (see app/api/mason/chat/[slug]/route.ts and
-- docs/a1-best-moving-launch.md). Writes still go only through the
-- service-role admin client from a trusted server route (same as the
-- Telegram webhook) — this migration does not add any new anon-writable
-- table or RLS policy.

alter table public.conversations drop constraint conversations_channel_check;
alter table public.conversations add constraint conversations_channel_check
  check (channel in ('telegram', 'web_public'));

-- Links a conversation to the lead it produced, once Mason has gathered
-- enough to submit one — prevents double-submitting a lead if the same
-- conversation continues after LEAD_READY fires once (see
-- lib/communications/inbound.ts).
alter table public.conversations add column lead_id uuid references public.leads (id);

-- Verified, owner-provided facts about a company that Mason may state
-- as fact in conversation (real pricing, policies, service area) —
-- additive and optional, same convention as migration 9's branding
-- columns. Never fabricated by this system; only ever what's
-- explicitly seeded here from the business's own published information.
alter table public.companies add column known_facts text[];

-- CREATE OR REPLACE can't change a function's return type, so the old
-- signature must be dropped first (same reasoning as migration 9).
drop function if exists public.get_company_public_profile(text);

create function public.get_company_public_profile(p_company_slug text)
returns table (
  name text,
  phone text,
  email text,
  slogan text,
  logo_url text,
  hero_eyebrow text,
  hero_headline text,
  known_facts text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select name, phone, email, slogan, logo_url, hero_eyebrow, hero_headline, known_facts
  from public.companies
  where website_slug = p_company_slug;
$$;

revoke all on function public.get_company_public_profile(text) from public;
grant execute on function public.get_company_public_profile(text) to anon, authenticated;

-- A-1's real, verified rate card and policies — sourced from their own
-- existing live site's Mason chat prompt (see docs/a1-best-moving-launch.md's
-- 2026-08-13 update). Not fabricated: this is what A-1 already publicly
-- tells any visitor to that site today.
update public.companies
set known_facts = array[
  'Pricing is flat, hourly, with no hidden fees: 1 mover is $50/hour or $350 flat for an 8-hour day; 2 movers is $100/hour or $700 flat for an 8-hour day; 3 movers is $130/hour or $1,000 flat for an 8-hour day.',
  'Discounts apply to full-day bookings only: the 25th through the 5th of each month is a premium window with no discount; outside that window, Friday, Saturday, or Sunday saves $50, and Monday through Thursday saves $75.',
  'A-1 Best Moving is labor-only and does not own or provide moving trucks — customers pair the crew with their own rental truck (Penske, U-Haul, Budget, or similar).',
  'A-1 Best Moving serves the Portland, OR metro area only (including Beaverton, Hillsboro, Lake Oswego, Gresham, and Vancouver WA) — no long-distance or interstate moves.',
  'Services offered: residential moving, apartment moving, office and commercial moving, packing services, loading and unloading, furniture assembly and disassembly, same-day moves when available, and clean-outs/dump runs.'
]
where website_slug = 'a1-best-moving';

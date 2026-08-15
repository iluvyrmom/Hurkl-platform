-- Public-page branding fields for a company's own booking page
-- (app/book/[slug]) — see docs/a1-best-moving-launch.md. Additive and
-- optional for every existing company, same convention as migration 8's
-- phone/email/slogan columns: a company with none of these set still
-- renders the page, just with generic copy instead of a custom
-- logo/headline. Not A-1-specific — any company can set these once it
-- has real brand assets.
alter table public.companies
  add column logo_url text,
  add column hero_eyebrow text,
  add column hero_headline text;

-- CREATE OR REPLACE can't change a function's return type (adding
-- columns to RETURNS TABLE counts as that), so the old signature must
-- be dropped first.
drop function if exists public.get_company_public_profile(text);

create function public.get_company_public_profile(p_company_slug text)
returns table (
  name text,
  phone text,
  email text,
  slogan text,
  logo_url text,
  hero_eyebrow text,
  hero_headline text
)
language sql
stable
security definer
set search_path = public
as $$
  select name, phone, email, slogan, logo_url, hero_eyebrow, hero_headline
  from public.companies
  where website_slug = p_company_slug;
$$;

revoke all on function public.get_company_public_profile(text) from public;
grant execute on function public.get_company_public_profile(text) to anon, authenticated;

-- A-1's real brand assets and hero copy, taken from their existing live
-- site (a-1bestmoving.netlify.app) now that we have its source. Logo
-- lives at public/companies/a1-best-moving/logo.png in this repo;
-- Mason's portrait is a shared platform asset (public/mason/avatar.jpg),
-- not per-company, since Mason is one consistent HURKL persona across
-- every tenant's page.
update public.companies
set
  logo_url = '/companies/a1-best-moving/logo.png',
  hero_eyebrow = 'Serving Greater Portland',
  hero_headline = 'Talk to Mason. Get your price now.'
where website_slug = 'a1-best-moving';

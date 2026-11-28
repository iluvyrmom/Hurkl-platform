-- Mason's memory: search by meaning (build map Part A, piece 1).
--
-- Each memory entry gets a "meaning fingerprint" (a 384-number embedding from the gte-small model
-- that Supabase runs free inside Edge Functions). Mason can then find "the drain guy" when the
-- entry says "Travis". Word search stays as well; the toolbox combines both.
--
-- Rules kept:
--   * mason_memory stays append-only and untouched: fingerprints live in their own table, keyed by
--     the entry id. A fingerprint describes an entry; it never changes what the entry says.
--   * Fingerprints are written and read only by the Edge Functions (service role). The app and
--     anonymous users have no access: there is nothing here a person needs to see.
--   * The search function applies the same walls as word search (scope, company, status, kind),
--     inside the query, before ranking.

create extension if not exists vector with schema extensions;

create table public.mason_memory_meaning (
  memory_id    uuid primary key references public.mason_memory(id),
  embedding    extensions.vector(384) not null,
  model        text not null default 'gte-small' check (char_length(model) between 1 and 40),
  content_hash text not null check (char_length(content_hash) = 64),
  created_at   timestamptz not null default now()
);
create index mason_memory_meaning_hnsw on public.mason_memory_meaning
  using hnsw (embedding extensions.vector_ip_ops);

alter table public.mason_memory_meaning enable row level security;
-- No policies: only the service role (Edge Functions) reads or writes fingerprints.
revoke all on public.mason_memory_meaning from anon, authenticated;
grant select, insert, update on public.mason_memory_meaning to service_role;

-- Entries closest in meaning to the question, inside the walls the caller asked for.
-- Fingerprints are normalized, so inner product = cosine similarity (1 = same meaning).
create or replace function public.mason_memory_meaning_search(
  p_embedding       extensions.vector(384),
  p_limit           int     default 10,
  p_min_similarity  float   default 0.80,
  p_scope           text    default null,
  p_company_id      uuid    default null,
  p_kind            text    default null,
  p_include_history boolean default false
)
returns table (memory_id uuid, similarity float)
language sql stable security invoker set search_path = public, extensions as $$
  select m.id, -(f.embedding <#> p_embedding) as similarity
  from public.mason_memory_meaning f
  join public.mason_memory m on m.id = f.memory_id
  where (p_include_history or m.status in ('active', 'pending_approval'))
    and (p_scope is null or m.scope = p_scope)
    and (p_company_id is null or m.company_id = p_company_id)
    and (p_kind is null or m.kind = p_kind)
    and -(f.embedding <#> p_embedding) >= p_min_similarity
  order by f.embedding <#> p_embedding
  limit least(greatest(p_limit, 1), 20);
$$;

-- Entries that don't have a fingerprint yet (new ones, or the 160 written before this change).
create or replace function public.mason_memory_missing_meaning(p_limit int default 10)
returns setof public.mason_memory
language sql stable security invoker set search_path = public as $$
  select m.* from public.mason_memory m
  where not exists (select 1 from public.mason_memory_meaning f where f.memory_id = m.id)
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 25);
$$;

revoke all on function public.mason_memory_meaning_search(extensions.vector, int, float, text, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.mason_memory_missing_meaning(int) from public, anon, authenticated;
grant execute on function public.mason_memory_meaning_search(extensions.vector, int, float, text, uuid, text, boolean) to service_role;
grant execute on function public.mason_memory_missing_meaning(int) to service_role;

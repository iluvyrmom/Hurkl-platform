-- Search by meaning moves from Supabase's built-in gte-small (384 numbers) to Voyage AI's
-- voyage-4-lite (1024 numbers), founder-chosen 2026-11-28. See _shared/mason_meaning.ts for why.
--
-- Fingerprints are derived data: each one is computed from a memory entry and can be made again
-- at any time. The 5 gte-small fingerprints from the first live test are cleared (vectors of a
-- different size can't be compared); no memory entry is touched.

drop index if exists public.mason_memory_meaning_hnsw;
truncate table public.mason_memory_meaning;
alter table public.mason_memory_meaning alter column embedding type extensions.vector(1024);
alter table public.mason_memory_meaning alter column model set default 'voyage-4-lite';
create index mason_memory_meaning_hnsw on public.mason_memory_meaning
  using hnsw (embedding extensions.vector_ip_ops);

drop function if exists public.mason_memory_meaning_search(extensions.vector, int, float, text, uuid, text, boolean);
create function public.mason_memory_meaning_search(
  p_embedding       extensions.vector(1024),
  p_limit           int     default 10,
  p_min_similarity  float   default 0.35,
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
revoke all on function public.mason_memory_meaning_search(extensions.vector, int, float, text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.mason_memory_meaning_search(extensions.vector, int, float, text, uuid, text, boolean) to service_role;

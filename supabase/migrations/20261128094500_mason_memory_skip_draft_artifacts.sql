-- Code handed between AIs through Mason's memory (entries tagged 'draft-source-artifact') is review
-- material, not facts. ChatGPT asked on 2026-11-28 that it be kept out of everyday searches and
-- evidence; the founder asked that all three (Mason, ChatGPT, Claude) work from the same facts.
-- Such entries stay in memory (nothing is deleted) and can still be read directly by id or title;
-- they are skipped by search by meaning and never given meaning fingerprints.

create or replace function public.mason_memory_meaning_search(
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
    and not (m.tags @> array['draft-source-artifact'])
    and (p_scope is null or m.scope = p_scope)
    and (p_company_id is null or m.company_id = p_company_id)
    and (p_kind is null or m.kind = p_kind)
    and -(f.embedding <#> p_embedding) >= p_min_similarity
  order by f.embedding <#> p_embedding
  limit least(greatest(p_limit, 1), 20);
$$;

create or replace function public.mason_memory_missing_meaning(p_limit int default 10)
returns setof public.mason_memory
language sql stable security invoker set search_path = public as $$
  select m.* from public.mason_memory m
  where not exists (select 1 from public.mason_memory_meaning f where f.memory_id = m.id)
    and not (m.tags @> array['draft-source-artifact'])
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 25);
$$;

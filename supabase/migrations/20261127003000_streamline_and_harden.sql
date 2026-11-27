-- Review pass after build step 1 (2026-11-26): one copy of Mason's AI-pick logic, plus hardening.

-- 1. ONE copy of "which AI is best for this job" (was duplicated in mason-mcp and the Mason app).
--    Order: proven results first (score differences under 0.15 count as a tie), then what's
--    already connected, then the lowest monthly cost. No track record counts as 0.5.
create or replace function public.mason_recommend_ai(p_task_type text)
returns table (name text, connection text, jobs_done bigint, success_score numeric, monthly_cost_usd numeric, cost_notes text)
language sql stable security invoker set search_path = public as $$
  select p.name, p.connection, p.jobs_done, p.success_score, p.monthly_cost_usd, p.cost_notes
    from public.mason_ai_picks p
   where p.task_type = p_task_type
   order by round((case when p.jobs_done > 0 then p.success_score else 0.5 end) / 0.15) desc,
            case p.connection when 'plugged_in' then 0 when 'api_ready' then 1 when 'opened_by_josh' then 2 else 3 end,
            p.monthly_cost_usd nulls last,
            p.name;
$$;
revoke all on function public.mason_recommend_ai(text) from public, anon;
grant execute on function public.mason_recommend_ai(text) to authenticated, service_role;

-- 2. Fixed search_path on helpers flagged by the security advisor.
alter function public.mason_text_has_secret(text) set search_path = public;
alter function public.mason_service_active(public.companies) set search_path = public;

-- 3. Trigger-only helpers must never be callable through the API.
revoke execute on function public.trg_rebuild_mason_facts() from public, anon, authenticated;
revoke execute on function public.trg_rebuild_mason_facts_pricing() from public, anon, authenticated;

-- 4. Indexes for foreign keys added today.
create index if not exists mason_memory_company_idx      on public.mason_memory (company_id);
create index if not exists mason_memory_replaces_idx     on public.mason_memory (replaces_id);
create index if not exists truck_rental_codes_company_idx on public.truck_rental_codes (company_id);
create index if not exists mason_feature_copy_company_idx on public.mason_feature_copy (company_id);

-- Step 2: the founder talks to Mason in the Mason app (supabase/functions/mason-talk).
-- Additive only: the conversations channel list gains 'mason_app'. Existing rows and the
-- existing channels ('telegram', 'web_public') are unchanged. Messages reuse the existing
-- messages table (direction, model tier, tokens, estimated cost), under HURKL (Internal).
alter table public.conversations drop constraint conversations_channel_check;
alter table public.conversations add constraint conversations_channel_check
  check (channel = any (array['telegram'::text, 'web_public'::text, 'mason_app'::text]));

-- Spending-ceiling lookups (mason-talk sums today's and this month's cost per channel).
create index if not exists messages_company_created_idx on public.messages (company_id, created_at);

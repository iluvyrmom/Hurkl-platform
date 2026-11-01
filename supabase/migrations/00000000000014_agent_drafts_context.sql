-- What the customer wrote, kept next to a Support reply draft so the owner
-- sees both. Additive. Marketing drafts leave it empty.
alter table public.agent_drafts
  add column if not exists context text check (context is null or char_length(context) <= 4000);

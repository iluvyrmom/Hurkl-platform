-- Mason trio (private Talk): one audit row per founder message, showing that Memory and the
-- Verifier checked the exact reply before Mason said it. Read by the founder (HURKL admin) in
-- the Mason app; written only by the mason-talk Edge Function (service role).

create table if not exists public.mason_trio_checks (
  request_id uuid primary key,
  conversation_id uuid not null references public.conversations(id),
  message_id uuid references public.messages(id),
  status text not null check (status in ('verified', 'blocked')),
  blocked_reason text,
  independence text check (independence in ('independent_provider', 'same_provider_temporary')),
  providers jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  stages text[] not null default '{}',
  receipts jsonb not null default '[]'::jsonb,
  context_version text,
  digest text,
  cost_usd numeric(12, 6) not null default 0,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists mason_trio_checks_created_idx on public.mason_trio_checks (created_at desc);

alter table public.mason_trio_checks enable row level security;

drop policy if exists mason_trio_checks_admin_read on public.mason_trio_checks;
create policy mason_trio_checks_admin_read on public.mason_trio_checks
  for select to authenticated using (public.is_hurkl_admin());

revoke all on public.mason_trio_checks from anon;
grant select on public.mason_trio_checks to authenticated;

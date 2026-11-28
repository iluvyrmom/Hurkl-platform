-- Search by meaning uses OpenAI's text-embedding-3-small at 1024 numbers (founder's one OpenAI key
-- for both the Verifier and fingerprints, 2026-11-28). Same table size as before; only the
-- default model label changes. Voyage was never switched on, so no fingerprints need clearing.
alter table public.mason_memory_meaning alter column model set default 'text-embedding-3-small';

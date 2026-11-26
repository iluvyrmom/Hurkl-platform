-- Seed Executive Drains as the first HURKL org.
-- Auto-callback stays OFF until the Twilio number is connected and tested.
insert into public.organizations (slug, name, industry, timezone, elevenlabs_agent_id, auto_callback_enabled)
values ('executive-drains', 'Executive Drains', 'plumbing', 'America/Los_Angeles',
        'agent_3401m76d9xqqers81zn6bs2wpz3w', false)
on conflict (slug) do nothing;

-- The Angi key is generated separately at setup time: the plain key is shown once
-- (to paste into Angi), and only its SHA-256 hash is stored in lead_source_credentials.

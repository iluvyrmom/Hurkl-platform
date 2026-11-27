# Database change history (Hurkl-production, Supabase project atwaixmsvzehheotdymf)

The live database is the source of truth for its own schema. Supabase (Pro plan)
takes automatic daily backups of the whole database. Every change applied to
production is listed below, in order, exactly as recorded in
`supabase_migrations.schema_migrations` on 2026-11-26.

Files in `migrations/` are kept for the changes that have a file in this repo.
For every other change, the full SQL is stored inside the production database
itself (`supabase_migrations.schema_migrations.statements`).

| Version | Change |
| --- | --- |
| 20260804020426 | tenant_foundation |
| 20260804020439 | customers_and_audit_log |
| 20260804020452 | company_onboarding |
| 20260804020512 | communications |
| 20260805201221 | company_account_types |
| 20260811001816 | grant_table_privileges |
| 20260811001825 | mason_reasoning |
| 20260811092334 | leads_and_company_profile |
| 20260813082931 | mason_discount_authority_and_escalations |
| 20260815054107 | company_branding |
| 20260815054120 | web_public_chat |
| 20260822063051 | a1_booking_discount_policy |
| 20260822082726 | a1_conversation_calendar |
| 20260822083821 | a1_conversation_follow_through |
| 20260822114145 | a1_stripe_booking_deposits |
| 20260822114437 | a1_booking_advisor_fixes |
| 20261028091720 | time_off_requests_table |
| 20261028091723 | lock_profile_role_edits |
| 20261028092217 | agent_drafts |
| 20261112044235 | angi_lead_intake |
| 20261112044442 | enable_pg_net |
| 20261112044630 | move_pg_net_to_extensions_schema |
| 20261112050225 | lead_followup_sequence |
| 20261112050232 | enable_pg_cron |
| 20261112050536 | followup_worker_secret |
| 20261112050831 | schedule_lead_followup_worker |
| 20261113042423 | rescue_kennel_collaboration |
| 20261113042905 | rescue_kennel_access_guard |
| 20261114091228 | owner_job_sheet_texts |
| 20261114091233 | owner_texts_since |
| 20261114091701 | schedule_owner_notifier |
| 20261114092508 | mason_water_shutoff_guide |
| 20261114092519 | static_assets_table |
| 20261114093718 | drop_static_asset_chunks_scratch |
| 20261123101157 | lock_down_anon_security_definer_functions |
| 20261125014502 | owner_app |
| 20261125014953 | owner_app_setup_info |
| 20261125015153 | fix_queue_owner_push_record_fields |
| 20261125023926 | billing |
| 20261125024659 | billing_pause_message_accuracy |
| 20261125223120 | owner_app_v2_setup_invites_copy |
| 20261125223219 | angi_followup_on_at_first_payment |
| 20261126221849 | mason_pricing_rules_and_verified_truck_codes |
| 20261126221917 | mason_savings_example_timeless |
| 20261126222048 | mason_savings_wording_v2 |
| 20261126223541 | mason_pricing_rules_per_company_template |
| 20261126233442 | mason_memory_and_ai_roster |
| 20261126233511 | mason_connector_check_fix |
| 20261126233541 | mason_connectors_hide_token_hash |
| 20261127001230 | company_specific_features |
| 20261127001513 | streamline_and_harden |
| 20261127100040 | mason_app_channel (file: `migrations/20261127100040_mason_app_channel.sql`) |
| 20261127120000 | mason_plug_oauth_sign_in (file: `migrations/20261127120000_mason_plug_oauth_sign_in.sql`) |

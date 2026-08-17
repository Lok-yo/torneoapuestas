-- 0000_extensions.sql
-- Enables the extensions required by the migration/test harness itself.
-- No application schema lives here; this keeps the pgTAP test harness
-- (supabase/tests/) usable as soon as migrations start replaying.

create extension if not exists pgtap with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- 017_rls_reproducible.sql
--
-- Makes the fail-closed state of the last three tables reproducible.
--
-- WHY THIS EXISTS WHEN NOTHING IS BROKEN
--
-- Row Level Security is already on for `users`, `vehicle_profiles` and
-- `service_drafts` in the live database -- verified 2026-08-29 by querying
-- PostgREST with the public anon key, which returned 200 and zero rows for
-- each. Migration 006 says as much in its own comment.
--
-- What is missing is the statement that puts it there. 006 enabled RLS on the
-- four tables that lacked it and noted the other three "already have" it, but
-- no migration in this folder ever turned it on for them. So the live database
-- is correct and the migration history is not: provisioning a fresh Supabase
-- project by running database/migrations in order produces `users`,
-- `vehicle_profiles` and `service_drafts` with RLS **off**.
--
-- That matters because the anon key is public. It ships inside the browser
-- bundle -- it is meant to, that is what an anon key is for -- and Supabase
-- exposes every table over PostgREST at /rest/v1/<table>. A table without RLS
-- is readable by anyone who opens the site and reads the JavaScript. On a
-- staging copy, a teammate's local project, or a rebuild after an incident,
-- that would expose every owner's email, name, and plate number.
--
-- WHY NO POLICIES
--
-- Enabling RLS without policies denies everything, which is exactly right
-- here. The browser's Supabase client is used only for Auth and Storage; it
-- never queries these tables. All data access goes through the Spring Boot
-- API, which connects over JDBC as `postgres` and bypasses RLS regardless.
-- So this changes nothing at runtime and closes the hole on any future
-- database built from this folder.
--
-- Adding permissive policies later would be the dangerous move, not this.
--
-- HOW TO RUN -- paste into the Supabase SQL Editor and press Run. Idempotent
-- and safe to re-run: enabling RLS on a table that already has it is a no-op.

begin;

alter table public.users             enable row level security;
alter table public.vehicle_profiles  enable row level security;
alter table public.service_drafts    enable row level security;

commit;

-- ----------------------------------------------------------------- verify
--
-- Every table in `public` should report true. A false is a table the anon key
-- can read directly, whatever the backend believes it is enforcing.
--
--   select relname as table_name, relrowsecurity as rls_enabled
--   from pg_class
--   where relnamespace = 'public'::regnamespace
--     and relkind = 'r'
--   order by relrowsecurity, relname;
--
-- The same check from outside, which is the one that actually matters --
-- run it against your project with the anon key and expect zero rows:
--
--   curl -s -o /dev/null -w '%{http_code} %{size_download}\n' \
--     -H "apikey: $SUPABASE_ANON_KEY" \
--     "$SUPABASE_URL/rest/v1/users?select=user_id&limit=1"

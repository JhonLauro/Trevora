-- delete_user_account.sql
--
-- Removes one account and everything filed under it.
--
-- After migration 016 the cascades do the work, so this is a single DELETE
-- rather than the seven-statement ordering dance that
-- cleanup_mock_owner_data.sql had to perform. What this script adds is the
-- part the cascade cannot: showing you what is about to be destroyed, while
-- you can still change your mind.
--
-- ** There is no undo. ** Run the counts first and read them.
--
-- ----------------------------------------------------------------------
-- 1. Set the account once, here.
-- ----------------------------------------------------------------------
--
-- Find the id from the email if you do not have it:
--
--   select user_id, email, first_name, last_name, created_at
--   from public.users
--   where lower(email) = lower('them@example.com');

\set target_user '00000000-0000-0000-0000-000000000000'

-- In the Supabase SQL Editor \set is not available. Replace the literal in
-- each statement below instead, or paste this into psql where it is.

-- ----------------------------------------------------------------------
-- 2. Look before you leap.
-- ----------------------------------------------------------------------

select
    u.email,
    u.first_name || ' ' || u.last_name          as name,
    u.created_at                                 as joined,
    (select count(*) from public.vehicle_profiles v where v.owner_id = u.user_id)  as vehicles,
    (select count(*) from public.service_records r where r.owner_id = u.user_id)   as confirmed_records,
    (select count(*) from public.service_drafts d where d.owner_id = u.user_id)    as drafts,
    (select count(*) from public.qr_access_requests q where q.owner_id = u.user_id) as share_links,
    (select count(*) from public.mechanic_access_sessions s where s.owner_id = u.user_id) as mechanic_sessions
from public.users u
where u.user_id = :'target_user';

-- Every one of those numbers goes to zero. If `confirmed_records` is not a
-- number you are willing to lose, stop here.

-- ----------------------------------------------------------------------
-- 3. Delete.
-- ----------------------------------------------------------------------
--
-- One statement. The cascades added in 016 remove the vehicles, drafts,
-- records, line items, share links, access requests and sessions beneath it.
--
-- This removes the *profile*. The Supabase auth user is a separate row in a
-- schema this cannot reach from the SQL editor's default role; delete that in
-- Authentication > Users, or via the admin API. The reverse direction is
-- automatic: deleting the auth user cascades down to here.

begin;

delete from public.users where user_id = :'target_user';

-- Should return 0.
select count(*) as profile_rows_remaining
from public.users
where user_id = :'target_user';

commit;

-- ----------------------------------------------------------------------
-- 4. Clearing an orphan left by an Auth-tab delete
-- ----------------------------------------------------------------------
--
-- A profile row whose auth user was already deleted before 016 existed. The
-- same DELETE above clears it; this finds them:
--
--   select u.user_id, u.email,
--          (select count(*) from public.service_records r where r.owner_id = u.user_id) as records
--   from public.users u
--   left join auth.users a on a.id = u.user_id
--   where a.id is null;
--
-- Once none are left, promote the constraint 016 created so the rule is
-- enforced on the rows already in the table as well as new ones:
--
--   alter table public.users validate constraint users_auth_user_fkey;

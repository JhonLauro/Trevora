-- rollback_016.sql
--
-- Undoes 016_link_auth_and_app_users.sql, putting every constraint back
-- exactly as it was before.
--
-- ** This is not guesswork. ** The state restored below is the state your
-- database actually reported on 2026-08-27, read from pg_constraint, not
-- inferred from the migration files. That distinction matters for one row:
--
--   vehicle_profiles.owner_id -> users  was already CASCADE
--
-- Migration 001 declared it without a delete rule, so a rollback written
-- from the migration folder would have "restored" it to NO ACTION and
-- quietly changed something 016 never touched. It is restored to CASCADE
-- here because that is what was there.
--
-- The four item and line-entry constraints are not mentioned at all: they
-- were already CASCADE, 016 does not touch them, and neither does this.
--
-- Running this loses no data. It only puts the delete rules back, after
-- which deleting a user is refused again exactly as it is today.
--
-- HOW TO RUN — paste into the Supabase SQL Editor and press Run. One
-- transaction; an error anywhere leaves the database untouched.

begin;

-- ------------------------------------------- constraints back as they were

do $$
declare
    target record;
    existing_name text;
    new_name text;
begin
    for target in
        select *
        from (values
            -- The one that was already cascading before 016.
            ('vehicle_profiles',         'owner_id',                   'users',                    'cascade'),
            -- Everything else was NO ACTION.
            ('service_drafts',           'owner_id',                   'users',                    'no action'),
            ('service_records',          'owner_id',                   'users',                    'no action'),
            ('qr_access_requests',       'owner_id',                   'users',                    'no action'),
            ('mechanic_access_requests', 'owner_id',                   'users',                    'no action'),
            ('mechanic_access_sessions', 'owner_id',                   'users',                    'no action'),
            ('mechanic_access_requests', 'mechanic_id',                'users',                    'no action'),
            ('mechanic_access_sessions', 'mechanic_id',                'users',                    'no action'),
            ('service_drafts',           'vehicle_id',                 'vehicle_profiles',         'no action'),
            ('service_records',          'vehicle_id',                 'vehicle_profiles',         'no action'),
            ('qr_access_requests',       'vehicle_id',                 'vehicle_profiles',         'no action'),
            ('mechanic_access_requests', 'vehicle_id',                 'vehicle_profiles',         'no action'),
            ('mechanic_access_sessions', 'vehicle_id',                 'vehicle_profiles',         'no action'),
            ('service_records',          'draft_id',                   'service_drafts',           'no action'),
            ('mechanic_access_requests', 'qr_access_request_id',       'qr_access_requests',       'no action'),
            ('mechanic_access_sessions', 'mechanic_access_request_id', 'mechanic_access_requests', 'no action')
        ) as t(child_table, child_column, parent_table, action)
    loop
        select c.conname into existing_name
        from pg_constraint c
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = any(c.conkey)
        where c.contype = 'f'
          and c.conrelid = ('public.' || target.child_table)::regclass
          and c.confrelid = ('public.' || target.parent_table)::regclass
          and a.attname = target.child_column
        limit 1;

        if existing_name is not null then
            execute format('alter table public.%I drop constraint %I',
                           target.child_table, existing_name);
        end if;

        new_name := coalesce(existing_name,
                             left(target.child_table || '_' || target.child_column || '_fkey', 63));

        execute format(
            'alter table public.%I add constraint %I
               foreign key (%I) references public.%I on delete %s',
            target.child_table, new_name, target.child_column,
            target.parent_table, target.action
        );

        existing_name := null;
    end loop;
end $$;

-- ------------------------------------------------- unlink the users tables

alter table public.users
    drop constraint if exists users_auth_user_fkey;

commit;

-- The three indexes 016 added are deliberately left in place. They make
-- lookups faster and change no behaviour, so removing them would be undoing
-- something that was not part of the problem. Drop them by hand if you want
-- a byte-for-byte return:
--
--   drop index if exists public.idx_mechanic_access_sessions_owner_id;
--   drop index if exists public.idx_mechanic_access_requests_mechanic_id;
--   drop index if exists public.idx_mechanic_access_sessions_mechanic_id;
--
-- Confirm the rollback with the same wide query used before: 20 rows,
-- 5 CASCADE (vehicle_profiles.owner_id plus the four item/line-entry keys)
-- and 15 NO ACTION.

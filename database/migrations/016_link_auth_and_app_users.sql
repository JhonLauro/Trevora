-- 016_link_auth_and_app_users.sql
--
-- Makes deleting an account one action instead of two-and-then-stuck.
--
-- THE PROBLEM
--
-- Supabase keeps `auth.users`; this app keeps `public.users`. The split is
-- the normal Supabase shape and is not the bug. The bug is that the two were
-- never connected: AuthService.syncSupabaseProfile writes the Supabase id
-- into public.users.user_id and nothing in the database records that the two
-- rows are the same person. So deleting in the Auth tab leaves the profile
-- behind, and deleting the profile is refused by the eight foreign keys
-- pointing at users(user_id), every one of them NO ACTION.
--
-- WHY THIS TOUCHES SIXTEEN CONSTRAINTS AND NOT EIGHT
--
-- Cascading only the owner_id keys is not enough, and would fail on any
-- account that has actually been used.
--
-- Deleting one users row fires every referencing cascade, and Postgres does
-- not promise an order between siblings. Vehicles and records are both
-- children of users — but records are also children of vehicles. If the
-- vehicle cascade runs first, service_records.vehicle_id (NO ACTION) rejects
-- it and the whole delete aborts. service_records.draft_id -> service_drafts
-- is the same trap one level down, and so are the QR-request and
-- access-request chains.
--
-- database/maintenance/cleanup_mock_owner_data.sql already documents this:
-- "every foreign key pointing at vehicle_profiles is NO ACTION, so children
-- have to go first or the delete is rejected." That script solves it by
-- hand-ordering seven deletes. This migration solves it by making the whole
-- ownership tree cascade, after which no order is wrong.
--
-- The item and line-entry tables are already ON DELETE CASCADE from 007 and
-- 011, so they are not touched here.
--
-- WHAT THIS MAKES TRUE
--
-- Deleting a user — from the Auth tab, or with a plain DELETE on
-- public.users — removes that owner's vehicles, drafts, confirmed records,
-- share links, access requests and sessions with them.
--
-- ** That is irreversible, and it is the point. ** An account deletion that
-- leaves the person's service history behind is not a deletion. But it does
-- mean a mis-aimed delete in the dashboard destroys a real owner's history
-- with no undo. Today that is safe only by accident, because the delete
-- half-fails. After this it will not.
-- database/maintenance/delete_user_account.sql makes the same deletion
-- deliberate, and shows what will go before it goes.
--
-- WHY mechanic_id IS DIFFERENT
--
-- mechanic_access_requests.mechanic_id and mechanic_access_sessions.mechanic_id
-- reference users, but mechanics never register — QRAccessService sets the
-- column to null explicitly, so it is null on every row. They get SET NULL
-- rather than CASCADE because the semantics differ even where the rows do
-- not: deleting an owner should not delete a session merely because that
-- person was also the mechanic on it.
--
-- HOW TO RUN — paste into the Supabase SQL Editor and press Run, or feed it
-- to psql. Safe to re-run. Verify afterwards with the query at the bottom.

begin;

-- ---------------------------------------------------------------- indexes
--
-- Postgres does not index foreign key columns automatically, and an
-- unindexed FK makes ON DELETE CASCADE scan the whole child table while
-- holding locks. These three had none; the rest already do.

create index if not exists idx_mechanic_access_sessions_owner_id
    on public.mechanic_access_sessions(owner_id);

create index if not exists idx_mechanic_access_requests_mechanic_id
    on public.mechanic_access_requests(mechanic_id);

create index if not exists idx_mechanic_access_sessions_mechanic_id
    on public.mechanic_access_sessions(mechanic_id);

-- ------------------------------------------------ the whole ownership tree
--
-- Constraints are found by (table, column, referenced table) rather than by
-- name. The names in this database happen to follow <table>_<column>_fkey,
-- but that is Postgres's default rather than a guarantee, and one of them
-- would be truncated at 63 characters if a name ever grew long enough.

do $$
declare
    target record;
    existing_name text;
    new_name text;
begin
    for target in
        select *
        from (values
            -- children of users
            ('vehicle_profiles',         'owner_id',                   'users',                    'cascade'),
            ('service_drafts',           'owner_id',                   'users',                    'cascade'),
            ('service_records',          'owner_id',                   'users',                    'cascade'),
            ('qr_access_requests',       'owner_id',                   'users',                    'cascade'),
            ('mechanic_access_requests', 'owner_id',                   'users',                    'cascade'),
            ('mechanic_access_sessions', 'owner_id',                   'users',                    'cascade'),
            -- always null today; see the note above on why not cascade
            ('mechanic_access_requests', 'mechanic_id',                'users',                    'set null'),
            ('mechanic_access_sessions', 'mechanic_id',                'users',                    'set null'),
            -- children of vehicle_profiles: without these, the vehicle
            -- cascade collides with the record cascade
            ('service_drafts',           'vehicle_id',                 'vehicle_profiles',         'cascade'),
            ('service_records',          'vehicle_id',                 'vehicle_profiles',         'cascade'),
            ('qr_access_requests',       'vehicle_id',                 'vehicle_profiles',         'cascade'),
            ('mechanic_access_requests', 'vehicle_id',                 'vehicle_profiles',         'cascade'),
            ('mechanic_access_sessions', 'vehicle_id',                 'vehicle_profiles',         'cascade'),
            -- the three remaining links inside one owner's data
            ('service_records',          'draft_id',                   'service_drafts',           'cascade'),
            ('mechanic_access_requests', 'qr_access_request_id',       'qr_access_requests',       'cascade'),
            ('mechanic_access_sessions', 'mechanic_access_request_id', 'mechanic_access_requests', 'cascade')
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

        -- Reuse the old name where there was one, so the schema keeps the
        -- names anything else may already refer to.
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

-- --------------------------------------------- public.users -> auth.users
--
-- The link that was never declared. With it, removing someone in the Auth
-- tab removes their profile row, and the cascades above carry that through
-- to their data — one delete instead of two.
--
-- NOT VALID on purpose. Deleting an auth user before this migration left
-- profile rows with no matching auth row, and a validated constraint refuses
-- to be created while any exist — failing the whole migration on a database
-- that has the very problem it is here to fix. NOT VALID skips the check of
-- existing rows and still enforces the rule on everything from now on,
-- the cascade included.
--
-- Find the orphans:
--
--   select u.user_id, u.email
--   from public.users u
--   left join auth.users a on a.id = u.user_id
--   where a.id is null;
--
-- Clear them (delete_user_account.sql), then promote it:
--
--   alter table public.users validate constraint users_auth_user_fkey;

alter table public.users
    drop constraint if exists users_auth_user_fkey;

alter table public.users
    add constraint users_auth_user_fkey
    foreign key (user_id) references auth.users(id) on delete cascade
    not valid;

comment on constraint users_auth_user_fkey on public.users is
    'Ties the app profile to the Supabase auth user of the same id. ON DELETE CASCADE is what makes removing an account in the Auth tab remove the profile and, through the ownership cascades, that owner''s vehicles and records. Created NOT VALID because profile rows orphaned before migration 016 would otherwise block it; validate once they are cleared.';

commit;

-- ----------------------------------------------------------------- verify
--
-- Run this after. Sixteen rows: fourteen CASCADE, two SET NULL (the
-- mechanic_id pair). Fewer means a constraint was dropped and not re-added,
-- which is worse than the problem this migration set out to fix.
--
--   select conrelid::regclass as child, a.attname as column_name,
--          confrelid::regclass as parent,
--          case c.confdeltype
--               when 'c' then 'CASCADE' when 'n' then 'SET NULL'
--               when 'a' then 'NO ACTION' else c.confdeltype::text end as on_delete
--   from pg_constraint c
--   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
--   where c.contype = 'f'
--     and c.confrelid in ('public.users'::regclass,
--                         'public.vehicle_profiles'::regclass,
--                         'public.service_drafts'::regclass,
--                         'public.qr_access_requests'::regclass,
--                         'public.mechanic_access_requests'::regclass)
--   order by 1, 2;

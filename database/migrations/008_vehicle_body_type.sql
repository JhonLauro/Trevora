-- 008_vehicle_body_type.sql
--
-- Adds `body_type` to vehicle_profiles.
--
-- Why it exists: the parts map cannot be built without it. A pickup, van, MPV
-- and sedan are not the same silhouette and their components sit in different
-- places, so the artwork is bodyType x view. It is also the first field the
-- new make/model picker can fill in on the user's behalf — the catalogue
-- knows a Vios is a sedan, and nobody would reliably type that themselves.
--
-- Nullable on purpose. Every existing row predates the picker and most of them
-- are test data whose body type nobody can honestly state; back-filling would
-- be inventing the value rather than recording it. New vehicles added through
-- either form always carry one.
--
-- Apply with:  psql "$SUPABASE_DB_URL" -f database/migrations/008_vehicle_body_type.sql
-- Safe to re-run.

begin;

alter table public.vehicle_profiles
    add column if not exists body_type text;

-- A check constraint rather than a Postgres enum: the set will grow (kei
-- trucks, tricycles, buses), and adding a value to a check constraint is one
-- statement while altering an enum type is a migration with a lock.
alter table public.vehicle_profiles
    drop constraint if exists vehicle_profiles_body_type_check;

alter table public.vehicle_profiles
    add constraint vehicle_profiles_body_type_check
    check (body_type is null or body_type in (
        'sedan',
        'hatchback',
        'suv',
        'mpv',
        'pickup',
        'van',
        'motorcycle'
    ));

comment on column public.vehicle_profiles.body_type is
    'Vehicle silhouette, used by the parts map. Set from the make/model catalogue when the model is known, asked for otherwise. Null on rows created before the picker existed.';

commit;

-- 012_motorcycle_sub_types.sql
--
-- Widens the body_type check constraint to admit `scooter` and `underbone`.
--
-- Why it exists: the parts map drew one generic naked bike for every
-- two-wheeler, and seventeen of the twenty-three motorcycles in the catalogue
-- are scooters or underbones. A scooter has a full apron and a flat
-- floorboard, an underbone a short leg shield and a bare cylinder with a chain
-- under it; these are different objects, not proportion changes, so one
-- drawing could only ever be right about the six big bikes. The split was
-- specified with the original parts map and deferred because it needed this
-- column to carry more than `motorcycle`.
--
-- All three keep vehicleClass `motorcycle` in the frontend catalogue, so the
-- component taxonomy is untouched — a scooter has the same twelve components
-- as a big bike. Only the artwork branches.
--
-- No back-fill. Existing rows keep `motorcycle` and get the big-bike drawing,
-- which is the honest fallback of the three: it claims no bodywork, so it
-- under-describes a scooter rather than inventing an apron the vehicle may not
-- have. Owners can correct a bike by editing it. Back-filling from make/model
-- was considered and rejected for the same reason 008 did not back-fill —
-- the catalogue's guess is not the same thing as the owner's statement.
--
-- Apply with:  psql "$SUPABASE_DB_URL" -f database/migrations/012_motorcycle_sub_types.sql
-- Safe to re-run.

begin;

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
        'scooter',
        'underbone',
        'motorcycle'
    ));

comment on column public.vehicle_profiles.body_type is
    'Vehicle silhouette, used by the parts map. Set from the make/model catalogue when the model is known, asked for otherwise. Null on rows created before the picker existed; `motorcycle` means big bike, and also covers bikes registered before the scooter/underbone split.';

commit;

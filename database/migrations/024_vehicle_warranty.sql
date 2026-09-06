-- 024_vehicle_warranty.sql
--
-- Manufacturer warranty terms on vehicle_profiles: when cover started, how
-- long it runs, and how far.
--
-- Why it exists: the question this app is asked most often at the counter is
-- "do I take this to the dealer or the shop down the road", and the answer
-- turns entirely on whether the vehicle is still covered. Nothing in Trevora
-- could answer it. The Warranty & coverage tab has shown an honest empty state
-- since it was built (see planning/DEFERRED.md, section f) because the earlier
-- attempt kept coverage in localStorage, which vanished on a new device. These
-- are real columns, which is what that objection was waiting for.
--
-- THREE COLUMNS, ALL NULLABLE, AND THE PARTIAL STATES ARE THE POINT.
--
--   warranty_start_date  purchase or delivery date. Not the model year -- a
--                        2018 model bought new in 2019 is covered from 2019,
--                        and vehicle_profiles.model_year cannot answer this.
--   warranty_months      coverage period. 36 on most PH-market vehicles.
--   warranty_km_limit    distance limit. 100,000 on most, but not all.
--
-- Nullable individually rather than as a set, because an owner genuinely
-- holding one half of the answer is the common case: a booklet states "3 years
-- or 100,000 km" while the delivery date sits on paperwork they no longer
-- have. Requiring all three to save any would throw away the half they know.
-- The read side reports MILEAGE_ONLY and TIME_ONLY for exactly this, rather
-- than collapsing a partial answer into a confident yes or no.
--
-- NOTHING IS DERIVED HERE. Expiry date, kilometres remaining and the status
-- itself are computed on read by WarrantyStatusResolver. A stored expiry would
-- be free to contradict the start date and period it came from the moment
-- either was corrected -- the same rule 010 applied to out-of-pocket cost.
--
-- The check constraints are the real content. A negative period or limit is
-- nonsense, and a start date in the future is a typo rather than a warranty
-- that has not begun: a vehicle cannot have been delivered next year. Zero is
-- rejected too -- "0 months" is not a shorter warranty, it is an empty field
-- somebody submitted, and null already says that honestly.
--
-- There is no check that the start date is in the past, though a delivery date
-- in the future is certainly a typo. current_date is STABLE, not IMMUTABLE, and
-- Postgres refuses it inside a CHECK -- the statement does not merely misbehave,
-- it fails to apply. That rule lives on CreateVehicleRequest and
-- UpdateVehicleRequest as @PastOrPresent instead, which is where it can also
-- name the field and say something useful to whoever typed it.
--
-- Upper bounds are deliberately generous rather than tight. 50 years and two
-- million kilometres are both absurd for a warranty and are there to catch a
-- unit mix-up (months typed as days, kilometres typed as metres), not to
-- adjudicate what terms a manufacturer may offer. The km ceiling matches
-- OdometerResolver.MAX_PLAUSIBLE_KM so a limit and a reading cannot disagree
-- about what counts as a plausible distance.
--
-- No brand table backs any of this. Terms vary by brand, model year and
-- market, and a prefilled value that is wrong is indistinguishable on screen
-- from one that is right. The form asks and leaves the fields empty.
--
-- vehicle_profiles already has RLS enabled and no policies (the fail-closed
-- state described in 006), so added columns need nothing further here.
--
-- HOW TO RUN -- paste into the Supabase SQL Editor and press Run, or:
--   psql "$SUPABASE_DB_URL" -f database/migrations/024_vehicle_warranty.sql
-- Safe to re-run.

begin;

alter table public.vehicle_profiles
    add column if not exists warranty_start_date date;

alter table public.vehicle_profiles
    add column if not exists warranty_months integer;

alter table public.vehicle_profiles
    add column if not exists warranty_km_limit integer;

alter table public.vehicle_profiles
    drop constraint if exists vehicle_profiles_warranty_months_check;

alter table public.vehicle_profiles
    add constraint vehicle_profiles_warranty_months_check
    check (warranty_months is null or (warranty_months > 0 and warranty_months <= 600));

alter table public.vehicle_profiles
    drop constraint if exists vehicle_profiles_warranty_km_limit_check;

alter table public.vehicle_profiles
    add constraint vehicle_profiles_warranty_km_limit_check
    check (warranty_km_limit is null or (warranty_km_limit > 0 and warranty_km_limit <= 2000000));

comment on column public.vehicle_profiles.warranty_start_date is
    'Purchase or delivery date, when the manufacturer warranty began. Owner-supplied, never verified with a dealer. Not the model year. Null when the owner does not have the date.';

comment on column public.vehicle_profiles.warranty_months is
    'Manufacturer warranty period in months, as printed in the owner''s warranty booklet. Null when unknown. Expiry is derived on read, never stored.';

comment on column public.vehicle_profiles.warranty_km_limit is
    'Manufacturer warranty distance limit in kilometres. Compared against the highest odometer reading across the vehicle''s service records. Null when unknown.';

commit;

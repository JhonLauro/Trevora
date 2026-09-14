-- 029_warranty_expiry_and_source.sql
--
-- WHAT: two columns beside the warranty terms from 024.
--
--   warranty_expiry_date  the warranty end date exactly as a document prints
--                         it. When present it wins over start + months; when
--                         absent the end is still worked out from those two.
--   warranty_source       who supplied the warranty fields: OWNER or RECEIPT.
--
-- WHY A STORED EXPIRY, WHEN 024 SAID NEVER TO STORE ONE. 024 refused to store
-- an expiry *derived* from start + months, because a copy of a sum goes stale
-- the moment either half is corrected. This is not that. Dealer receipts print
-- the end date themselves ("Warranty Expiry: 2029-03-14"), and a printed end
-- date is a fact in its own right: start + 36 months lands on a different day
-- than the dealer's paperwork whenever the dealer counts from registration,
-- rounds to a month end, or runs a promo extension. Recomputing it would
-- replace what the paper says with our arithmetic. Status is still never
-- stored -- WarrantyStatusResolver derives it on every read.
--
-- WHY A SOURCE COLUMN. The vehicle page used to say every warranty came from
-- the owner. Once dates can come from a receipt that sentence becomes false,
-- so the screen needs to know which it was. Nothing writes RECEIPT yet; the
-- extraction step and the owner's confirmation come later.
--
-- EXISTING ROWS. Every warranty term on file today was typed by the owner --
-- no other path to these columns has ever existed -- so rows with any term
-- are backfilled OWNER. Rows with no terms stay null. Null is never shown as
-- "from a receipt": the screen shows no source line for it at all.
--
-- HOW TO RUN -- paste into the Supabase SQL Editor and press Run, or:
--   psql "$SUPABASE_DB_URL" -f database/migrations/029_warranty_expiry_and_source.sql
-- Safe to re-run. Apply BEFORE deploying the backend that reads these columns.

begin;

alter table public.vehicle_profiles
    add column if not exists warranty_expiry_date date;

alter table public.vehicle_profiles
    add column if not exists warranty_source text;

alter table public.vehicle_profiles
    drop constraint if exists vehicle_profiles_warranty_source_check;

alter table public.vehicle_profiles
    add constraint vehicle_profiles_warranty_source_check
    check (warranty_source is null or warranty_source in ('OWNER', 'RECEIPT'));

update public.vehicle_profiles
   set warranty_source = 'OWNER'
 where warranty_source is null
   and (warranty_start_date is not null
        or warranty_months is not null
        or warranty_km_limit is not null
        or warranty_expiry_date is not null);

comment on column public.vehicle_profiles.warranty_expiry_date is
    'Warranty end date as printed on a document, not computed. Wins over warranty_start_date + warranty_months when present. Null when nothing printed one.';

comment on column public.vehicle_profiles.warranty_source is
    'Who supplied the warranty fields: OWNER (typed by the owner) or RECEIPT (read from a receipt and confirmed by the owner). Null when no warranty terms are recorded.';

commit;

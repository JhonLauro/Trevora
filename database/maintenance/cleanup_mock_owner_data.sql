-- cleanup_mock_owner_data.sql
--
-- Removes every vehicle and all its history belonging to the pre-auth mock
-- owner `00000000-0000-0000-0000-000000000001`
-- (module1-owner@trevora.local).
--
-- As of 2026-08-22 that is 13 vehicles, 12 confirmed records and 44 drafts,
-- created during Module 1 development before real authentication existed. It
-- includes the rows whose makes are UI labels — `Receipt Tester` (x4),
-- `Receipt Browser`, `Route Verifier`, `Voice Tester`, `s Toyota` — which
-- were never real vehicles.
--
-- SCOPED DELIBERATELY. It touches ONE owner. The junk-looking rows in this
-- database belong to ten different accounts, including real teammates
-- (gamallobenzleo@, jhonlauro01@, bruhbenz927@, genshinsloth@) and a
-- newaccount@ with 4 records and 25 drafts. Do not widen the owner filter
-- without asking whoever owns those rows.
--
-- Order matters: every foreign key pointing at vehicle_profiles is NO ACTION,
-- so children have to go first or the delete is rejected. Sessions reference
-- requests, requests reference the QR request, and confirmed records
-- reference the draft they came from. Item tables cascade on their own.
--
-- This mirrors VehicleService.deleteVehicleForCurrentUser exactly; keep the
-- two in step if either changes.
--
-- Run with:  psql "$SUPABASE_DB_URL" -f database/maintenance/cleanup_mock_owner_data.sql
-- Re-runnable. Wrapped in a transaction, so a failure anywhere rolls it all back.

begin;

create temporary table doomed_vehicles on commit drop as
select vehicle_id
from public.vehicle_profiles
where owner_id = '00000000-0000-0000-0000-000000000001';

-- Look before you leap: this prints what is about to go.
select count(*) as vehicles_to_delete from doomed_vehicles;

delete from public.mechanic_access_sessions
where vehicle_id in (select vehicle_id from doomed_vehicles);

delete from public.mechanic_access_requests
where vehicle_id in (select vehicle_id from doomed_vehicles);

delete from public.qr_access_requests
where vehicle_id in (select vehicle_id from doomed_vehicles);

delete from public.service_records
where vehicle_id in (select vehicle_id from doomed_vehicles);

delete from public.service_drafts
where vehicle_id in (select vehicle_id from doomed_vehicles);

delete from public.vehicle_profiles
where vehicle_id in (select vehicle_id from doomed_vehicles);

-- Should return zero rows.
select count(*) as vehicles_remaining_for_mock_owner
from public.vehicle_profiles
where owner_id = '00000000-0000-0000-0000-000000000001';

commit;

-- Closes a direct-database-access gap: these 4 tables had RLS disabled entirely,
-- meaning the public Supabase anon key could read/write every row directly,
-- bypassing all ownership/approval checks enforced in the Spring Boot backend.
--
-- The frontend's Supabase client is only ever used for Auth and Storage (receipt
-- uploads) -- it never queries these tables directly. All real data access goes
-- through the backend, which connects via JDBC as the `postgres` role and
-- therefore bypasses RLS regardless of policies. So enabling RLS with no
-- policies here is sufficient: it matches the fail-closed state that
-- `users`, `vehicle_profiles`, and `service_drafts` already have, and does
-- not change backend behavior at all.

ALTER TABLE public.service_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mechanic_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mechanic_access_sessions ENABLE ROW LEVEL SECURITY;

-- 023_vehicle_concerns.sql
--
-- Something the owner noticed about their own car, in their own words.
--
-- Why this table is deliberately thin. Every other fact in Trevora is inferred
-- from a document and can be wrong: a category the classifier guessed, a
-- component attributed from a line of print, a date read off a photograph. This
-- is the one place the owner states something directly, and the value of it is
-- that nothing stands between what they typed and what the mechanic reads.
--
-- So there is no category, no component, no severity, no link to a service
-- record, and no diagnosis field. Each of those would be a second opinion
-- attached to a first-hand account, and 011's header records what happens when
-- an inference rides along beside a fact -- a can of degreaser became brake
-- work and the owner was shown a service they never had. A concern that says
-- "weird sound when turning left" must reach the mechanic as those six words.
--
-- resolved_at is the only state. It is nullable because most concerns are open,
-- and it is a timestamp rather than a boolean because "when did this stop being
-- a problem" is worth keeping and costs nothing.
--
-- Rows are never deleted on resolution. A concern that turned out to be the
-- brakes is worth reading next time the brakes are mentioned.
--
-- HOW TO RUN -- paste into the Supabase SQL Editor and press Run, or feed it to
-- psql. Safe to re-run.

begin;

create table if not exists public.concerns (
    concern_id uuid primary key default gen_random_uuid(),
    vehicle_id uuid not null references public.vehicle_profiles(vehicle_id) on delete cascade,
    -- Denormalised from the vehicle on purpose: every query in this codebase is
    -- owner-scoped, and carrying the owner here means a concern can be checked
    -- against the caller without joining through the vehicle first.
    owner_id uuid not null references public.users(user_id),
    note text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- Null means open. Set when the owner says a record covered it.
    resolved_at timestamptz
);

-- The only two reads this table has: a vehicle's concerns for the owner, and a
-- vehicle's OPEN concerns for a mechanic session. Both start from vehicle_id.
create index if not exists idx_concerns_vehicle_id
    on public.concerns(vehicle_id);

-- Open concerns for one vehicle, newest first — the mechanic view's only query.
create index if not exists idx_concerns_vehicle_open
    on public.concerns(vehicle_id, created_at desc)
    where resolved_at is null;

-- Fail-closed RLS, matching 006_enable_rls_lockdown.sql and every table since:
-- the backend connects via JDBC as the `postgres` role and bypasses RLS
-- regardless of policies, and the anon key must never reach this table. RLS on
-- with no policies is both sufficient and required.
--
-- It matters more here than on most tables. A concern is the owner writing
-- freely about their own car, with no expectation that anyone but a mechanic
-- they approved will read it.
alter table public.concerns enable row level security;

commit;

begin;

-- Which in-app tips an owner has already been shown.
--
-- One row per (owner, tip), written when a tip is dismissed. A tip that has a
-- row here is never shown to that account again.
--
-- Deliberately a table and not another column on `users`. The walkthrough is
-- one thing that happens once, so `walkthrough_completed_at` is one timestamp
-- and that is the right shape for it. Tips are a growing set: the point of the
-- feature is that a tip can be added later and shown once to accounts that
-- already exist. As columns that is a migration per tip forever; as rows it is
-- an entry in a frontend registry and nothing here changes.
--
-- `tip_key` is the frontend's own identifier ("add-vehicle-identity"), not a
-- foreign key to anything. There is no tips table on purpose: the copy, the
-- element it points at and the screen it belongs to are all frontend concerns,
-- and a database that also held them would have to be migrated in step with
-- every wording change. What the server owns is the fact that somebody has
-- seen it.
--
-- Retiring a tip means deleting it from the registry. The rows stay, cost
-- nothing, and mean a tip brought back later is still not re-shown to the
-- people who already dismissed it.

create table if not exists public.user_tips_seen (
    user_id uuid not null references public.users (user_id) on delete cascade,
    tip_key text not null,
    seen_at timestamptz not null default now(),
    primary key (user_id, tip_key)
);

-- The only read this table serves: every tip one owner has seen, on page load.
-- The primary key already covers it, so no separate index is needed.

-- Same fail-closed stance as every other table here: the backend reaches this
-- over JDBC as `postgres` and bypasses RLS, and the anon key must not be able
-- to read or write a row. See 006_enable_rls_lockdown.sql.
alter table public.user_tips_seen enable row level security;

comment on table public.user_tips_seen is
    'One row per tip an owner has dismissed. Presence means "do not show again". Tip copy and placement live in the frontend registry, not here.';

comment on column public.user_tips_seen.tip_key is
    'The frontend registry key for the tip, e.g. "add-vehicle-identity". Not a foreign key: nothing in the database describes a tip.';

-- Everyone who already has an account has already found their way around, so
-- the first-run guide is marked as seen for them. Without this, every existing
-- owner is walked through adding a vehicle the next time they sign in.
--
-- Only these eight keys. A tip added later is deliberately NOT backfilled --
-- that is the whole point of the table, and how a new feature gets announced
-- once to accounts that already exist.
insert into public.user_tips_seen (user_id, tip_key, seen_at)
select u.user_id, k.tip_key, now()
  from public.users u
 cross join (values
     ('add-vehicle-identity'),
     ('add-vehicle-photo'),
     ('input-method-choice'),
     ('receipt-capture'),
     ('voice-record'),
     ('manual-entry'),
     ('draft-review-confirm'),
     ('record-share')
 ) as k(tip_key)
    on conflict (user_id, tip_key) do nothing;

commit;

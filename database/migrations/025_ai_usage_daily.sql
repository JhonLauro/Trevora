begin;

-- 025: what paid AI calls cost, per UTC day, feature and caller; which receipt
-- uploads have already been paid for; and which accounts have been warned or
-- suspended for spamming them.
--
-- ============================================================== ai_usage_daily
--
-- Written by `AiSpendGuard` after every call to OpenAI or Google Vision, and read
-- before every one. Two limits are enforced from it:
--
--   * per caller, per day (TREVORA_AI_BUDGET_PER_USER_DAILY_USD). One account
--     spamming the app reaches its own limit and is paused alone; nobody else
--     notices. This is the limit that stops waste.
--   * for the whole app, per day and per month (TREVORA_AI_BUDGET_DAILY_USD,
--     TREVORA_AI_BUDGET_MONTHLY_USD). A backstop against a bug or a crowd of
--     throwaway accounts, set well above what normal use spends.
--
-- A table rather than counters in memory because the rate limiter's buckets
-- already live in memory and reset whenever the instance restarts -- on Render's
-- free tier, after every quiet quarter of an hour. A limit that forgets itself on
-- restart is not a limit.
--
-- `spender` is the caller the rate limiter identified: `user:<uuid>`, or
-- `session:<uuid>` / `token:<hash>` / `ip:<addr>` when there is no signed-in user,
-- or `unattributed`. Mechanic searches are charged to the owner of the vehicle.
--
-- `cost_micros` is an estimate in millionths of a US dollar from the provider's
-- reported token counts and the prices in `trevora.ai.price.*`. It is for limits
-- and alerts; the provider's billing page remains the record of what was charged.

create table if not exists public.ai_usage_daily (
    usage_date date not null,
    feature text not null,
    spender text not null default 'unattributed',
    calls bigint not null default 0,
    input_tokens bigint not null default 0,
    output_tokens bigint not null default 0,
    units bigint not null default 0,
    cost_micros bigint not null default 0,
    updated_at timestamptz not null default now(),
    primary key (usage_date, feature, spender)
);

create index if not exists ai_usage_daily_spender_idx
    on public.ai_usage_daily (spender, usage_date);

alter table public.ai_usage_daily enable row level security;

-- ================================================= receipt_upload_fingerprints
--
-- A hash of the exact pages of each receipt upload, so the same photos sent
-- again -- a double tap, a retry, someone hammering the button -- open the draft
-- they already made instead of paying Google Vision and OpenAI a second time.
-- Only an unconfirmed draft from the last 30 days is reused; once confirmed, or
-- deleted, the same photos are read afresh.
--
-- No foreign key to `service_drafts`, deliberately. The row is written in its own
-- transaction while the draft it names is still uncommitted, and a foreign key
-- would reject it. A row whose draft was deleted or never committed is harmless:
-- the lookup joins on `service_drafts` and simply finds nothing. The owner and
-- vehicle keys do cascade, so deleting either removes their rows.

create table if not exists public.receipt_upload_fingerprints (
    draft_id uuid primary key,
    fingerprint text not null,
    owner_id uuid not null references public.users (user_id) on delete cascade,
    vehicle_id uuid not null references public.vehicle_profiles (vehicle_id) on delete cascade,
    created_at timestamptz not null default now()
);

create index if not exists receipt_upload_fingerprints_lookup_idx
    on public.receipt_upload_fingerprints (owner_id, vehicle_id, fingerprint, created_at desc);

alter table public.receipt_upload_fingerprints enable row level security;

-- ============================================ account strikes and suspension
--
-- An account that keeps sending receipt uploads the rate limiter refuses -- the
-- receipt screen stops a person before that happens, so it is a script -- gets a
-- strike for each burst (`AbuseMonitor`): the first is a warning, the second a
-- final warning, the third suspends the account. Strikes are at least half an
-- hour apart and count for 30 days.
--
-- A suspended account is refused on every signed-in request, with the reason.
-- `suspended_at` and `suspension_reason` can also be set by hand to ban an
-- account. To lift a suspension, clear both columns and delete the account's
-- strikes, or the next burst suspends it again at once. The API caches the
-- answer for 30 seconds.

alter table public.users add column if not exists suspended_at timestamptz;
alter table public.users add column if not exists suspension_reason text;

create table if not exists public.account_strikes (
    strike_id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users (user_id) on delete cascade,
    feature text not null,
    level smallint not null check (level between 1 and 3),
    refused_requests integer not null,
    created_at timestamptz not null default now()
);

create index if not exists account_strikes_user_idx
    on public.account_strikes (user_id, created_at desc);

alter table public.account_strikes enable row level security;

commit;

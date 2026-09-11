begin;

-- What the app has spent on paid AI APIs, per UTC day and per feature.
--
-- Written by `AiSpendGuard` after every call to OpenAI or Google Vision, and
-- read before every one. It is the reason a single bug, a loop or a crowd of
-- throwaway accounts cannot turn into a surprise bill: once the day's or the
-- month's estimated spend reaches its limit (TREVORA_AI_BUDGET_DAILY_USD,
-- TREVORA_AI_BUDGET_MONTHLY_USD) every paid call is refused until the period
-- turns over.
--
-- A table rather than a counter in memory because the rate limiter's buckets
-- already live in memory, and they reset whenever the instance restarts --
-- which on Render's free tier is after every quiet quarter of an hour. A spend
-- ceiling that forgets itself on restart is not a ceiling.
--
-- `cost_micros` is an estimate in millionths of a US dollar, computed from the
-- token counts the provider returns and the list prices configured in
-- `trevora.ai.price.*`. It is for enforcement and alerting; the provider's own
-- billing page remains the record of what was actually charged.
--
-- One row per (day, feature), incremented in place, so the table grows by a
-- handful of rows a day however much traffic there is.

create table if not exists public.ai_usage_daily (
    usage_date date not null,
    feature text not null,
    calls bigint not null default 0,
    input_tokens bigint not null default 0,
    output_tokens bigint not null default 0,
    units bigint not null default 0,
    cost_micros bigint not null default 0,
    updated_at timestamptz not null default now(),
    primary key (usage_date, feature)
);

-- The backend's own connection is the only reader and writer. No policies:
-- nothing reaches this table through the Supabase client.
alter table public.ai_usage_daily enable row level security;

commit;

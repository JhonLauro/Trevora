-- 030_service_record_ai_feedback.sql
--
-- WHAT: Records owner feedback on AI-generated explanations ("Was this helpful?").
--
--   feedback_id   unique identifier for the feedback row
--   record_id     the service record whose explanation was rated
--   user_id       the vehicle owner who submitted the rating
--   helpful       true for thumbs-up, false for thumbs-down
--   reason        optional category if thumbs-down: INACCURATE, CONFUSING, TRANSLATION, OTHER
--   notes         optional freeform feedback notes
--   language      the interface language when the feedback was submitted (en, tl, ceb)
--   created_at    timestamp when feedback was first submitted
--   updated_at    timestamp when feedback was last updated
--
-- WHY A DEDICATED TABLE: An owner can change their vote (thumbs down -> thumbs up),
-- and feedback needs to be auditable per record and per user. Keeping it in its
-- own table preserves the immutability of service_records and service_record_explanations.
--
-- HOW TO RUN -- paste into the Supabase SQL Editor and press Run, or:
--   psql "$SUPABASE_DB_URL" -f database/migrations/030_service_record_ai_feedback.sql
-- Safe to re-run.

begin;

create table if not exists public.service_record_ai_feedback (
    feedback_id uuid primary key default gen_random_uuid(),
    record_id uuid not null
        references public.service_records (record_id) on delete cascade,
    user_id uuid not null
        references public.users (user_id) on delete cascade,
    helpful boolean not null,
    reason text,
    notes text,
    language text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint service_record_ai_feedback_record_user_unique unique (record_id, user_id),
    constraint service_record_ai_feedback_reason_check
        check (reason is null or reason in ('INACCURATE', 'CONFUSING', 'TRANSLATION', 'OTHER'))
);

create index if not exists idx_service_record_ai_feedback_user_id
    on public.service_record_ai_feedback (user_id);

-- Same fail-closed stance as every other table: backend reaches this over JDBC
-- as postgres and bypasses RLS; anon key cannot read or write rows.
alter table public.service_record_ai_feedback enable row level security;

comment on table public.service_record_ai_feedback is
    'Owner feedback (thumbs up / thumbs down and reasons) on AI plain-language explanations. One row per (record, owner).';

comment on column public.service_record_ai_feedback.helpful is
    'True for thumbs up (helpful), false for thumbs down (not helpful).';

comment on column public.service_record_ai_feedback.reason is
    'Category explaining negative feedback: INACCURATE, CONFUSING, TRANSLATION, or OTHER. Null for positive feedback.';

commit;

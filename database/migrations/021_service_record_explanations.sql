begin;

-- The model's explanation of a record, written once and kept.
--
-- Every open of the record page was a fresh chat completion. The record is
-- immutable in practice and the facts behind the explanation do not change, so
-- the second call bought a differently-worded answer to the same question at
-- the same price. On a shared key that is the whole budget going into rewrites
-- nobody asked for, and it is also why the panel took a few seconds every time.
--
-- Only model-written explanations live here. The template, the cost-only
-- answer and the failure fallback are computed from the record itself, cost
-- nothing, and are deliberately NOT cached: storing one would freeze a
-- stand-in answer in place, so a record explained by the template on the day
-- the API key was missing would keep reading that way forever.
--
-- facts_fingerprint is a SHA-256 of the exact prompt the model was given. It
-- is the invalidation rule: if anything the explanation was based on changes -
-- a corrected service type, an added part, a fixed date - the fingerprint
-- stops matching and the next view regenerates. Nothing has to remember to
-- clear this table, which is the only kind of cache invalidation that survives
-- contact with a codebase four people are changing.

create table if not exists public.service_record_explanations (
    record_id uuid primary key
        references public.service_records (record_id) on delete cascade,
    facts_fingerprint text not null,
    model text not null,
    what_was_done text not null,
    why_it_matters text not null,
    watch_for jsonb not null default '[]'::jsonb,
    generated_at timestamptz not null default now()
);

-- Same fail-closed stance as every other table here: the backend reaches this
-- over JDBC as `postgres` and bypasses RLS, and the anon key must not be able
-- to read a row. See 006_enable_rls_lockdown.sql.
alter table public.service_record_explanations enable row level security;

comment on table public.service_record_explanations is
    'One cached model-written explanation per confirmed service record. Regenerated only when facts_fingerprint stops matching the record. Template and fallback explanations are never stored.';

comment on column public.service_record_explanations.facts_fingerprint is
    'SHA-256 of the prompt the explanation was generated from. Cache key and invalidation rule in one: a changed record produces a different fingerprint and the next view regenerates.';

comment on column public.service_record_explanations.model is
    'The model that wrote this text, e.g. gpt-4o-mini. Kept so an oddly-worded explanation can be traced to the model that produced it rather than guessed at.';

comment on column public.service_record_explanations.watch_for is
    'JSON array of strings, the "what to watch for" items. Empty array, never null.';

commit;

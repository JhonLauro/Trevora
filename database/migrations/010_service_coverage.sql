-- 010_service_coverage.sql
--
-- Adds `amount_covered` to service_drafts and service_records.
--
-- Why it exists: a receipt shows what the service cost. It cannot show what
-- the owner actually paid, because insurance, an extended warranty or a casa
-- goodwill repair may have absorbed part or all of it. With one cost column,
-- "Total spent" was answering a question nobody had specified — some owners
-- would type the invoice total, some what they handed over, and the counter
-- summed the two together as if they were the same number.
--
-- The split:
--   total_cost      what the service cost. The invoice. Unchanged in meaning.
--   amount_covered  what insurance or a warranty absorbed. 0 when nothing did.
--
-- Out-of-pocket is deliberately NOT a column. It is total_cost minus
-- amount_covered, and storing it would be a third number free to contradict
-- the other two the moment either is edited.
--
-- A numeric rather than a boolean, because partial coverage is the common
-- case — a deductible paid on an otherwise covered repair. "Covered: yes" can
-- express neither "I paid the 5,000 excess" nor "they covered all of it".
--
-- DEFAULT 0 rather than NULL. Unlike validation_status in 009, "no coverage
-- recorded" and "nothing was covered" mean the same thing arithmetically —
-- both leave out-of-pocket equal to the invoice — so a null would buy a
-- distinction that no screen could act on. Existing rows are correct at 0.
--
-- The check constraints are the real point: a negative coverage is nonsense,
-- and coverage exceeding the invoice would drive out-of-pocket below zero and
-- silently reduce the spend counter. Drafts allow a null total_cost (they are
-- works in progress), so that case is exempted rather than rejected.
--
-- HOW TO RUN — paste into the Supabase SQL Editor and press Run, or feed it
-- to psql. Safe to re-run.

begin;

alter table public.service_drafts
    add column if not exists amount_covered numeric not null default 0;

alter table public.service_records
    add column if not exists amount_covered numeric not null default 0;

alter table public.service_drafts
    drop constraint if exists service_drafts_amount_covered_check;

-- total_cost is nullable on a draft, so only constrain the pair once both are
-- present. A draft is allowed to be incomplete; a record is not.
alter table public.service_drafts
    add constraint service_drafts_amount_covered_check
    check (
        amount_covered >= 0
        and (total_cost is null or amount_covered <= total_cost)
    );

alter table public.service_records
    drop constraint if exists service_records_amount_covered_check;

alter table public.service_records
    add constraint service_records_amount_covered_check
    check (amount_covered >= 0 and amount_covered <= total_cost);

comment on column public.service_drafts.amount_covered is
    'What insurance or a warranty absorbed of total_cost, in the same currency. 0 when nothing was covered. Out-of-pocket is total_cost - amount_covered and is never stored.';

comment on column public.service_records.amount_covered is
    'What insurance or a warranty absorbed of total_cost, in the same currency. 0 when nothing was covered. Out-of-pocket is total_cost - amount_covered and is never stored. Never exposed on mechanic-facing responses — a handoff needs the value of the work, not the owner''s insurance arrangements.';

commit;

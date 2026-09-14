-- 028_coverage_kind.sql
--
-- WHAT: coverage_kind on service_drafts and service_records -- who covered
-- amount_covered (migration 010).
--
--   INSURANCE  an insurer paid part or all of it
--   WARRANTY   a manufacturer or extended warranty paid it
--   GOODWILL   the shop or dealer absorbed it
--   OTHER      something else the owner can name but these don't
--   null       nothing is covered, or the owner is not sure
--
-- WHY. amount_covered was one number labelled "insurance or warranty". An
-- owner reading their history wants to know which: an insurance claim can
-- raise a premium, a warranty repair cannot, and a goodwill repair is neither.
-- The Palmetto 57 Nissan receipt prints LESS INSURANCE; until now the record
-- kept the 56.79 and lost the word.
--
-- WHY NO DISCOUNT. A discount is a lower bill, not coverage: total_cost is the
-- bill after it, and nothing is covered (ReceiptTotalResolver refuses to read a
-- LESS DISCOUNT row as coverage for the same reason). Offering it here would
-- invite owners to record discounts as coverage and understate what they paid.
--
-- SET BY. The receipt's totals box when every credit row names one kind
-- (INSURER counts as insurance); otherwise the owner on the review page.
-- Copied from draft to record at confirmation. Never on mechanic-facing
-- responses, like amount_covered itself.
--
-- EXISTING ROWS stay null ("not sure"). No backfill: nothing recorded which
-- kind an existing covered amount was.
--
-- HOW TO RUN -- paste into the Supabase SQL Editor and press Run, or:
--   psql "$SUPABASE_DB_URL" -f database/migrations/028_coverage_kind.sql
-- Safe to re-run. Apply BEFORE deploying the backend that reads these columns.

begin;

alter table public.service_drafts
    add column if not exists coverage_kind text;

alter table public.service_records
    add column if not exists coverage_kind text;

-- A kind with nothing covered would describe coverage that is not there.
alter table public.service_drafts
    drop constraint if exists service_drafts_coverage_kind_check;

alter table public.service_drafts
    add constraint service_drafts_coverage_kind_check
    check (coverage_kind is null
           or (coverage_kind in ('INSURANCE', 'WARRANTY', 'GOODWILL', 'OTHER') and amount_covered > 0));

alter table public.service_records
    drop constraint if exists service_records_coverage_kind_check;

alter table public.service_records
    add constraint service_records_coverage_kind_check
    check (coverage_kind is null
           or (coverage_kind in ('INSURANCE', 'WARRANTY', 'GOODWILL', 'OTHER') and amount_covered > 0));

comment on column public.service_drafts.coverage_kind is
    'Who covered amount_covered: INSURANCE, WARRANTY, GOODWILL or OTHER. Null when nothing is covered or the owner is not sure. No DISCOUNT: a discount is a lower bill, not coverage.';

comment on column public.service_records.coverage_kind is
    'Who covered amount_covered: INSURANCE, WARRANTY, GOODWILL or OTHER. Null when nothing is covered or the owner is not sure. Copied from the draft at confirmation. Never exposed on mechanic-facing responses.';

commit;

-- 009_service_record_validation_status.sql
--
-- Adds `validation_status` to service_records.
--
-- Why it exists: `service_drafts` has a status, confirmed `service_records`
-- did not. So the moment a draft became a record, the fact that a human had
-- checked the extracted fields was thrown away — and checking those fields is
-- Module 2, the project's entire answer to "can this data be trusted?".
--
-- The old dashboard papered over the gap by rendering `badgeClass('Validated')`
-- on every row unconditionally, which told owners their unverified records had
-- been verified. That is the one lie this product cannot afford.
--
-- Values:
--   VALIDATED     a human is accountable for the fields — either they typed
--                 them (manual entry) or they went through the correction
--                 step, or they later marked the record reviewed.
--   NEEDS_REVIEW  extracted by OCR or speech-to-text and confirmed without
--                 anyone correcting it. Not "wrong" — unverified.
--
-- NOT NULL with a NEEDS_REVIEW default, so existing rows backfill to the
-- honest answer without a separate UPDATE. Every record predating this column
-- has no evidence anyone reviewed it, and the pessimistic default is the safe
-- direction to be wrong in: nagging about a good record costs a moment,
-- vouching for a bad one costs the whole premise.
--
-- HOW TO RUN — paste into the Supabase SQL Editor and press Run, or feed it
-- to psql. Safe to re-run.

begin;

alter table public.service_records
    add column if not exists validation_status text not null default 'NEEDS_REVIEW';

alter table public.service_records
    drop constraint if exists service_records_validation_status_check;

alter table public.service_records
    add constraint service_records_validation_status_check
    check (validation_status in ('VALIDATED', 'NEEDS_REVIEW'));

comment on column public.service_records.validation_status is
    'Whether a human is accountable for this record''s fields. VALIDATED when entered manually, corrected during review, or marked reviewed by the owner; NEEDS_REVIEW when machine-extracted and confirmed untouched. Defaults to NEEDS_REVIEW — absence of evidence is not validation.';

commit;

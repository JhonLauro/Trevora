-- 011_service_line_entries.sql
--
-- Adds `service_draft_line_entries` and `service_record_line_entries`: one row
-- per printed line on the receipt, hanging off the service item it belongs to.
--
-- Why it exists. 007 split a visit into service items and gave each item two
-- free-text buckets: parts_replaced and labor_performed. A real invoice has
-- three kinds of line, not two. This one is a Toyota body-and-paint job:
--
--   SRA/FIX, PAINTING JOB, CBWS ............... operations the shop performed
--   FLOORMAT-BP, PLASTIC COVER SET ............ genuine parts fitted
--   degreaser, thinner, masking paper, waste
--   pad, body filler, rubbing compound ........ shop materials consumed
--
-- With two buckets the third kind has nowhere to go, so every consumable was
-- stored as a replaced part. That is not a cosmetic problem. Three separate
-- consumers keyword-match those strings -- the parts map, the AI explanation
-- and the spend category -- and on the invoice above every one of them read
-- "WASTE PAD" as brake work. The owner was shown a green Brakes marker and an
-- explanation about stopping distance, for a scratch repair.
--
-- The rule this table exists to make expressible: component attribution comes
-- from the operation, never from the materials. A can of thinner says nothing
-- about which part of the car was serviced. Splitting the lines by kind is
-- what lets a reader ask only the lines that can answer.
--
-- Kinds:
--   OPERATION  labour the shop performed. The only kind that says which part
--              of the vehicle was worked on.
--   PART       a component fitted to the vehicle and still on it afterwards.
--   MATERIAL   consumed doing the work and not part of the vehicle -- paint,
--              thinner, tape, cleaner, rags, filler.
--   FEE        charged but neither: disposal, shop supplies, towing,
--              diagnostic charges.
--
-- FEE is deliberately present. Without it a "shop supplies charge" is either a
-- fake material or dropped, and dropping priced lines means the entries can
-- never be reconciled against the invoice total.
--
-- part_code holds the shop's own identifier -- Toyota's OPERATION CODE/PART NO.
-- column (52099, TTY-DEGREASER, T2990-YZA12). It is the most reliable string
-- on the line, being printed rather than described, and it is what a later
-- parts lookup would key on.
--
-- quantity is numeric(12,3) because these invoices bill materials in fractions
-- (1.600 litres of paint, 0.300 of thinner), not whole units.
--
-- line_total is stored rather than computed from quantity * unit_price. On a
-- real receipt the printed total is occasionally not the product of the other
-- two -- rounding, a line discount, a bundled price -- and the printed number
-- is the fact. Recomputing it would quietly overwrite what the invoice says.
--
-- These tables are additive. parts_replaced and labor_performed stay on the
-- item tables for now, because the review, correction, detail and explanation
-- screens still read them; they are dropped once those readers move over. The
-- backfill below keeps the two in step for rows written before this migration.
--
-- HOW TO RUN -- paste into the Supabase SQL Editor and press Run, or feed it
-- to psql. Safe to re-run.

begin;

create table if not exists public.service_draft_line_entries (
    entry_id uuid primary key default gen_random_uuid(),
    item_id uuid not null references public.service_draft_items(item_id) on delete cascade,
    kind text not null,
    description text not null,
    part_code text,
    quantity numeric(12, 3),
    unit_price numeric(12, 2),
    line_total numeric(12, 2),
    sort_order integer not null default 0,
    field_metadata jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.service_record_line_entries (
    entry_id uuid primary key default gen_random_uuid(),
    item_id uuid not null references public.service_record_items(item_id) on delete cascade,
    kind text not null,
    description text not null,
    part_code text,
    quantity numeric(12, 3),
    unit_price numeric(12, 2),
    line_total numeric(12, 2),
    sort_order integer not null default 0,
    field_metadata jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.service_draft_line_entries
    drop constraint if exists service_draft_line_entries_kind_check;

alter table public.service_draft_line_entries
    add constraint service_draft_line_entries_kind_check
    check (kind in ('OPERATION', 'PART', 'MATERIAL', 'FEE'));

alter table public.service_record_line_entries
    drop constraint if exists service_record_line_entries_kind_check;

alter table public.service_record_line_entries
    add constraint service_record_line_entries_kind_check
    check (kind in ('OPERATION', 'PART', 'MATERIAL', 'FEE'));

create index if not exists idx_service_draft_line_entries_item_id
    on public.service_draft_line_entries(item_id);

create index if not exists idx_service_record_line_entries_item_id
    on public.service_record_line_entries(item_id);

-- Backfill. Each existing item's two text buckets become one entry each, held
-- whole rather than split on commas: "brake pads, rotors" is probably two
-- parts, but "cleaner, degreaser and rags" is not, and guessing which is which
-- would invent structure the old column never carried.
--
-- labor_performed becomes OPERATION and parts_replaced becomes PART, which
-- restates exactly the claim the old columns were already making. Where that
-- claim was wrong -- a consumable filed as a part -- it stays wrong until a
-- human corrects it. Silently re-sorting old rows by keyword would be the same
-- guess that caused this bug, applied to data nobody is checking.
--
-- Guarded on the item having no entries yet, so a re-run is a no-op rather
-- than a second copy.

insert into public.service_draft_line_entries (item_id, kind, description, sort_order)
select i.item_id, 'OPERATION', i.labor_performed, 0
from public.service_draft_items i
where i.labor_performed is not null
  and length(trim(i.labor_performed)) > 0
  and not exists (
      select 1 from public.service_draft_line_entries e where e.item_id = i.item_id
  );

insert into public.service_draft_line_entries (item_id, kind, description, sort_order)
select i.item_id, 'PART', i.parts_replaced, 1
from public.service_draft_items i
where i.parts_replaced is not null
  and length(trim(i.parts_replaced)) > 0
  and not exists (
      select 1 from public.service_draft_line_entries e
      where e.item_id = i.item_id and e.kind = 'PART'
  );

insert into public.service_record_line_entries (item_id, kind, description, sort_order)
select i.item_id, 'OPERATION', i.labor_performed, 0
from public.service_record_items i
where i.labor_performed is not null
  and length(trim(i.labor_performed)) > 0
  and not exists (
      select 1 from public.service_record_line_entries e where e.item_id = i.item_id
  );

insert into public.service_record_line_entries (item_id, kind, description, sort_order)
select i.item_id, 'PART', i.parts_replaced, 1
from public.service_record_items i
where i.parts_replaced is not null
  and length(trim(i.parts_replaced)) > 0
  and not exists (
      select 1 from public.service_record_line_entries e
      where e.item_id = i.item_id and e.kind = 'PART'
  );

comment on table public.service_draft_line_entries is
    'One printed line of an unconfirmed receipt, under the service item it belongs to. kind separates operations, which say what was worked on, from parts, materials and fees, which do not.';

comment on table public.service_record_line_entries is
    'One printed line of a confirmed receipt, under the service item it belongs to. kind separates operations, which say what was worked on, from parts, materials and fees, which do not.';

comment on column public.service_draft_line_entries.kind is
    'OPERATION = labour performed; PART = component fitted and still on the vehicle; MATERIAL = consumed doing the work; FEE = charged but neither. Only OPERATION may drive component attribution.';

comment on column public.service_record_line_entries.kind is
    'OPERATION = labour performed; PART = component fitted and still on the vehicle; MATERIAL = consumed doing the work; FEE = charged but neither. Only OPERATION may drive component attribution.';

comment on column public.service_draft_line_entries.line_total is
    'The total printed on the receipt, not quantity * unit_price. Where the invoice disagrees with the arithmetic, the invoice is the fact.';

comment on column public.service_record_line_entries.line_total is
    'The total printed on the receipt, not quantity * unit_price. Where the invoice disagrees with the arithmetic, the invoice is the fact.';

-- Fail-closed RLS, matching 006 and 007: the backend connects via JDBC as the
-- postgres role and bypasses RLS regardless of policies, and the anon key must
-- never reach these tables. Enabling RLS with no policies is sufficient, and
-- required.
alter table public.service_draft_line_entries enable row level security;
alter table public.service_record_line_entries enable row level security;

commit;

-- Splits the flat, single service_type column on service_drafts/service_records
-- into per-visit line item child tables, so one shop visit can record multiple
-- distinct services (e.g. "oil change" + "tire rotation" + "brake pads") instead
-- of jamming them all into one free-text column. Also gives service_type a
-- real, queryable location (still free text here; ServiceClassificationService
-- resolves it into service_category, backed by ALLOWED_SERVICE_CATEGORIES).
--
-- Header rows (service_drafts / service_records) keep total_cost, shop_name,
-- location, odometer, service_date, remarks -- those are true once per visit
-- regardless of how many services were performed. total_cost is intentionally
-- NOT summed from line items; line_cost is optional/informational only.
--
-- parts_replaced / labor_performed / service_type move to the item tables,
-- since they are properties of an individual service, not the whole visit.

create table if not exists service_draft_items (
    item_id uuid primary key default gen_random_uuid(),
    draft_id uuid not null references service_drafts(draft_id) on delete cascade,
    service_type text not null,
    service_category text,
    parts_replaced text,
    labor_performed text,
    line_cost numeric(12, 2),
    sort_order integer not null default 0,
    field_metadata jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists service_record_items (
    item_id uuid primary key default gen_random_uuid(),
    record_id uuid not null references service_records(record_id) on delete cascade,
    service_type text not null,
    service_category text,
    parts_replaced text,
    labor_performed text,
    line_cost numeric(12, 2),
    sort_order integer not null default 0,
    field_metadata jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Backfill: carry every existing row's scalar service_type/parts_replaced/
-- labor_performed/field_metadata into a single item row (sort_order = 0)
-- before those columns are dropped below.
insert into service_draft_items (
    draft_id, service_type, parts_replaced, labor_performed, field_metadata, sort_order
)
select
    draft_id,
    coalesce(service_type, 'Unspecified'),
    parts_replaced,
    labor_performed,
    field_metadata,
    0
from service_drafts
where service_type is not null
   or parts_replaced is not null
   or labor_performed is not null;

insert into service_record_items (
    record_id, service_type, parts_replaced, labor_performed, field_metadata, sort_order
)
select
    record_id,
    coalesce(service_type, 'Unspecified'),
    parts_replaced,
    labor_performed,
    field_metadata,
    0
from service_records
where service_type is not null
   or parts_replaced is not null
   or labor_performed is not null;

-- Drop the now-migrated scalar columns from the header tables.
alter table service_drafts drop column if exists service_type;
alter table service_drafts drop column if exists parts_replaced;
alter table service_drafts drop column if exists labor_performed;

alter table service_records drop column if exists service_type;
alter table service_records drop column if exists parts_replaced;
alter table service_records drop column if exists labor_performed;

create index if not exists idx_service_draft_items_draft_id
    on service_draft_items(draft_id);

create index if not exists idx_service_record_items_record_id
    on service_record_items(record_id);

-- Fail-closed RLS, matching the convention in 006_enable_rls_lockdown.sql:
-- the backend connects via JDBC as the `postgres` role and bypasses RLS
-- regardless of policies; the anon key must never reach these tables, so
-- enabling RLS with no policies is sufficient (and required).
alter table service_draft_items enable row level security;
alter table service_record_items enable row level security;

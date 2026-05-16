create table if not exists service_records (
    record_id uuid primary key default gen_random_uuid(),
    draft_id uuid not null unique references service_drafts(draft_id),
    vehicle_id uuid not null references vehicle_profiles(vehicle_id),
    owner_id uuid not null references users(user_id),
    source_input_method text not null check (source_input_method in ('MANUAL', 'RECEIPT', 'VOICE')),
    service_date date not null,
    service_type text not null,
    odometer integer,
    total_cost numeric(12, 2) not null,
    shop_name text,
    location text,
    parts_replaced text,
    labor_performed text,
    remarks text,
    field_metadata jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table service_drafts drop constraint if exists service_drafts_status_check;
alter table service_drafts
    add constraint service_drafts_status_check
    check (status in ('DRAFT', 'READY_FOR_REVIEW', 'CONFIRMED'));

create index if not exists idx_service_records_owner_id
    on service_records(owner_id);

create index if not exists idx_service_records_vehicle_id
    on service_records(vehicle_id);

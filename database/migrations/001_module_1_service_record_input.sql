create extension if not exists pgcrypto;

create table if not exists users (
    user_id uuid primary key,
    full_name text not null,
    email text not null unique,
    role text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table users add column if not exists full_name text;
alter table users add column if not exists email text;
alter table users add column if not exists role text;
alter table users add column if not exists updated_at timestamptz not null default now();

update users
set full_name = coalesce(full_name, 'Module 1 Mock Owner'),
    email = coalesce(email, 'user-' || user_id || '@trevora.local'),
    role = coalesce(role, 'OWNER'),
    updated_at = now()
where full_name is null
   or email is null
   or role is null;

alter table users alter column full_name set not null;
alter table users alter column email set not null;
alter table users alter column role set not null;

create unique index if not exists idx_users_email
    on users(email);

insert into users (user_id, full_name, email, role)
values (
    '00000000-0000-0000-0000-000000000001',
    'Module 1 Mock Owner',
    'module1-owner@trevora.local',
    'OWNER'
)
on conflict (user_id) do update
set full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role,
    updated_at = now();

create table if not exists vehicle_profiles (
    vehicle_id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references users(user_id),
    make text not null,
    model text not null,
    model_year integer,
    nickname text,
    plate_number text,
    vin_chassis_number text,
    odometer integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table vehicle_profiles add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_vehicle_profiles_owner_id
    on vehicle_profiles(owner_id);

create table if not exists service_drafts (
    draft_id uuid primary key default gen_random_uuid(),
    vehicle_id uuid not null references vehicle_profiles(vehicle_id),
    owner_id uuid not null references users(user_id),
    input_method text not null check (input_method in ('MANUAL', 'RECEIPT', 'VOICE')),
    service_date date,
    service_type text,
    odometer integer,
    total_cost numeric(12, 2),
    shop_name text,
    location text,
    parts_replaced text,
    labor_performed text,
    remarks text,
    status text not null check (status in ('DRAFT', 'READY_FOR_REVIEW')),
    field_metadata jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table service_drafts alter column service_date drop not null;
alter table service_drafts alter column service_type drop not null;
alter table service_drafts alter column total_cost drop not null;
alter table service_drafts add column if not exists updated_at timestamptz not null default now();

alter table service_drafts drop constraint if exists service_drafts_status_check;
alter table service_drafts
    add constraint service_drafts_status_check
    check (status in ('DRAFT', 'READY_FOR_REVIEW'));

create index if not exists idx_service_drafts_owner_id
    on service_drafts(owner_id);

create index if not exists idx_service_drafts_vehicle_id
    on service_drafts(vehicle_id);

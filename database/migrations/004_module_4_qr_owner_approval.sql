create table if not exists qr_access_requests (
    qr_access_request_id uuid primary key default gen_random_uuid(),
    vehicle_id uuid not null references vehicle_profiles(vehicle_id),
    owner_id uuid not null references users(user_id),
    access_token text not null unique,
    status text not null check (status in ('ACTIVE', 'REQUESTED', 'APPROVED', 'DENIED', 'EXPIRED')),
    expires_at timestamptz not null,
    used_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_qr_access_requests_owner_id
    on qr_access_requests(owner_id);

create index if not exists idx_qr_access_requests_vehicle_id
    on qr_access_requests(vehicle_id);

create index if not exists idx_qr_access_requests_access_token
    on qr_access_requests(access_token);

create table if not exists mechanic_access_requests (
    mechanic_access_request_id uuid primary key default gen_random_uuid(),
    qr_access_request_id uuid not null references qr_access_requests(qr_access_request_id),
    vehicle_id uuid not null references vehicle_profiles(vehicle_id),
    owner_id uuid not null references users(user_id),
    mechanic_id uuid references users(user_id),
    mechanic_name text not null,
    shop_name text,
    contact_info text,
    reason text,
    status text not null check (status in ('PENDING', 'APPROVED', 'DENIED')),
    requested_at timestamptz not null default now(),
    decided_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_mechanic_access_requests_owner_id
    on mechanic_access_requests(owner_id);

create index if not exists idx_mechanic_access_requests_qr_id
    on mechanic_access_requests(qr_access_request_id);

create index if not exists idx_mechanic_access_requests_status
    on mechanic_access_requests(status);

create table if not exists mechanic_access_sessions (
    mechanic_access_session_id uuid primary key default gen_random_uuid(),
    mechanic_access_request_id uuid not null references mechanic_access_requests(mechanic_access_request_id),
    vehicle_id uuid not null references vehicle_profiles(vehicle_id),
    owner_id uuid not null references users(user_id),
    mechanic_id uuid references users(user_id),
    session_token text not null unique,
    permission text not null check (permission = 'READ_ONLY'),
    status text not null check (status in ('APPROVED', 'EXPIRED', 'REVOKED')),
    approved_at timestamptz not null default now(),
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_mechanic_access_sessions_request_id
    on mechanic_access_sessions(mechanic_access_request_id);

create index if not exists idx_mechanic_access_sessions_token
    on mechanic_access_sessions(session_token);

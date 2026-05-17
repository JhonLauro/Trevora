alter table users
    add column if not exists password_hash text;

update users
set role = 'VEHICLE_OWNER',
    updated_at = now()
where user_id = '00000000-0000-0000-0000-000000000001'
  and role = 'OWNER';

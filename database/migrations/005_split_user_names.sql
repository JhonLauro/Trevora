begin;

alter table public.users
    add column if not exists first_name text;

alter table public.users
    add column if not exists last_name text;

update public.users
set first_name = coalesce(
        nullif(first_name, ''),
        nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), ''),
        'User'
    ),
    last_name = coalesce(
        nullif(last_name, ''),
        nullif(regexp_replace(trim(full_name), '^\S+\s*', ''), ''),
        ''
    ),
    full_name = trim(
        coalesce(
            nullif(first_name, ''),
            nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), ''),
            'User'
        )
        || ' '
        || coalesce(
            nullif(last_name, ''),
            nullif(regexp_replace(trim(full_name), '^\S+\s*', ''), ''),
            ''
        )
    ),
    updated_at = now()
where first_name is null
   or last_name is null;

alter table public.users
    alter column first_name set not null;

alter table public.users
    alter column last_name set not null;

update auth.users auth_user
set raw_user_meta_data =
    coalesce(auth_user.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object(
        'first_name', app_user.first_name,
        'last_name', app_user.last_name,
        'full_name', trim(app_user.first_name || ' ' || app_user.last_name),
        'name', trim(app_user.first_name || ' ' || app_user.last_name),
        'role', app_user.role
    ),
    updated_at = now()
from public.users app_user
where lower(auth_user.email) = lower(app_user.email);

commit;

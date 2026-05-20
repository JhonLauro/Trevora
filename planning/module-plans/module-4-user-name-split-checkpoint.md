# Module 4 User Name Split Checkpoint

Last updated: May 20, 2026

## 1. Status Summary

The MVP auth/profile name model now supports separate first and last names while keeping `fullName` / `full_name` as a compatibility display field.

This checkpoint covers the small cross-cutting auth/profile update only. It does not change service records, vehicle history, QR approval, mechanic access, or AI explanation behavior.

## 2. Backend Changes

Updated auth/user code so registration accepts:

- `firstName`
- `lastName`
- `email`
- `password`
- `role`

The backend `User` entity now maps:

- `first_name`
- `last_name`
- `full_name`

`fullName` remains in API responses as a derived display name so older frontend code and stored browser sessions do not break immediately.

## 3. Frontend Changes

Registration now shows separate fields:

- First name
- Last name

Account settings already had separate first/last name controls, and now stores both fields in local auth state. Sidebar display uses a shared display-name helper that prefers `firstName + lastName`, then falls back to `fullName`, then demo labels.

## 4. Database Changes

Added migration:

- `database/migrations/005_split_user_names.sql`

The migration:

- Adds `public.users.first_name`.
- Adds `public.users.last_name`.
- Backfills existing users from `public.users.full_name`.
- Keeps `public.users.full_name` for compatibility.
- Syncs Supabase Auth `auth.users.raw_user_meta_data` with `first_name`, `last_name`, `full_name`, `name`, and `role`.

## 5. Compatibility Behavior

Existing users with only `full_name` are backfilled into first/last names.

Example:

- `Juan Santos` becomes `first_name = Juan`, `last_name = Santos`.
- `Benz Julius Gamallo` becomes `first_name = Benz`, `last_name = Julius Gamallo`.

This is intentionally conservative. Users can correct their names later through profile editing once backend persistence for account settings is expanded.

## 6. Verification

Completed:

- Backend `.\mvnw.cmd test` passed.
- Frontend `npm run build` passed.
- Browser checked `/register`; it shows `First name` and `Last name`, and no longer shows `Full name`.

## 7. Remaining Notes

The database migration must be applied in Supabase before running the updated backend against the shared database, because the JPA entity now expects `first_name` and `last_name`.

The app still keeps `full_name` for now. Dropping it should be a later cleanup only after all teammates confirm no code, SQL, or demo data depends on it.

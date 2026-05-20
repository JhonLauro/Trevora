# Module 4 Supabase Auth and User Name Split Checkpoint

Last updated: May 20, 2026

## 1. Status Summary

The MVP auth/profile flow now uses Supabase Authentication for real account registration and login. The app profile model also supports separate first and last names while keeping `fullName` / `full_name` as a compatibility display field.

This checkpoint covers the cross-cutting auth/profile update only. It does not change service records, vehicle history, QR approval, mechanic access, or AI explanation behavior.

## 2. Backend Changes

Updated auth/user code so profile sync accepts:

- `firstName`
- `lastName`
- `role`

The backend `User` entity now maps:

- `first_name`
- `last_name`
- `full_name`

`fullName` remains in API responses as a derived display name so older frontend code and stored browser sessions do not break immediately.

Added Supabase Auth verification support:

- Backend reads `Authorization: Bearer <supabase_access_token>`.
- Backend verifies the token against Supabase Auth `/auth/v1/user`.
- `CurrentUserService` prefers the verified Supabase user and falls back to demo headers for existing MVP demo flows.
- `POST /api/auth/sync` mirrors the verified Supabase Auth user into `public.users`.
- Sync is idempotent by Supabase user ID and by email, so older local `public.users` rows are updated instead of causing duplicate email errors.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are required runtime environment variables and are not hardcoded in `application.properties`.

## 3. Frontend Changes

Registration now shows separate fields:

- First name
- Last name

The frontend now uses `@supabase/supabase-js` for:

- `supabase.auth.signUp`
- `supabase.auth.signInWithPassword`

Signup sends Supabase Auth metadata:

- `first_name`
- `last_name`
- `full_name`
- `name`
- `role`

After Supabase returns a session, the frontend calls backend `/api/auth/sync` to create or update the matching `public.users` row.

Account settings already had separate first/last name controls, and now stores both fields in local auth state. Sidebar display uses a shared display-name helper that prefers `firstName + lastName`, then falls back to `fullName`, then demo labels.

User-facing auth errors were cleaned up:

- Email verification state no longer says "Supabase Auth".
- Supabase email rate limit errors are shown as a professional retry message.
- Duplicate email database errors are masked as a normal "account already exists" message.

## 4. Database Changes

Added migration:

- `database/migrations/005_split_user_names.sql`

The migration:

- Adds `public.users.first_name`.
- Adds `public.users.last_name`.
- Backfills existing users from `public.users.full_name`.
- Keeps `public.users.full_name` for compatibility.
- Syncs Supabase Auth `auth.users.raw_user_meta_data` with `first_name`, `last_name`, `full_name`, `name`, and `role`.

Supabase dashboard settings for development:

- Email provider must be enabled.
- Email signups must be enabled.
- Confirm email can be disabled for demo/testing to avoid Supabase email sender rate limits.

## 5. Compatibility Behavior

Existing users with only `full_name` are backfilled into first/last names.

Example:

- `Juan Santos` becomes `first_name = Juan`, `last_name = Santos`.
- `Benz Julius Gamallo` becomes `first_name = Benz`, `last_name = Julius Gamallo`.

This is intentionally conservative. Users can correct their names later through profile editing once backend persistence for account settings is expanded.

Existing `public.users` rows with the same email as a newly created Supabase Auth user are updated during sync. This prevents duplicate `users_email_key` failures when a test account was previously created through Trevora's old custom auth path.

## 6. Verification

Completed:

- Backend `.\mvnw.cmd test` passed.
- Frontend `npm run build` passed.
- Browser checked `/register`; it shows `First name` and `Last name`, and no longer shows `Full name`.
- Supabase Auth signup path reached Supabase and exposed provider configuration issues during manual testing:
  - Email confirmation rate limit.
  - Email signups disabled.
  - Existing `public.users` duplicate email row.
- The app now handles those states with safer behavior and cleaner messages.

## 7. Remaining Notes

The database migration must be applied in Supabase before running the updated backend against the shared database, because the JPA entity expects `first_name` and `last_name`.

The app still keeps `full_name` for now. Dropping it should be a later cleanup only after all teammates confirm no code, SQL, or demo data depends on it.

Do not commit Supabase keys. Run locally with environment variables:

- Backend: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

# Module 4 Auth Foundation Checkpoint

Last updated: May 17, 2026

## 1. Auth Foundation Status Summary

Module 4 Person A auth foundation is implemented as an MVP. It adds login/register, user roles, password hashing, current-user request-header handling, and mock owner fallback compatibility.

The work stays within Person A scope. It does not implement AI explanation, QR/share access, owner approval, mechanic read-only shared history, or mechanic search.

## 2. Login/Register Behavior

Backend endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Create a `VEHICLE_OWNER` or `MECHANIC` user |
| `POST` | `/api/auth/login` | Validate email/password and return user identity |
| `GET` | `/api/auth/me` | Resolve the current user from request headers or fallback |

Register creates a user with:

- `userId`
- `fullName`
- `email`
- `passwordHash`
- `role`
- `createdAt`
- `updatedAt`

Passwords are hashed with PBKDF2 and are not stored as plain text. Login returns `userId`, `fullName`, `email`, and normalized `role`.

## 3. Supported Roles

- `VEHICLE_OWNER`
- `MECHANIC`
- `ADMIN` placeholder

## 4. Current-User Resolution Behavior

Current user resolution is handled by `CurrentUserService`.

Resolution order:

1. Read `X-User-Id` and `X-User-Role` request headers.
2. If headers are valid, use that current user.
3. If headers are missing or invalid, fall back to the mock owner.

The frontend stores the logged-in MVP user in localStorage and sends:

- `X-User-Id`
- `X-User-Role`

If no logged-in user exists, the frontend can use the demo user fallback.

## 5. Mock Owner Fallback Behavior

Missing or invalid current-user headers fall back to:

- userId: `00000000-0000-0000-0000-000000000001`
- role: `VEHICLE_OWNER`

This preserves Modules 1-3 development behavior.

## 6. Backend Auth Endpoints

Implemented by:

- `AuthController`
- `AuthService`
- `PasswordHashingService`
- `UserRepository`

Auth exceptions are handled through `GlobalExceptionHandler`.

## 7. Frontend Auth Routes/Pages

Routes:

- `/login`
- `/register`
- `/mechanic`

Frontend pieces:

- `LoginPage`
- `RegisterPage`
- `MechanicPlaceholderPage`
- `api/auth.js`
- localStorage auth state in `api/currentUser.js`
- logout action in `AppShell`

## 8. Database Migration Changes

Migration:

- `database/migrations/003_module_4_auth_foundation.sql`

Changes:

- Adds `users.password_hash`.
- Normalizes the existing mock owner role from `OWNER` to `VEHICLE_OWNER`.
- Preserves the existing mock owner user, vehicles, drafts, and service records.

## 9. Role Restrictions Implemented

Vehicle-owner role is required in backend services for owner workflows:

- creating vehicles
- fetching owner vehicles
- verifying vehicle ownership through owner APIs
- creating service drafts
- reviewing/validating drafts
- correcting drafts
- confirming service records
- viewing owner service history

Mechanic users are blocked in backend services, not only hidden in the frontend.

## 10. Compatibility With Modules 1-3

Modules 1-3 remain compatible through mock owner fallback and owner-scoped headers.

Owner users can still use:

- Module 1 vehicle and service draft flows
- Module 2 review/correction/confirmation flows
- Module 3 confirmed service history flows

Mechanic users do not get direct owner workflow access.

## 11. Known MVP Limitations

- This is not production authentication.
- There is no token/session signature yet.
- The frontend stores user identity in localStorage for MVP only.
- Header-based identity is trusted for MVP.
- Existing mock owner cannot password-login unless a password hash is later assigned.
- Supabase must have migration `003_module_4_auth_foundation.sql` applied before running the updated backend with schema validation.
- Runtime register/login verification was not completed in this Codex session because Supabase env vars, `psql`, and JDK 21 were not available to the tool process.

## 12. Notes For Persons B, C, And D

Person B:

- Use confirmed `service_records` for AI explanation.
- Use `CurrentUserService` for owner context.

Person C:

- Build QR/share access and owner approval on top of real owner/mechanic roles.
- Do not bypass `CurrentUserService`.

Person D:

- Mechanic history/search must use approved access sessions only.
- Do not use owner history APIs directly for mechanic access.
- Continue using confirmed `service_records`, never incomplete `service_drafts`.

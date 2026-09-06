# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Trevora is a web-based vehicle service history system for service understanding and mechanic handoff. Frontend: React (JavaScript) + Vite. Backend: Spring Boot modular monolith. Database/Auth/Storage: Supabase.

## Commands

Backend (from `backend/trevora-api`):
```
./mvnw spring-boot:run     # run API on http://localhost:8080 (mvnw.cmd on Windows)
./mvnw test                # run all backend tests
./mvnw test -Dtest=ClassName#methodName   # run a single test
```

Frontend (from `frontend/trevora-web`):
```
npm install
npm run dev       # dev server on http://localhost:5173
npm run build     # production build (vite build)
npm run preview
```

Backend requires these env vars set before running (do not commit real values):
`SUPABASE_DB_URL`, `SUPABASE_DB_USERNAME`, `SUPABASE_DB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

Frontend requires `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Database migrations live in `database/migrations/*.sql` and are applied directly to Supabase/Postgres.

## Workspace layout and where to read first

Each top-level workspace has its own `CONTEXT.md` with rules and current module scope — read it before working in that area:

- `/planning` — SRS, SDD, module plans, architecture decisions (`planning/module-plans/`)
- `/backend` — Spring Boot API (`backend/CONTEXT.md`, code in `backend/trevora-api`)
- `/frontend` — React app (`frontend/CONTEXT.md`, code in `frontend/trevora-web`)
- `/database` — schema/migrations (`database/CONTEXT.md`)
- `/docs` — API contracts and implementation notes

## Backend architecture

Feature-based packaging (modular monolith) rooted at `com.trevora.api`, strict layering: **Controller → Service → Repository → Domain Model/Entity**.

- Controllers only handle HTTP request/response — no business logic.
- Services hold business rules and access checks (not controllers).
- Repositories handle persistence.
- Do not reintroduce top-level layered packages (`controller`, `service`, `repository`, `model`, `dto`, `enums`) — each feature package owns its own controller/service/repository/entity/DTO/enum classes.

Feature packages under `features.*`:

| Package | Responsibility |
|---|---|
| `auth` | Supabase Auth token verification, profile sync (`/api/auth/sync`), login/register fallback, users, roles, current-user resolution |
| `vehicle` | Vehicle profile ownership, creation, listing, retrieval |
| `serviceinput` | Module 1: service draft creation from manual, receipt, voice input |
| `validation` | Module 2: draft review, validation, correction |
| `servicerecord` | Confirming validated drafts into confirmed `service_records` |
| `history` | Module 3: confirmed vehicle service history APIs |
| `ai` | Module 4: AI/template explanation for confirmed records |
| `sharing` | QR/share access request creation, owner approval, denial, expiration |
| `mechanicaccess` | Mechanic temporary read-only history access and mechanic search |

Shared cross-cutting code lives under `shared.*` (`config`, `exception`, `security`, `util`).

**Current user resolution** (used across auth-aware endpoints): the Supabase bearer token, and nothing else. `CurrentUserService` delegates to `SupabaseAuthService`, which reads only the `Authorization: Bearer ...` header; a request without a valid token is rejected with "Sign in is required for this action." The older demo-header (`X-User-Id`/`X-User-Role`) and mock-owner (`00000000-...-0001`) fallbacks were removed — do not reintroduce them. Local development signs in with a real Supabase account.

## Frontend architecture

Vite + React Router SPA. Key directories under `frontend/trevora-web/src`:

- `api/` — one module per backend resource (`vehicles.js`, `serviceDrafts.js`, `serviceHistory.js`, `auth.js`, `qrAccess.js`, `mechanicAccess.js`, `aiExplanations.js`, `receiptStorage.js`), plus `http.js` (request helper) and `supabaseClient.js`.
- `pages/` — one component per route/screen.
- `components/` — shared UI (`AppShell.jsx` is the main layout/sidebar shell; `AuthLayout.jsx` for auth screens).
- `utils/` — small helpers (e.g. `serviceText.js`).

Authenticated requests must carry the Supabase bearer token (`Authorization: Bearer ...`) — that is the only thing the backend authenticates on. The `X-User-Id`/`X-User-Role` headers are still sent but are now ignored server-side; they are vestigial, not a fallback.

## Core domain model and invariants

- One `User` (owner) owns many `vehicle_profiles`; one `vehicle_profile` has many `service_records`.
- `service_drafts` (Module 1/2, unconfirmed/in-progress) are distinct from confirmed `service_records` (Module 2 output, Module 3+ source of truth). **Never expose or display incomplete `service_drafts` as service history** — this rule is repeated throughout the codebase's CONTEXT.md files and must be preserved in any feature touching history, AI explanation, sharing, or mechanic access.
- `service_records.draft_id` preserves traceability back to the originating draft.
- Supported MVP account roles: `VEHICLE_OWNER` and `ADMIN`. Mechanics are never registered users — they get temporary, owner-approved, single-vehicle-scoped read-only access via QR/share tokens (`mechanicaccess`/`sharing` features). Mechanic-facing APIs must be read-only and must verify session approval and expiration before returning data.
- Vehicle/owner scoping must be enforced on every query that touches vehicles, drafts, or records.

## Current module status

**Project was paused for ~3 months and resumed 2026-08-08. The workspace `CONTEXT.md`/`CODEX.md` files were written during active development and are only partially trustworthy — verify claims against actual code/migrations before relying on them.**

Modules 1–4 are all implemented in code, not just planned:
- Module 1 — vehicle profiles, manual/receipt/voice service draft input.
- Module 2 — draft review, validation, correction, confirmation into `service_records`.
- Module 3 — confirmed vehicle service history APIs/UI.
- Module 4 — Supabase Auth (`features.auth`), AI/template explanation (`features.ai`), QR/share access + owner approval (`features.sharing`), mechanic read-only access/search (`features.mechanicaccess`). Migrations `003`–`005` in `database/migrations` back this.

Since the project sat idle, treat this as needing a regression/correctness pass (run the app, check auth flow, check each module end-to-end) rather than as unfinished greenfield work.

## Working alongside other people

**Four people work on this repo, each with their own Claude Code session.**
Assume a file you are about to change is open in someone else's editor. Read
`planning/COLLABORATION.md` before starting; the rules that matter most are
here because this file is loaded automatically and that one is not.

- **Ask what the user owns** if the task does not make it obvious, and stay
  inside it. Work is split by feature (backend `features.*` package plus the
  frontend pages that use it), not by layer.
- **Never reorder or reformat a shared file** — `styles.css` (11k lines),
  `App.jsx` routes, `main.jsx` imports. Add at the end, leave the rest alone. A
  whitespace pass on any of these conflicts with everybody.
- **Prefer a new stylesheet** under `src/styles/<feature>.css`, imported at the
  end of `main.jsx`, over adding to `styles.css`.
- **Migration numbers must be claimed out loud before use.** `024` is the
  highest. Two people writing `025_` is not a merge conflict, it is two
  migrations racing into one shared Supabase database. Check `ls
  database/migrations` rather than trusting this line — it has gone stale
  before, and there is already a duplicated `017_` pair from the last time.
- **`shared/dto/ServiceItemResponse` and `ServiceLineEntryResponse` cross every
  module.** Grep for consumers before changing a field, and tell the user which
  other features you are about to affect.
- **Append to `planning/DEFERRED.md`, never rewrite it.** It is the shared
  handoff. Disagree in a new note underneath rather than editing the claim away.
- **Never change the receipt extraction prompt without running the golden set
  before and after** (`./mvnw test -Pgolden`) — two prompt changes that looked
  like improvements were 100%→36% regressions. It costs about a cent a run, so
  run it freely; but without `OPENAI_API_KEY` it skips instead of failing, so
  check the scorecard actually printed.

Two things that make "it works" a weaker claim here than it sounds, and are
worth saying plainly rather than glossing:

- **`./mvnw test` passing does not mean the application starts.** There is no
  Spring context test, so broken bean wiring passes the whole suite and fails at
  boot. Start the app before reporting backend work as done.
- **Anything behind the login is unverified** unless a human clicked it. You
  cannot sign in.

## Commit messages

Keep them short. A one-line subject is the default, and for most changes it is
the whole message.

- **Subject only, imperative, under ~60 chars.** "Fix vehicle delete cascade",
  not "Fix the cascade problem that occurred when deleting a vehicle profile
  which had associated service records".
- **Add a body only when the *why* is not obvious from the diff** — a
  non-obvious tradeoff, a decision someone might otherwise undo, a bug whose
  cause matters. Two or three lines. Not a changelog of the diff.
- **Do not narrate small or routine work.** Doc fixes, comment tweaks,
  formatting, renames, removing dead code, updating `planning/DEFERRED.md` —
  these get a single line and nothing else. If the change is not a feature or
  a real fix, it does not deserve a bulleted body explaining itself.
- **Never list every file or restate what the diff already shows.** The diff is
  right there.
- No emoji, no "Summary:" headers, no bullet lists of self-evident points.

Detailed reasoning belongs in `planning/DEFERRED.md` or the relevant
`CONTEXT.md`, where it stays findable — not in a commit body nobody re-reads.

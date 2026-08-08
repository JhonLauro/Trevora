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
- `/frontend` — React app (`frontend/CONTEXT.md`, code in `frontend/trevora-web`; design references and route reference in `frontend/design-reference`)
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

**Current user resolution order** (used across auth-aware endpoints): Supabase bearer token → demo headers `X-User-Id`/`X-User-Role` → mock owner fallback `00000000-0000-0000-0000-000000000001` (role `VEHICLE_OWNER`). Preserve this fallback chain — it's relied on for local/demo development.

## Frontend architecture

Vite + React Router SPA. Key directories under `frontend/trevora-web/src`:

- `api/` — one module per backend resource (`vehicles.js`, `serviceDrafts.js`, `serviceHistory.js`, `auth.js`, `qrAccess.js`, `mechanicAccess.js`, `aiExplanations.js`, `receiptStorage.js`), plus `http.js` (request helper) and `supabaseClient.js`.
- `pages/` — one component per route/screen.
- `components/` — shared UI (`AppShell.jsx` is the main layout/sidebar shell; `AuthLayout.jsx` for auth screens).
- `utils/` — small helpers (e.g. `serviceText.js`).

Authenticated requests should include both the Supabase bearer token (`Authorization: Bearer ...`) and the demo-compatible `X-User-Id`/`X-User-Role` headers, to stay compatible with the backend's fallback resolution order.

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

Since the project sat idle, treat this as needing a regression/correctness pass (run the app, check auth flow, check each module end-to-end) rather than as unfinished greenfield work. Multi-person "ownership" tables in the older docs are stale — this is effectively a solo codebase now.

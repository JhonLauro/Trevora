# Backend Context

## Purpose

This workspace contains the Spring Boot backend for Trevora.

## Architecture

Use feature-based packaging / vertical slicing inside a modular monolith.

Controller → Service → Repository → Domain Model/Entity

The source tree is rooted at `com.trevora.api`. Business capability code lives under `features.*`; cross-cutting code lives under `shared.*`.

## Backend Rules

- Controllers only handle HTTP requests and responses.
- Services contain business logic.
- Repositories handle database access.
- Domain models/entities represent system data.
- Do not put business rules directly inside controllers.
- Verify vehicle ownership before creating service drafts.
- All input methods must produce a ServiceDraft.
- Manual entry must work even if OCR, speech-to-text, or AI services are unavailable.

## Module 1 Backend Scope

Build only the backend needed for Module 1:

- Vehicle profile creation and selection
- Manual service draft creation
- Receipt-based service draft creation
- Voice-based service draft creation
- Structured service draft retrieval

## Current Packages

Feature packages:

- `features.auth` - Supabase Auth token verification, profile sync, login/register fallback, users, roles, current-user headers, mock owner fallback.
- `features.vehicle` - vehicle profile controller, service, repository, entity, and DTOs.
- `features.serviceinput` - Module 1 draft input endpoints/services, draft entity/repository, input DTOs, OCR/voice mocks, `InputMethod`, and `DraftStatus`.
- `features.validation` - Module 2 draft review, validation, correction services, controller, and validation DTOs.
- `features.servicerecord` - confirmed `ServiceRecord` entity/repository and draft confirmation service/DTOs.
- `features.history` - Module 3 confirmed history controller, service, and history DTOs.
- `features.ai` - Module 4 AI/template explanation controller, service, and DTO.
- `features.sharing` - QR/share requests, owner approval/denial, access request entities/repositories, and sharing DTOs.
- `features.mechanicaccess` - temporary read-only mechanic sessions, shared history/detail, mechanic search services, repository, entity, and DTOs.

Shared packages:

- `shared.config` - Spring configuration.
- `shared.exception` - shared exceptions and global exception handling.
- `shared.security` - reserved for future shared security/JWT/filter utilities.
- `shared.util` - reserved for future generic utilities/constants.

Do not reintroduce top-level layered packages such as `controller`, `service`, `repository`, `model`, `dto`, or `enums` for new feature work.

## Module 2 Backend Scope

Module 2 should consume existing ServiceDraft records created by Module 1.

The backend should provide services for:

- retrieving a draft for review
- validating required fields
- returning validation results
- applying owner corrections
- confirming a validated record
- saving a final ServiceRecord or updating the draft status depending on the current MVP decision

Keep Controller → Service → Repository → Entity structure.
Do not put validation logic directly in controllers.

## Module 3 Backend Scope

Module 3 consumes confirmed `ServiceRecord` records created by Module 2.

The backend should provide APIs for:

- retrieving confirmed service history for a selected vehicle
- sorting service records chronologically
- filtering/categorizing service records
- retrieving service record details
- ensuring the selected vehicle belongs to the current mock/authenticated owner

## Module 3 Backend Rules

- Use `service_records` as the main source of history.
- Do not use incomplete `service_drafts` as history.
- Keep Controller → Service → Repository → Entity structure.
- Keep access checks in services, not controllers.
- Reuse `VehicleService` to verify vehicle ownership.
- Reuse `ServiceRecordRepository` to query confirmed records.
- Do not implement Module 4 AI explanation or mechanic handoff here.

## Suggested Module 3 Backend Components

Controller:
- HistoryController

Service:
- ServiceHistoryService

Repository:
- ServiceRecordRepository
- VehicleRepository, if needed for vehicle details

DTOs:
- ServiceHistoryResponse
- ServiceRecordSummaryResponse
- ServiceRecordDetailResponse

## Module 3 Backend Status

Module 3 MVP is complete and verified. The backend exposes:

- `GET /api/vehicles/{vehicleId}/history`
- `GET /api/vehicles/{vehicleId}/history/{recordId}`

Both endpoints use confirmed `service_records`, verify selected vehicle ownership through `VehicleService`, and scope records by vehicle and owner.

## Module 4 Backend Starting Point

Module 4 should build AI explanation and mechanic handoff behavior on top of confirmed `service_records` and the existing history APIs. Preserve Controller -> Service -> Repository -> Entity layering, vehicle/owner scoping, and the invariant that incomplete `service_drafts` are not service history.

## Module 4 Backend Scope

Module 4 uses confirmed `service_records` and selected `vehicle_profiles`.

It must not expose incomplete `service_drafts`.

## Module 4 Backend Ownership

| Person | Backend Scope |
|---|---|
| Person A | Supabase Auth signup/sign-in, profile sync, current user context, role handling, mock owner fallback |
| Person B | AIController, AIExplanationService, AI explanation persistence/retrieval |
| Person C | QRAccessController, QRAccessService, AccessApprovalService, QR/access request entities |
| Person D | MechanicAccessController, MechanicAccessService, MechanicSearchService, mechanic read-only history/search |

## Module 4 Backend Rules

- Keep Controller → Service → Repository → Entity structure.
- Keep business rules in services, not controllers.
- Use confirmed `service_records` for AI explanation, shared history, and mechanic search.
- Do not return incomplete `service_drafts` in mechanic-facing APIs.
- Verify owner access before creating share/QR requests.
- Verify mechanic session approval before returning shared history.
- Verify session expiration before returning shared history.
- Mechanic APIs must be read-only.
- AI explanation and search may be mocked for MVP but must be isolated behind service classes.

## Suggested Module 4 Backend Components

Controllers:
- AIController
- QRAccessController
- MechanicAccessController

Services:
- AIExplanationService
- QRAccessService
- AccessApprovalService
- MechanicAccessService
- MechanicSearchService
- CurrentUserService or CurrentUserContext

Repositories:
- AIExplanationRepository
- QRAccessRepository
- MechanicAccessRepository
- MechanicSearchLogRepository, optional
- ServiceRecordRepository

Entities:
- AIExplanation
- QRAccessRequest
- MechanicAccessSession
- MechanicSearchLog, optional

## Module 4 Auth Foundation Backend Scope

Module 4 Person A owns MVP Supabase Auth integration, profile sync, login/register fallback, and current-user resolution. Supported MVP account roles are `VEHICLE_OWNER` and `ADMIN`. Mechanics do not register or sign in; they use owner-approved temporary QR/share links as guests.

The auth foundation should reuse the existing `users` table where possible. Supabase Auth users are synced into `public.users` through `/api/auth/sync`; legacy/local password support uses `password_hash`. Passwords must never be stored as plain text.

Auth endpoints:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/sync`
- `GET /api/auth/me`

Current user resolution order:
1. Supabase bearer token verified through Supabase Auth.
2. Demo request headers `X-User-Id` and `X-User-Role`.
3. Existing mock owner fallback `00000000-0000-0000-0000-000000000001` with role `VEHICLE_OWNER`.

Runtime environment required for Supabase Auth:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Mechanic-facing access must use confirmed `service_records` and must never return incomplete `service_drafts`.

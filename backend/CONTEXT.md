# Backend Context

## Purpose

This workspace contains the Spring Boot backend for Trevora.

## Architecture

Use a layered backend design:

Controller → Service → Repository → Domain Model/Entity

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

## Suggested Packages

- controller
- service
- repository
- model
- dto
- enums
- config
- exception

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
| Person A | Current user context, role handling, mock owner fallback |
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

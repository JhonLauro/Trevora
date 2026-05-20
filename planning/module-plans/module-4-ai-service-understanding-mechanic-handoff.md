# Module 4: AI-Assisted Service Understanding and Mechanic Handoff

## Purpose

Module 4 helps vehicle owners understand confirmed service records and allows mechanics/service personnel to temporarily view approved vehicle service history during handoff.

This module must use confirmed `service_records` created by Module 2 and displayed by Module 3. It must not expose incomplete `service_drafts`.

For MVP, AI-generated explanations and AI-assisted search may use mock, rule-based, or template-generated responses as long as they are isolated behind service classes and can be replaced by real AI services later.

---

## SDD Transactions

4.1 Show AI-Generated Service Explanation
4.2 Generate QR Access Request
4.3 Notify Temporary Access Expiration
4.4 Approve Mechanic Access Request
4.5 Provide Temporary Read-Only Access
4.6 Search Shared Records with AI Assistance

---

## Current System Handoff

### Module 1 Output

Module 1 creates `ServiceDraft` records from:

- Manual entry
- Receipt upload with mocked OCR
- Voice transcript with mocked voice processing

### Module 2 Output

Module 2 validates, corrects, confirms, and saves validated records as `ServiceRecord`.

### Module 3 Output

Module 3 displays confirmed `service_records` under the selected vehicle profile through unified vehicle history.

### Module 4 Input

Module 4 must use:

- confirmed `service_records`
- selected `vehicle_profiles`
- Module 3 service history APIs or equivalent backend service methods
- owner/mechanic user context from the authentication/access foundation

### Authentication Foundation Input

Person A must provide MVP login/register support before the rest of Module 4 access features are built. The auth foundation is vehicle-owner centered: registered account roles are `VEHICLE_OWNER` and `ADMIN`. Mechanics do not register or sign in; they use owner-approved temporary QR/share links as guests. Existing mock owner behavior should remain as a development fallback when no logged-in user or request-header current user is active.

---

## Core Module 4 Flow

Vehicle owner opens a confirmed service record
→ system shows AI-generated explanation
→ owner generates QR/share access request for selected vehicle
→ mechanic opens shared access link or QR request
→ mechanic requests access
→ owner approves or denies the request
→ approved mechanic views temporary read-only service history
→ mechanic searches approved shared records only

---

## MVP Rules

- AI explanation may be template-generated or mocked.
- AI-assisted search may be keyword-based or mocked.
- QR may be implemented as a share link/token first.
- Real QR image generation is optional for MVP.
- Real AI provider integration is optional for MVP.
- Mechanics must not access records before owner approval.
- Mechanics must not create, edit, or delete records.
- Mechanic access must be temporary and scoped to one selected vehicle.
- Mechanic search must only search records from the approved shared vehicle.
- Do not expose incomplete `service_drafts`.
- Login/register is required for the MVP auth foundation.
- Vehicle owners use Modules 1-4 owner features.
- Mechanics use Module 4 mechanic access features only after owner approval.

---

## Person Assignments

### Person A — Authentication / Access Foundation + Login/Register

Responsible for preparing the system to distinguish user roles and current user context.

Scope:
- MVP registration and login
- Owner/mechanic role context
- Current user resolver
- Demo login or demo user selection, if needed for development fallback
- Mock owner backward compatibility
- Request-header or simple MVP user context support
- Supported account roles: `VEHICLE_OWNER`, `ADMIN`
- Mechanic access is guest/token-based, not account-based

Person A is not directly implementing Module 4 transactions, but their work supports Module 4.

---

### Person B — AI Explanation

Responsible for:

- 4.1 Show AI-Generated Service Explanation

Scope:
- AI explanation panel for confirmed service records
- Mock/template AI explanation service
- AI explanation retrieval/generation endpoint
- Optional `ai_explanations` table
- Explanation fallback state

Person B should not implement QR sharing, approval, mechanic access, or mechanic search.

---

### Person C — QR Access Request and Owner Approval

Responsible for:

- 4.2 Generate QR Access Request
- 4.3 Notify Temporary Access Expiration
- 4.4 Approve Mechanic Access Request

Scope:
- Owner generates one-time share/QR access request for selected vehicle
- Access token/share link
- Expiration handling
- Mechanic request submission
- Owner approval/denial
- Creation of approved temporary mechanic access session

Person C should not implement mechanic read-only history or mechanic search unless needed for minimal integration.

---

### Person D — Mechanic Read-Only Access and Search

Responsible for:

- 4.5 Provide Temporary Read-Only Access
- 4.6 Search Shared Records with AI Assistance

Scope:
- Mechanic temporary read-only history page
- Access session validation
- Expiration blocking
- Read-only service history display
- Mechanic search within approved shared records only
- Mock/keyword-based AI-assisted search for MVP

Person D depends on Person C’s access session design.

---

## Suggested Work Order

1. Person A creates the authentication/access foundation, including MVP login/register.
2. Person B can work in parallel on AI explanation because it only depends on confirmed service records.
3. Person C builds QR/share access request and approval flow.
4. Person D builds mechanic read-only access and search after Person C’s access session shape is stable.

---

## Suggested Database Tables

### `ai_explanations`

Used by Person B.

Suggested fields:
- `ai_explanation_id`
- `record_id`
- `owner_id`
- `summary`
- `what_was_done`
- `why_it_matters`
- `watch_out_for`
- `source`
- `created_at`
- `updated_at`

### `qr_access_requests`

Used by Person C.

Suggested fields:
- `qr_access_request_id`
- `token`
- `owner_id`
- `vehicle_id`
- `status`
- `expires_at`
- `created_at`
- `updated_at`

Suggested statuses:
- `ACTIVE`
- `REQUESTED`
- `APPROVED`
- `DENIED`
- `EXPIRED`
- `USED`

### `mechanic_access_sessions`

Used by Person C and Person D.

Suggested fields:
- `mechanic_access_session_id`
- `qr_access_request_id`
- `vehicle_id`
- `owner_id`
- `mechanic_id`
- `status`
- `approved_at`
- `expires_at`
- `created_at`
- `updated_at`

Suggested statuses:
- `PENDING`
- `APPROVED`
- `DENIED`
- `EXPIRED`

### `mechanic_search_logs` Optional

Used by Person D if simple to add.

Suggested fields:
- `mechanic_search_log_id`
- `mechanic_access_session_id`
- `query`
- `result_count`
- `created_at`

---

## Suggested Backend Components

Controllers:
- `AuthController`
- `AIController`
- `QRAccessController`
- `MechanicAccessController`

Services:
- `AuthService`
- `AIExplanationService`
- `QRAccessService`
- `AccessApprovalService`
- `MechanicAccessService`
- `MechanicSearchService`
- `CurrentUserService` or `CurrentUserContext`, if added by Person A

Repositories:
- `UserRepository`
- `AIExplanationRepository`
- `QRAccessRepository`
- `MechanicAccessRepository`
- `MechanicSearchLogRepository`, optional
- `ServiceRecordRepository`
- `VehicleRepository`

Entities:
- `AIExplanation`
- `QRAccessRequest`
- `MechanicAccessSession`
- `MechanicSearchLog`, optional
- `ServiceRecord`
- `VehicleProfile`

DTOs:
- `RegisterRequest`
- `LoginRequest`
- `AuthResponse`
- `CurrentUserResponse`
- `AIExplanationResponse`
- `QRAccessRequestResponse`
- `CreateQRAccessRequestResponse`
- `MechanicAccessRequestResponse`
- `AccessApprovalRequest`
- `MechanicAccessSessionResponse`
- `MechanicSharedHistoryResponse`
- `MechanicSearchResponse`

---

## Suggested Frontend Routes

Owner-facing:
- `/login`
- `/register`
- `/service-records/:recordId`
- `/vehicles/:vehicleId/share`
- `/access/requests`

Mechanic-facing:
- `/access/request/:token`
- `/mechanic/access/:sessionId`
- `/mechanic/access/:sessionId/search`

Existing Module 3 routes may also show AI explanations:
- `/vehicles/:vehicleId/history`
- `/vehicles/:vehicleId/history/:recordId`

---

## Suggested Frontend Pages and Components

Person B:
- `ServiceRecordDetailPage`
- `AIExplanationPanel`
- `OriginalRecordSummary`
- `GenerateExplanationStatus`
- `ExplanationUnavailableMessage`

Person C:
- `QRSharingPage`
- `QRCodeDisplayPanel`
- `AccessScopeNotice`
- `QRExpirationNotice`
- `MechanicAccessRequestPage`
- `MechanicRequestCard`
- `ApproveAccessButton`
- `DenyAccessButton`

Person D:
- `MechanicReadOnlyHistoryPage`
- `ReadOnlyServiceHistoryList`
- `ReadOnlyServiceRecordCard`
- `AccessTimerBanner`
- `ExpiredAccessMessage`
- `MechanicAISearchPanel`
- `SearchResultsList`

Person A:
- `LoginPage`
- `RegisterPage`
- logout action
- `DemoUserSelector`, optional for development fallback
- `CurrentUserProvider`, if needed
- `RoleBadge`, optional

---

## Important Access Rules

- Owner can only generate share access for vehicles they own.
- Mechanic cannot view shared history until owner approval.
- Approved access must be read-only.
- Approved access must expire.
- Approved access must only show the selected vehicle’s confirmed service records.
- Mechanic search must only search approved shared records.
- Owner records must never be editable through mechanic access.
- Incomplete `service_drafts` must never be shown in mechanic-facing history.

---

## MVP AI Rules

AI explanation and AI-assisted search may be mocked.

Acceptable MVP AI explanation:
- Template-generated text based on `serviceType`, `partsReplaced`, `laborPerformed`, and `remarks`.

Acceptable MVP AI-assisted search:
- Keyword search across confirmed service records.
- Optional mock explanation snippet for results.

Do not claim real AI integration unless a real provider is actually connected.

---

## Module 4 Handoff to Future Development

Future improvements may include:

- Real AI provider integration
- Real OCR confidence integration
- Real speech-to-text integration
- Real QR image generation
- Stronger authentication
- Full audit logging
- Notifications
- More advanced mechanic search
- Access revocation
- Pagination for shared history

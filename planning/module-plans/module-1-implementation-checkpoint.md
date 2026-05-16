# Module 1 Implementation Checkpoint: Service Record Input

Last updated: May 16, 2026

## 1. Completed Module 1 Features

- Vehicle owner can create a vehicle profile using the mock owner identity.
- Vehicle owner can view and select an existing vehicle profile.
- Add Service Record method-selection screen exists for the selected vehicle.
- Manual entry creates a structured `ServiceDraft` with `inputMethod = MANUAL` and `status = DRAFT`.
- Receipt upload creates a structured `ServiceDraft` with `inputMethod = RECEIPT` and `status = DRAFT`.
- Receipt OCR is mocked through `OCRProcessingService`.
- Voice transcript input creates a structured `ServiceDraft` with `inputMethod = VOICE` and `status = DRAFT`.
- Voice transcription and field mapping are mocked through `VoiceProcessingService`.
- Structured draft page displays service fields, input method, draft status, selected vehicle, source metadata, and confidence values when present.
- Frontend primary routes are aligned with `frontend/design-reference/routes.md`.
- Backend runs against Supabase Postgres with `spring.jpa.hibernate.ddl-auto=validate`.
- Database migration for Module 1 is present at `database/migrations/001_module_1_service_record_input.sql`.

## 2. Current Frontend Routes

Primary routes:

| Route | Page Component | Purpose |
|---|---|---|
| `/vehicles` | `VehicleProfileSelectionPage` | View, create, and select vehicle profiles. |
| `/service-input/:vehicleId` | `ServiceInputMethodPage` | Choose Manual, Receipt, or Voice input for the selected vehicle. |
| `/service-input/:vehicleId/manual` | `ManualEntryPage` | Enter owner-verified service details. |
| `/service-input/:vehicleId/receipt` | `ReceiptUploadPage` | Upload receipt image for mocked OCR extraction. |
| `/service-input/:vehicleId/voice` | `VoiceInputPage` | Enter spoken-service transcript text for mocked voice processing. |
| `/service-drafts/:draftId` | `StructuredServiceDraftPage` | Display a unified structured `ServiceDraft`. |

Compatibility redirects and aliases:

- `/` redirects to `/vehicles`.
- `/manual/:vehicleId` redirects to `/service-input/:vehicleId/manual`.
- `/receipt/:vehicleId` redirects to `/service-input/:vehicleId/receipt`.
- `/voice/:vehicleId` redirects to `/service-input/:vehicleId/voice`.
- `/drafts/:draftId` redirects to `/service-drafts/:draftId`.
- Unknown routes redirect to `/vehicles`.

## 3. Current Frontend Pages and Components

Pages:

- `VehicleProfileSelectionPage`
  - Displays vehicle cards with nickname, make, model, year, plate number, and odometer when available.
  - Provides Add Vehicle modal.
  - Routes selected vehicles to `/service-input/:vehicleId`.
- `ServiceInputMethodPage`
  - Shows Receipt / Photo, Voice Note, and Manual Entry method cards.
  - Routes to the chosen input method page.
  - Stores the selected vehicle id in `localStorage` as `trevora.activeVehicleId` for the sidebar Add Service Record link.
- `ManualEntryPage`
  - Owner-entered form for service date, service type, odometer, total cost, shop, location, parts, labor, and remarks.
  - Submits to the manual draft API and navigates to `/service-drafts/:draftId`.
- `ReceiptUploadPage`
  - Upload/drop-zone style image selector.
  - Shows selected file name and image preview when possible.
  - Submits multipart receipt input to the receipt draft API and navigates to `/service-drafts/:draftId`.
- `VoiceInputPage`
  - Textarea for spoken-service transcript text.
  - Submits to the voice draft API and navigates to `/service-drafts/:draftId`.
- `StructuredServiceDraftPage`
  - Loads the draft and selected vehicle.
  - Shows input method, draft status, vehicle context, service fields, metadata source, and confidence values.

Shared components:

- `AppShell`
  - Trevora branding.
  - Module 1 label.
  - Sidebar navigation for My Vehicles and Add Service Record.
  - Service History is visible as a disabled placeholder only.
- `StepIndicator`
  - Displays the three Module 1 steps: Select Vehicle, Choose Input Method, Create Draft.

Frontend API modules:

- `api/vehicles.js`
  - `getVehicles`
  - `createVehicle`
  - `getVehicle`
- `api/serviceDrafts.js`
  - `createManualServiceDraft`
  - `createReceiptServiceDraft`
  - `createVoiceServiceDraft`
  - `getServiceDraft`
- `api/http.js`
  - Shared API request helper.
  - Handles JSON and `FormData` requests.

## 4. Current Backend Endpoints

Vehicle endpoints:

| Method | Endpoint | Request | Response |
|---|---|---|---|
| `GET` | `/api/vehicles` | none | `List<VehicleResponse>` |
| `POST` | `/api/vehicles` | `CreateVehicleRequest` JSON | `VehicleResponse` |
| `GET` | `/api/vehicles/{vehicleId}` | path `vehicleId` | `VehicleResponse` |

Service draft endpoints:

| Method | Endpoint | Request | Response |
|---|---|---|---|
| `POST` | `/api/service-drafts/manual` | `ManualServiceDraftRequest` JSON | `ServiceDraftResponse` |
| `POST` | `/api/service-drafts/receipt` | multipart `vehicleId`, `receiptImage` | `ServiceDraftResponse` |
| `POST` | `/api/service-drafts/voice` | `VoiceServiceDraftRequest` JSON | `ServiceDraftResponse` |
| `GET` | `/api/service-drafts/{draftId}` | path `draftId` | `ServiceDraftResponse` |

All service draft creation paths verify that the selected vehicle belongs to the current mock owner.

## 5. Current Backend Classes

Controllers:

- `VehicleController`
  - Lists, creates, and fetches vehicle profiles for the mock owner.
- `ServiceRecordController`
  - Creates manual, receipt, and voice drafts.
  - Fetches a draft for the mock owner.

Services:

- `VehicleService`
  - Owns the mock owner id: `00000000-0000-0000-0000-000000000001`.
  - Creates vehicle profiles for the mock owner.
  - Lists and fetches mock owner vehicles.
  - Verifies vehicle ownership before draft creation.
- `ServiceInputService`
  - Creates unified `ServiceDraft` records for manual, receipt, and voice input.
  - Sets `inputMethod`, `status = DRAFT`, owner id, vehicle id, service fields, and metadata.
  - Retrieves drafts by `draftId` and mock owner id.
- `OCRProcessingService`
  - Mock receipt extraction service.
  - Intended replacement point for real OCR later.
- `VoiceProcessingService`
  - Mock transcript processing service.
  - Intended replacement point for real speech-to-text and extraction later.

Repositories:

- `VehicleRepository`
  - Extends `JpaRepository<VehicleProfile, UUID>`.
  - Finds vehicles by owner id ordered by creation time.
  - Finds a vehicle by vehicle id and owner id.
- `ServiceDraftRepository`
  - Extends `JpaRepository<ServiceDraft, UUID>`.
  - Finds a draft by draft id and owner id.

Entities:

- `User`
  - Maps `users`.
- `VehicleProfile`
  - Maps `vehicle_profiles`.
- `ServiceDraft`
  - Maps `service_drafts`.
  - Uses JSONB mapping for `fieldMetadata`.

DTOs:

- `CreateVehicleRequest`
- `VehicleResponse`
- `ManualServiceDraftRequest`
- `VoiceServiceDraftRequest`
- `MockReceiptExtraction`
- `MockVoiceExtraction`
- `ServiceDraftResponse`

Enums:

- `InputMethod`
  - `MANUAL`
  - `RECEIPT`
  - `VOICE`
- `DraftStatus`
  - `DRAFT`
  - `READY_FOR_REVIEW`

Exceptions and error handling:

- `ResourceNotFoundException`
- `UnauthorizedVehicleAccessException`
- `ApiErrorResponse`
- `GlobalExceptionHandler`

Configuration:

- `WebConfig`
  - Frontend/backend CORS support.
- `application.properties`
  - Supabase Postgres connection is environment-driven.
  - Hibernate schema validation is enabled.

## 6. Current Database Tables and Important Fields

Migration file:

- `database/migrations/001_module_1_service_record_input.sql`

Tables:

### `users`

Important fields:

- `user_id uuid primary key`
- `full_name text not null`
- `email text not null unique`
- `role text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Current Module 1 mock owner:

- `00000000-0000-0000-0000-000000000001`
- `module1-owner@trevora.local`
- role `OWNER`

### `vehicle_profiles`

Important fields:

- `vehicle_id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references users(user_id)`
- `make text not null`
- `model text not null`
- `model_year integer`
- `nickname text`
- `plate_number text`
- `vin_chassis_number text`
- `odometer integer`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- `idx_vehicle_profiles_owner_id`

### `service_drafts`

Important fields:

- `draft_id uuid primary key default gen_random_uuid()`
- `vehicle_id uuid not null references vehicle_profiles(vehicle_id)`
- `owner_id uuid not null references users(user_id)`
- `input_method text not null check (input_method in ('MANUAL', 'RECEIPT', 'VOICE'))`
- `service_date date`
- `service_type text`
- `odometer integer`
- `total_cost numeric(12, 2)`
- `shop_name text`
- `location text`
- `parts_replaced text`
- `labor_performed text`
- `remarks text`
- `status text not null check (status in ('DRAFT', 'READY_FOR_REVIEW'))`
- `field_metadata jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- `idx_service_drafts_owner_id`
- `idx_service_drafts_vehicle_id`

Important draft-flow note:

- `service_date`, `service_type`, and `total_cost` are nullable because Module 1 creates drafts. Module 2 is responsible for validation/review of missing required fields.

## 7. Current Mocked OCR and Voice Behavior

### Receipt OCR mock

Class:

- `OCRProcessingService`

Input:

- Multipart `receiptImage`.

Current mocked extraction:

- `serviceDate`: current date.
- `serviceType`: `Receipt-based service`.
- `odometer`: `null`.
- `totalCost`: `1500.00`.
- `shopName`: `Mock OCR Auto Shop`.
- `location`: `null`.
- `partsReplaced`: `Mock extracted parts from {fileName}`.
- `laborPerformed`: `Mock extracted labor from receipt image`.
- `remarks`: notes that this is mock OCR extraction.
- `fieldMetadata`:
  - `inputMethod`: `RECEIPT`
  - `source`: `mock_ocr`
  - `fileName`
  - `confidence.serviceDate`: `0.82`
  - `confidence.serviceType`: `0.74`
  - `confidence.totalCost`: `0.88`
  - `confidence.shopName`: `0.79`

### Voice processing mock

Class:

- `VoiceProcessingService`

Input:

- Transcript text through `VoiceServiceDraftRequest`.

Current mocked extraction:

- `serviceDate`: current date.
- `serviceType`: inferred from transcript keywords:
  - contains `brake` -> `Brake service`
  - contains `oil` -> `Oil change`
  - contains `battery` -> `Battery service`
  - contains `tire` or `tyre` -> `Tire service`
  - otherwise `Voice-described service`
- `odometer`: `null`.
- `totalCost`: `1200.00`.
- `shopName`: `null`.
- `location`: `null`.
- `partsReplaced`: inferred from `filter`, `battery`, or `brake pad` keywords; otherwise `null`.
- `laborPerformed`: cleaned transcript.
- `remarks`: notes that this is mock voice extraction.
- `fieldMetadata`:
  - `inputMethod`: `VOICE`
  - `source`: `mock_voice_transcription`
  - `transcript`
  - `confidence.serviceDate`: `0.70`
  - `confidence.serviceType`: `0.72`
  - `confidence.totalCost`: `0.64`
  - `confidence.laborPerformed`: `0.80`

## 8. Current MVP Limitations

- Authentication is not implemented. All data is scoped to the temporary mock owner id.
- Authorization is limited to mock owner vehicle/draft ownership checks.
- Real OCR is not implemented.
- Real speech-to-text is not implemented.
- Receipt images are accepted by the backend request but are not persisted to Supabase Storage yet.
- Voice input is transcript text only; browser audio recording is not implemented.
- Manual entry requires `serviceDate`, `serviceType`, and `totalCost` even though the database allows these fields to be nullable for draft inputs.
- Receipt and voice extraction values are fixed or keyword-based mocks.
- `parts_replaced` and `labor_performed` are plain text fields.
- There are no separate `manual_inputs`, `receipt_inputs`, or `voice_inputs` tables.
- There is no final `service_records` table.
- Module 2 validation, correction, confirmation, and final saving are not implemented.
- Module 3 and Module 4 are not implemented.
- Automated browser testing is limited; runtime verification has relied on API smoke tests plus browser route/render checks.

## 9. Module 1 Handoff to Module 2

Module 1 hands off one unified draft shape:

- Table: `service_drafts`
- Entity: `ServiceDraft`
- API response: `ServiceDraftResponse`
- Status: currently created as `DRAFT`
- Input methods: `MANUAL`, `RECEIPT`, `VOICE`
- Metadata: nullable JSONB `field_metadata`

Module 2 should build validation and review on top of existing `service_drafts` records rather than replacing Module 1's input flow.

Recommended Module 2 responsibilities:

- Load an existing `ServiceDraft` by `draftId`.
- Identify missing required fields, especially for receipt and voice drafts.
- Use `field_metadata.confidence` to show low-confidence or source-derived values.
- Allow owner review/correction of draft fields.
- Transition drafts from `DRAFT` to `READY_FOR_REVIEW` when appropriate.
- Decide whether a later finalization step creates a separate final `service_records` record. That table does not exist yet and should not be assumed by Module 1.

Module 2 must be careful not to break:

- The `ServiceDraft` response shape currently consumed by `StructuredServiceDraftPage`.
- The existing `field_metadata` JSONB structure for manual, receipt, and voice drafts.
- The nullable draft fields: `service_date`, `service_type`, and `total_cost`.
- Existing `input_method` values.
- Existing `DRAFT` status behavior.
- Mock owner scoping until real auth is introduced.

## 10. Known Risks and Technical Debt

- Mock owner id is hard-coded in `VehicleService`.
- Supabase connection is environment-driven but still local-development oriented.
- `spring.jpa.hibernate.ddl-auto=validate` means Supabase schema must stay exactly aligned with JPA mappings.
- No automated backend unit/integration tests exist for Module 1 services/controllers yet.
- No frontend test suite exists for route or form behavior.
- Receipt uploads are not stored; real OCR will likely require Supabase Storage integration and a provider abstraction.
- Voice flow is transcript-only; real speech-to-text will require audio capture, upload or browser transcription strategy, and provider integration.
- Field confidence metadata is loosely structured JSON, so Module 2 should parse defensively.
- `ServiceDraftResponse` currently omits `updatedAt`; add only if a future UI needs it.
- UI uses `localStorage` for the sidebar's active vehicle convenience link; this is not a source of truth.
- The disabled Service History sidebar item is a visual placeholder and should not be wired until its module is in scope.

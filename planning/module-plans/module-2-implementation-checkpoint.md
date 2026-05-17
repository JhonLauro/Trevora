# Module 2 Implementation Checkpoint: Service Data Validation and Correction

Last updated: May 17, 2026

## 1. Module 2 Status Summary

Module 2 is implemented as an MVP and aligns with the approved module plan. The current flow starts from an existing Module 1 `ServiceDraft`, lets the owner review validation results, save corrections to that same draft, confirm the final summary, and persist a validated `ServiceRecord`.

Final confirmation uses the preferred MVP approach from the module plan:

- `service_drafts` remains the editable draft source.
- `service_records` stores the confirmed validated record.
- The source draft status changes to `CONFIRMED` after a successful save.

No Module 3 service history page or Module 4 mechanic/AI handoff was implemented.

## 2. Completed Module 2 Features

- Dedicated review route for an existing draft.
- Backend validation endpoint and review response.
- Required-field validation for vehicle, service date, service type, and total cost.
- Flag display for low-confidence and source-derived receipt/voice metadata.
- Dedicated correction route for editable draft fields.
- Correction endpoint that updates an existing `ServiceDraft`.
- Validation rerun after correction.
- Dedicated confirmation route with read-only final summary.
- Confirmation checkbox before save.
- Backend confirmation endpoint that blocks invalid drafts.
- Final `ServiceRecord` persistence.
- Source `ServiceDraft` status update to `CONFIRMED`.
- Saved-record success screen with service history still disabled.

## 3. Transaction-by-Transaction Implementation Status

### 2.1 Review Service Draft

Status: Complete.

Implemented by:

- Frontend: `ServiceDraftReviewPage`
- Backend: `GET /api/service-drafts/{draftId}/review`
- Service: `ServiceDraftValidationService#getDraftReview`

The review page loads an existing draft by `draftId`, displays the draft details, input method, status, vehicle context, source metadata, confidence data, and validation summary. It does not create a new draft or re-run Module 1 input flows.

### 2.2 Identify Missing Required and Flagged Fields

Status: Complete.

Implemented by:

- Backend: `ServiceDraftValidationService`
- DTOs: `ValidationResult`, `FieldValidationIssue`, `ServiceDraftReviewResponse`
- Frontend: validation summary and field badges in `ServiceDraftReviewPage`

Required fields are checked as blocking validation issues. Receipt and voice drafts also surface confidence/source metadata as flagged fields. Manual drafts are treated as owner-entered and do not generate metadata confidence flags.

### 2.3 Correct Flagged or Incomplete Service Details

Status: Complete.

Implemented by:

- Frontend: `ServiceDraftCorrectionPage`
- Backend: `PATCH /api/service-drafts/{draftId}/corrections`
- Service: `ServiceDraftCorrectionService`
- DTO: `ServiceDraftCorrectionRequest`

Correction updates the existing draft fields, trims blank strings to `null`, sets status to `READY_FOR_REVIEW`, preserves existing metadata, adds `ownerCorrected = true`, saves the draft, and returns a fresh validation result.

### 2.4 Confirm and Save Validated Record

Status: Complete.

Implemented by:

- Frontend: `ServiceRecordConfirmationPage`, `ServiceRecordSavedPage`
- Backend: `POST /api/service-drafts/{draftId}/confirm`
- Service: `ServiceRecordService`
- Entity/repository: `ServiceRecord`, `ServiceRecordRepository`
- DTOs: `ServiceRecordConfirmationResponse`, `ServiceRecordResponse`

Confirmation reloads the existing owner-scoped draft, reuses validation, blocks save if required fields are missing or invalid, creates or updates one `ServiceRecord` for the draft, and sets the draft status to `CONFIRMED`.

## 4. Current Frontend Routes and Pages

Module 1 routes still present:

| Route | Page | Status |
|---|---|---|
| `/vehicles` | `VehicleProfileSelectionPage` | Unbroken |
| `/service-input/:vehicleId` | `ServiceInputMethodPage` | Unbroken |
| `/service-input/:vehicleId/manual` | `ManualEntryPage` | Unbroken |
| `/service-input/:vehicleId/receipt` | `ReceiptUploadPage` | Unbroken |
| `/service-input/:vehicleId/voice` | `VoiceInputPage` | Unbroken |
| `/service-drafts/:draftId` | `StructuredServiceDraftPage` | Unbroken; now links to review |

Module 2 routes:

| Route | Page | Purpose |
|---|---|---|
| `/service-drafts/:draftId/review` | `ServiceDraftReviewPage` | Review draft details and validation results |
| `/service-drafts/:draftId/correct` | `ServiceDraftCorrectionPage` | Save owner corrections |
| `/service-drafts/:draftId/confirm` | `ServiceRecordConfirmationPage` | Confirm final read-only record summary |
| `/service-drafts/:draftId/saved` | `ServiceRecordSavedPage` | Show saved-record success state |

Compatibility redirects remain:

- `/`
- `/manual/:vehicleId`
- `/receipt/:vehicleId`
- `/voice/:vehicleId`
- `/drafts/:draftId`
- wildcard fallback to `/vehicles`

## 5. Current Frontend Components

Pages/components used by Module 2:

- `ServiceDraftReviewPage`
- `ServiceDraftCorrectionPage`
- `ServiceRecordConfirmationPage`
- `ServiceRecordSavedPage`
- `StructuredServiceDraftPage`
- `AppShell`

API helpers used by Module 2:

- `getServiceDraftReview`
- `validateServiceDraft`
- `updateServiceDraftCorrections`
- `confirmServiceDraft`
- `getServiceDraft`
- `getVehicle`

## 6. Current Backend Endpoints

Module 1 draft endpoints still present:

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/service-drafts/manual` | Create manual draft |
| `POST` | `/api/service-drafts/receipt` | Create receipt draft |
| `POST` | `/api/service-drafts/voice` | Create voice draft |
| `GET` | `/api/service-drafts/{draftId}` | Fetch structured draft |

Module 2 endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/service-drafts/{draftId}/review` | Fetch draft plus validation |
| `POST` | `/api/service-drafts/{draftId}/validate` | Re-run validation |
| `PATCH` | `/api/service-drafts/{draftId}/corrections` | Save owner corrections and return validation |
| `POST` | `/api/service-drafts/{draftId}/confirm` | Confirm and save validated record |

All Module 2 backend paths operate through the Spring Boot API and do not write directly from React to Supabase.

## 7. Current Backend Controllers, Services, Repositories, Entities, DTOs, and Enums

Controllers:

- `ServiceRecordController`
- `ValidationController`
- `VehicleController`

Services:

- `ServiceInputService`
- `ServiceDraftValidationService`
- `ServiceDraftCorrectionService`
- `ServiceRecordService`
- `VehicleService`
- `OCRProcessingService`
- `VoiceProcessingService`

Repositories:

- `ServiceDraftRepository`
- `ServiceRecordRepository`
- `VehicleRepository`

Entities:

- `ServiceDraft`
- `ServiceRecord`
- `VehicleProfile`
- `User`

Module 2 DTOs:

- `FieldValidationIssue`
- `ValidationResult`
- `ServiceDraftReviewResponse`
- `ServiceDraftCorrectionRequest`
- `ServiceRecordConfirmationResponse`
- `ServiceRecordResponse`

Relevant existing DTOs:

- `ServiceDraftResponse`
- `ManualServiceDraftRequest`
- `VoiceServiceDraftRequest`
- `VehicleResponse`

Enums:

- `DraftStatus`: `DRAFT`, `READY_FOR_REVIEW`, `CONFIRMED`
- `InputMethod`: `MANUAL`, `RECEIPT`, `VOICE`

## 8. Current Database Tables/Fields Added or Used by Module 2

Migration:

- `database/migrations/002_module_2_service_records.sql`

Used table:

- `service_drafts`

Module 2 uses existing draft fields:

- `draft_id`
- `vehicle_id`
- `owner_id`
- `input_method`
- `service_date`
- `service_type`
- `odometer`
- `total_cost`
- `shop_name`
- `location`
- `parts_replaced`
- `labor_performed`
- `remarks`
- `status`
- `field_metadata`
- `created_at`
- `updated_at`

Module 2 expands `service_drafts.status` to allow:

- `DRAFT`
- `READY_FOR_REVIEW`
- `CONFIRMED`

Added table:

- `service_records`

Fields:

- `record_id uuid primary key`
- `draft_id uuid not null unique references service_drafts(draft_id)`
- `vehicle_id uuid not null references vehicle_profiles(vehicle_id)`
- `owner_id uuid not null references users(user_id)`
- `source_input_method text not null`
- `service_date date not null`
- `service_type text not null`
- `odometer integer`
- `total_cost numeric(12, 2) not null`
- `shop_name text`
- `location text`
- `parts_replaced text`
- `labor_performed text`
- `remarks text`
- `field_metadata jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- `idx_service_records_owner_id`
- `idx_service_records_vehicle_id`

The entity mappings are consistent with the migration.

## 9. Validation Rules Implemented

Blocking required validation:

- `vehicleId` must be present.
- `vehicleId` must resolve to a vehicle owned by the mock owner.
- `serviceDate` must be present.
- `serviceType` must be present and non-blank.
- `totalCost` must be present.

Metadata review validation:

- Receipt and voice confidence values below `0.75` are flagged as low confidence.
- Receipt and voice confidence/source metadata can be surfaced as source-derived fields.
- Metadata keys `notFound`, `missing`, `uncertain`, `lowConfidence`, and `sourceFields` are parsed defensively if present.
- Low-confidence/source flags guide owner review but do not block confirmation unless a required field is missing or invalid.
- Manual drafts skip metadata confidence flags and are treated as owner-entered.

## 10. Correction Behavior

Correction saves changes to the existing `ServiceDraft`. It does not create a new draft.

Updated fields:

- `serviceDate`
- `serviceType`
- `odometer`
- `totalCost`
- `shopName`
- `location`
- `partsReplaced`
- `laborPerformed`
- `remarks`

Correction behavior:

- Blank strings become `null`.
- Status becomes `READY_FOR_REVIEW`.
- Existing `fieldMetadata` is preserved.
- `fieldMetadata.ownerCorrected` is set to `true`.
- Validation is rerun after save.
- The frontend shows whether remaining required fields still block confirmation.

## 11. Confirmation/Save Behavior

The current code creates a validated `ServiceRecord`. It does not only update draft status.

Confirmation behavior:

- Reloads the existing draft through mock-owner scoping.
- Reuses `ServiceDraftValidationService`.
- Blocks save when validation is invalid.
- Finds an existing record by `draftId` and owner, or creates a new `ServiceRecord`.
- Copies validated draft fields into `service_records`.
- Preserves source input method and field metadata.
- Saves the `ServiceRecord`.
- Updates the source draft status to `CONFIRMED`.
- Returns the saved record, saved draft, validation result, and message.

The unique `service_records.draft_id` constraint and repository lookup make confirmation effectively idempotent for a draft.

## 12. How Module 2 Receives Data from Module 1

Module 1 still creates all draft records through:

- Manual entry
- Receipt upload with mocked OCR
- Voice transcript input with mocked processing

Module 2 receives the existing `ServiceDraft` by route parameter:

- Frontend route parameter: `:draftId`
- Backend lookup: `ServiceInputService#getDraftForMockOwner`
- Repository lookup: `ServiceDraftRepository#findByDraftIdAndOwnerId`

This preserves the Module 1 handoff and keeps mock owner scoping.

## 13. How Module 2 Hands Off to Module 3

Module 2 hands off confirmed data by saving a row in `service_records`.

Module 3 should build service history consolidation/listing on top of `service_records` and should not rely on draft-only status as the final source of truth. The saved screen intentionally keeps `View History` disabled because Module 3 pages are out of scope.

## 14. Known MVP Limitations

- Authentication is still not implemented.
- Mock owner setup is still used.
- There are no backend unit/integration tests for Module 2 services/controllers.
- There are no frontend automated tests for review/correction/confirmation routes.
- Receipt OCR remains mocked.
- Voice processing remains mocked and transcript-based.
- Receipt images are not persisted to Supabase Storage.
- Module 3 service history listing is not implemented.
- Module 4 AI explanation, QR sharing, mechanic access, and AI search are not implemented.
- The review UI can edit local field values for inspection, but only the correction route saves draft updates.

## 15. Remaining Risks/Technical Debt

- Validation is mostly service-level and not covered by automated tests.
- `field_metadata` remains loosely structured JSON, so future processors must keep metadata parsing defensive.
- `ServiceRecord` currently mirrors draft fields; Module 3 may need additional normalized history/query fields later.
- There is no explicit lifecycle guard preventing confirmation of an already confirmed draft, although confirmation updates the existing record for the same draft.
- The Maven wrapper expects Java 21+, but this machine's default `java` is Java 17. Backend verification requires setting `JAVA_HOME` to a Java 21+ runtime.

## 16. What Future Module 3 Developers Should Not Break

- Do not recreate Module 1 input flows in Module 3.
- Do not make service history read from incomplete drafts as final records.
- Do not remove `service_records.draft_id` traceability back to the original draft.
- Do not remove mock-owner scoping until real authentication replaces it consistently.
- Do not bypass backend validation and persistence from the frontend.
- Do not treat low-confidence metadata as blocking unless the SDD changes.
- Do not change required confirmation fields without updating validation, frontend messaging, and database assumptions together.
- Do not enable the existing `View History` button until Module 3 service history pages exist.
- Do not implement mechanic handoff, QR sharing, AI explanation, or AI search inside Module 3 unless that module scope is explicitly expanded.

## 17. Audit Summary

Recent Module 2 commits:

- `391bd15 Implement service draft review validation`
  - Added review/validation backend types and endpoints.
  - Added `ServiceDraftValidationService`.
  - Added review frontend route/page.
  - Linked structured draft view to review.
  - Added validation and review styling.
- `4ac238b Implement Module 2 draft correction and confirmation flow`
  - Added correction request/service/endpoint.
  - Added confirmation service/endpoint/response DTOs.
  - Added `ServiceRecord` entity and repository.
  - Added `service_records` migration and `CONFIRMED` draft status.
  - Added correction, confirmation, and saved frontend pages.
  - Added Supabase pooler-safe PostgreSQL driver setting.
- `b7b1b08 added documentation for the implemented features`
  - Updated planning context and Module 2 plan with Person B implementation notes.
- `1fc7ad2 quick UI fix: styled the back to edit button`
  - Added styling for the confirmation page back-to-edit action.

SDD alignment result:

- 2.1 Review Service Draft: aligned.
- 2.2 Identify Missing Required and Flagged Fields: aligned.
- 2.3 Correct Flagged or Incomplete Service Details: aligned.
- 2.4 Confirm and Save Validated Record: aligned.

Architecture result:

- Backend follows Controller -> Service -> Repository -> Entity.
- Module 2 uses existing Module 1 `ServiceDraft` records.
- Module 2 does not recreate Module 1 input flows.
- Module 2 does not implement Module 3 service history pages.
- Module 2 does not implement Module 4 mechanic/AI handoff.

Issues found:

- Minor stale frontend copy in `ServiceDraftReviewPage` still described correction/final save as placeholders for Person B. Fixed during this audit.
- Environment issue: backend verification fails with default Java 17 because the project requires Java 21. Passing command uses the project-local JDK 21.

Fixes made:

- Updated stale review-page helper text to reflect implemented correction and confirmation routes.

Verification:

- Backend command: `cmd /c "set JAVA_HOME=C:\Users\USER\Trevora\.tools\jdk21\jdk-21.0.11+10&& set PATH=C:\Users\USER\Trevora\.tools\jdk21\jdk-21.0.11+10\bin;%PATH%&& .\mvnw.cmd test"` from `backend/trevora-api`.
- Backend result: passed. Maven build success; no test sources were present.
- Frontend command: `npm run build` from `frontend/trevora-web`.
- Frontend result: passed.

Final verdict:

- Ready to merge/commit after reviewing and committing this checkpoint document plus the small frontend copy fix.

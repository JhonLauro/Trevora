# Module 2: Service Data Validation and Correction

## Purpose

Module 2 receives the structured ServiceDraft created by Module 1 and allows the vehicle owner to review, validate, correct, and confirm the service details before saving.

Module 2 must not create service drafts from raw input. That belongs to Module 1.

Module 2 starts from an existing ServiceDraft and ends with a confirmed validated ServiceRecord or a saved/confirmed draft ready for service history consolidation, depending on the current MVP implementation decision.

## SDD Transactions

2.1 Review Service Draft  
2.2 Identify Missing Required and Flagged Fields  
2.3 Correct Flagged or Incomplete Service Details  
2.4 Confirm and Save Validated Record  

## Module 2 Input

Module 2 receives:

- ServiceDraft created from Module 1
- inputMethod: MANUAL, RECEIPT, or VOICE
- header-level draft fields: serviceDate, odometer, totalCost, shopName, location, remarks
- a `services` list of ServiceDraftItem rows (serviceType, serviceCategory, partsReplaced, laborPerformed, lineCost per service performed during the visit)
- field_metadata from OCR/AI or voice processing when available

## Module 2 Output

The owner should be able to:

1. Open a ServiceDraft for review.
2. See missing required fields.
3. See low-confidence or source metadata when available.
4. Correct missing, inaccurate, or incomplete details.
5. Confirm the final details.
6. Save the result as a validated record or prepare it for Module 3 service history consolidation.

## Required Fields for Confirmation

Before confirmation, the system should require:

- vehicle profile
- service date
- total cost
- at least one service performed (the `services` list must not be empty; each service requires its own serviceType)

Other fields may remain optional.

## Important MVP Boundary

Module 2 should not build Module 3 service history pages yet.

Module 2 should not build Module 4 AI explanations, QR sharing, mechanic access, or AI search.

Module 2 should not modify Module 1 input flows unless required to fix a bug.

## Existing Module 1 Handoff

Module 1 already creates ServiceDraft records from:

- manual input
- receipt upload with mocked OCR
- voice transcript with mocked processing

All three input methods store drafts in the same service_drafts table and display them on StructuredServiceDraftPage.

Module 2 should build on top of that existing ServiceDraft structure.

## Suggested Frontend Pages

- ServiceDraftReviewPage
- DraftValidationPage
- ServiceDraftCorrectionPage
- ServiceRecordConfirmationPage

These may be separate routes or a single multi-step review flow if simpler.

## Suggested Frontend Routes

- /service-drafts/:draftId/review
- /service-drafts/:draftId/validate
- /service-drafts/:draftId/correct
- /service-drafts/:draftId/confirm

Alternative MVP route:
- /service-drafts/:draftId/review can contain review, validation, correction, and confirmation in one page.

## Suggested Backend Components

Controllers:
- ValidationController
- ServiceRecordController, if already existing and appropriate

Services:
- ServiceDraftValidationService
- ServiceDraftCorrectionService
- ServiceRecordService

Repositories:
- ServiceDraftRepository
- ServiceRecordRepository, if final service_records table is added

Entities / Models:
- ServiceDraft
- ServiceDraftItem
- ServiceRecord, if final validated records are implemented in Module 2
- ServiceRecordItem
- ValidationResult DTO or value object
- FieldValidationRule helper/rule object

## Suggested MVP Database Decision

Preferred MVP approach:
- Add a service_records table only when confirming/saving a validated record.
- Keep service_drafts as the editable draft source.
- When confirmed, copy validated draft data into service_records.
- Update service_drafts.status to CONFIRMED or VALIDATED if the enum supports it.

If service_records is not added yet, document that confirmation updates ServiceDraft status only and Module 3 will create the final history model later.

## Validation Rules

- If serviceDate is missing, block confirmation.
- If the services list is empty (no service performed has been recorded), block confirmation.
- If totalCost is missing, block confirmation.
- If vehicleId is missing or invalid, block confirmation.
- Low-confidence fields should be shown to the user but should not block confirmation if the owner reviews/corrects them.
- Owner-corrected fields should be treated as owner-confirmed.

## Do Not Break

- /vehicles
- /service-input/:vehicleId
- /service-input/:vehicleId/manual
- /service-input/:vehicleId/receipt
- /service-input/:vehicleId/voice
- /service-drafts/:draftId

Do not remove mock OCR or mock voice processing.
Do not bypass the backend by writing directly to Supabase from React.

## Implementation Checkpoint: Person B

Last updated: May 17, 2026

Person B completed the Module 2 correction and confirmation scope:

- 2.3 Correct Flagged or Incomplete Service Details
- 2.4 Confirm and Save Validated Record

### Backend Implemented

- Added `ServiceDraftCorrectionService`.
- Added `PATCH /api/service-drafts/{draftId}/corrections`.
- Corrections update the existing `ServiceDraft`, set status to `READY_FOR_REVIEW`, preserve existing metadata, and add `ownerCorrected = true`.
- Corrections return the updated draft plus a fresh validation result from `ServiceDraftValidationService`.
- Added `ServiceRecordService`.
- Added `POST /api/service-drafts/{draftId}/confirm`.
- Confirmation reuses `ServiceDraftValidationService` before saving.
- Confirmation is blocked when any required field is missing or invalid:
  - vehicleId
  - serviceDate
  - serviceType
  - totalCost
- Added `ServiceRecord` entity and `ServiceRecordRepository`.
- Confirmation creates or updates a final `ServiceRecord` for the draft, then marks the source draft as `CONFIRMED`.
- Added confirmation response DTOs and a bad-request exception for invalid confirmation attempts.

### Frontend Implemented

- Added `/service-drafts/:draftId/correct`.
- Added `/service-drafts/:draftId/confirm`.
- Added `/service-drafts/:draftId/saved`.
- Added editable correction UI for draft fields.
- Added correction save success/failure messaging.
- Added final read-only confirmation summary.
- Added Back to Edit and Confirm and Save Record actions.
- Added confirmation checkbox gating before save.
- Added saved-record success screen after confirmation.
- Existing Module 1 input routes were not changed.
- Module 3 history page was not implemented; the saved screen keeps View History disabled.

### Database Implemented

Migration added:

- `database/migrations/002_module_2_service_records.sql`

The migration:

- Creates `service_records`.
- Adds indexes for owner and vehicle lookups.
- Expands the `service_drafts.status` check constraint to allow `CONFIRMED`.

The migration was applied to the current Supabase database during implementation.

### Runtime Configuration Fix

The backend uses Supabase's pooled PostgreSQL endpoint on port 6543. The PostgreSQL JDBC driver was creating server-side prepared statements that can conflict with PgBouncer pooled connections.

The following setting was added:

```properties
spring.datasource.hikari.data-source-properties.prepareThreshold=0
```

This disables server-side prepared statements for the Supabase pooler connection.

### Verification Completed

- Backend Maven test passed with `.\mvnw.cmd test`.
- Frontend production build passed with `npm run build`.
- API verification completed for manual, receipt, and voice drafts.
- Correction and confirmation worked for all three draft sources.
- Confirmation was verified to fail when `totalCost` was missing.
- Browser verification completed for correction save, confirmation checkbox gating, and saved success page.

### Remaining Risks

- No automated frontend tests exist yet for the correction and confirmation routes.
- No backend unit/integration tests exist yet for the new services and endpoints.
- Real authentication is still not implemented; mock owner scoping is still used.
- Module 3 service history remains out of scope, so final records are saved but not yet listed in a service history page.

## Update: Service Line Items Schema Split (2026-08-17)

The sections above describe the state as of the Person B checkpoint (May 17, 2026) and are kept
as a historical record. Since then, `serviceType`/`partsReplaced`/`laborPerformed` were split out
of `service_drafts`/`service_records` into new child tables so a single visit can record multiple
distinct services instead of one flat `service_type` string:

- `database/migrations/007_service_line_items.sql` adds `service_draft_items` and
  `service_record_items`, backfills existing rows, and drops the old scalar columns.
- Validation's "service type is required" rule became "the services list must not be empty";
  each individual `ServiceDraftItem`/`ServiceRecordItem` still requires its own `serviceType`.
- Confirmation now promotes each `ServiceDraftItem` into its own `ServiceRecordItem`, in addition
  to the existing header-field copy.
- `Required Fields for Confirmation` and `Validation Rules` above reflect this current behavior;
  the Person B checkpoint's own field lists were written before this split and describe the
  contract as it stood at that time.

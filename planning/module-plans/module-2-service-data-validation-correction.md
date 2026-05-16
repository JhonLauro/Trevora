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
- draft fields such as serviceDate, serviceType, odometer, totalCost, shopName, partsReplaced, laborPerformed, remarks
- field_metadata from mock OCR or mock voice processing when available

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
- service type
- total cost

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
- ServiceRecord, if final validated records are implemented in Module 2
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
- If serviceType is missing, block confirmation.
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
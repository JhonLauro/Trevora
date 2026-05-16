# Planning Context

## Project

Trevora is a web-based vehicle service history system for vehicle owners and mechanics/service personnel. The system helps vehicle owners capture, validate, consolidate, understand, and share maintenance and repair records.

## Approved Modules

1. Service Record Input
2. Service Data Validation and Correction
3. Unified Vehicle Service History Consolidation
4. AI-Assisted Service Understanding and Mechanic Handoff

## Current Development Status

Module 1: Service Record Input is completed as an MVP and pushed.

Module 2: Service Data Validation and Correction is currently in progress.

Person A has completed:
- 2.1 Review Service Draft
- 2.2 Identify Missing Required and Flagged Fields

Person B will work on:
- 2.3 Correct Flagged or Incomplete Service Details
- 2.4 Confirm and Save Validated Record

## Module 1 Completed Scope

Module 1 allows the vehicle owner to create or select a vehicle profile before submitting a service record through one of three input methods:

1. Receipt image upload
2. Voice input
3. Manual entry

Regardless of input method, the system creates one structured ServiceDraft.

Module 1 completed transactions:

1.1 Create or Select Registered Vehicle Profile  
1.2 Upload Receipt and Extract Details  
1.3 Record Voice Service Information  
1.4 Enter Service Details Manually  
1.5 Convert Input to Structured Service Entry  

## Module 1 Handoff to Module 2

Module 1 produces ServiceDraft records from:

- Manual entry
- Receipt upload with mocked OCR processing
- Voice transcript input with mocked voice processing

All three input methods create the same ServiceDraft structure and store the result in the service_drafts table.

Module 2 must use these existing ServiceDraft records as its starting point.

## Module 2 Goal

Module 2 allows the vehicle owner to review, validate, correct, and confirm a ServiceDraft before it becomes a final validated service record.

The intended flow is:

ServiceDraft from Module 1  
→ Review draft  
→ Identify missing required fields and flagged fields  
→ Correct incomplete or inaccurate fields  
→ Confirm final validated details  
→ Save as ServiceRecord or validated record for Module 3  

## Module 2 Transactions

2.1 Review Service Draft  
2.2 Identify Missing Required and Flagged Fields  
2.3 Correct Flagged or Incomplete Service Details  
2.4 Confirm and Save Validated Record  

## Module 2 Person A Completed Scope

Person A completed the review and validation layer.

Completed features include:

- Dedicated ServiceDraft review screen
- Display of draft details from manual, receipt, and voice input
- Receipt-style preview and auto-filled fields for receipt drafts
- Source and confidence details for receipt and voice drafts
- Manual drafts treated as owner-entered
- Backend validation service and validation endpoints
- Required field validation
- Missing required field display
- Flagged or low-confidence field display
- Placeholder buttons for correction and confirmation

Person A did not implement correction or final saving.

## Module 2 Person B Current Scope

Person B must implement:

2.3 Correct Flagged or Incomplete Service Details  
2.4 Confirm and Save Validated Record  

Person B should build on top of Person A’s validation layer.

## Required Fields Before Confirmation

Before a draft can be confirmed and saved, the following fields must be present:

- Vehicle profile
- Service date
- Service type
- Total cost

Other fields may remain optional.

## Recommended Module 2 Backend Direction

Person B should reuse the existing validation components from Person A.

Recommended backend components:

- ServiceDraftCorrectionService
- ServiceRecordService
- ServiceRecordRepository
- ServiceRecord entity/model, if final validated records are added
- Correction request/response DTOs
- Confirmation request/response DTOs

Recommended backend behavior:

1. Retrieve an existing ServiceDraft.
2. Allow the owner to update/correct draft fields.
3. Re-run validation after corrections.
4. Block confirmation if required fields are still missing.
5. On confirmation, create a final ServiceRecord if the schema is ready.
6. Update the ServiceDraft status to confirmed/validated if supported.

## Recommended Module 2 Frontend Direction

Recommended frontend pages or sections:

- ServiceDraftCorrectionPage
- CorrectableFieldInput
- FieldCorrectionForm
- ServiceRecordConfirmationPage
- FinalServiceRecordSummary

The frontend should allow the owner to:

1. Edit missing or flagged draft fields.
2. Save corrections.
3. View updated validation results.
4. Review a final read-only summary.
5. Confirm and save the validated record.

## MVP Standard

The MVP should prove the end-to-end flow works. It does not need perfect UI, perfect OCR, perfect speech-to-text, or advanced confidence scoring.

For Module 2, the minimum working flow is:

Open existing ServiceDraft  
→ show validation results  
→ correct missing or flagged details  
→ confirm final information  
→ save validated record  

## What to Avoid

- Do not modify Module 1 input flows unless fixing a critical bug.
- Do not remove or break manual, receipt, or voice draft creation.
- Do not bypass backend validation.
- Do not allow confirmation if required fields are missing.
- Do not implement Module 3 service history pages yet.
- Do not implement Module 4 AI explanation, QR sharing, mechanic access, or AI search yet.
- Do not let mechanics edit owner records.
- Do not write directly to Supabase from the frontend for core service record operations.

## Important Technical Rules

- Keep the backend aligned with Controller → Service → Repository → Entity.
- Controllers should handle requests and responses only.
- Services should contain business logic.
- Repositories should handle database access.
- React frontend should communicate with the Spring Boot backend.
- Spring Boot backend should communicate with Supabase.
- Mock owner ID is still acceptable until real authentication is added.
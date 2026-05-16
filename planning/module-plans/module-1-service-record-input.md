# Module 1: Service Record Input

## Purpose

Module 1 allows the vehicle owner to create or select a registered vehicle profile and submit service record information through receipt image upload, voice input, or manual entry.

The output of this module is a structured ServiceDraft.

## Frontend Screens

1. VehicleProfileSelectionPage
   - Shows existing vehicle profiles.
   - Allows the owner to select a vehicle.
   - Allows the owner to create a new vehicle profile.

2. ReceiptUploadPage
   - Allows the owner to upload or capture a receipt image.
   - Shows upload status.
   - Creates a receipt-based ServiceDraft.
   - MVP may use mocked OCR extraction.

3. VoiceInputPage
   - Allows the owner to record or submit spoken service information.
   - MVP may use a text transcript field instead of real speech-to-text.
   - Creates a voice-based ServiceDraft.

4. ManualEntryPage
   - Allows the owner to manually enter service details.
   - Creates a manual ServiceDraft.

5. StructuredServiceDraftPage
   - Displays the generated ServiceDraft.
   - Shows the input method source: RECEIPT, VOICE, or MANUAL.

## Backend Components

Controllers:
- VehicleController
- ServiceRecordController

Services:
- VehicleService
- ServiceInputService
- OCRProcessingService
- VoiceProcessingService

Repositories:
- VehicleRepository
- ServiceDraftRepository

Domain Models / Entities:
- User
- VehicleProfile
- ServiceDraft
- ReceiptInput
- VoiceInput
- ManualInput
- FieldConfidence

Enums:
- InputMethod
- DraftStatus

## Required ServiceDraft Fields

- draftId
- vehicleId
- ownerId
- inputMethod
- serviceDate
- serviceType
- odometer
- totalCost
- shopName
- location
- partsReplaced
- laborPerformed
- remarks
- status
- createdAt

## MVP Endpoints

Vehicle:
- GET /api/vehicles
- POST /api/vehicles
- GET /api/vehicles/{vehicleId}

Service Draft:
- POST /api/service-drafts/manual
- POST /api/service-drafts/receipt
- POST /api/service-drafts/voice
- GET /api/service-drafts/{draftId}

## Acceptance Criteria

- User can create a vehicle profile.
- User can select a vehicle profile.
- User cannot create a service draft without a selected vehicle.
- User can create a draft through manual entry.
- User can upload a receipt and create a draft using mocked OCR if needed.
- User can submit voice/transcript input and create a draft using mocked speech-to-text if needed.
- All input methods create the same ServiceDraft format.
- User can view the structured draft.
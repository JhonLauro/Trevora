# Trevora Frontend Routes

## Module 1 Routes

| Route | Page Component | Purpose |
|---|---|---|
| `/vehicles` | `VehicleProfileSelectionPage` | Allows the owner to view, create, and select a vehicle profile. |
| `/service-input/:vehicleId/manual` | `ManualEntryPage` | Allows the owner to manually enter service details for the selected vehicle. |
| `/service-input/:vehicleId/receipt` | `ReceiptUploadPage` | Allows the owner to upload a receipt image for mocked OCR extraction. |
| `/service-input/:vehicleId/voice` | `VoiceInputPage` | Allows the owner to enter spoken-service transcript text for mocked voice processing. |
| `/service-drafts/:draftId` | `StructuredServiceDraftPage` | Displays the structured service draft created from manual, receipt, or voice input. |

## Module 1 Navigation Flow

1. User opens `/vehicles`.
2. User creates or selects a vehicle.
3. User chooses an input method:
   - Manual → `/service-input/:vehicleId/manual`
   - Receipt → `/service-input/:vehicleId/receipt`
   - Voice → `/service-input/:vehicleId/voice`
4. After successful draft creation, the frontend navigates to `/service-drafts/:draftId`.

## Important Rules

- Do not allow service input without a selected `vehicleId`.
- All input methods must navigate to the same structured draft page after success.
- Keep page components aligned with the SDD names unless there is a clear implementation reason to rename them.
# Trevora Frontend Design Reference

This folder contains screenshots of the intended Trevora user interface.

The screenshots are design references, not strict pixel-perfect requirements. The implementation should follow the same user flow, visual hierarchy, and main UI elements while preserving working MVP functionality.

## Important Scope Note

Some screenshots show the full intended flow from service input to validation, confirmation, and saved record. For implementation, these are separated by module:

- Module 1: Service Record Input
- Module 2: Service Data Validation and Correction

During Module 1 development, implement only the screens needed to create a structured ServiceDraft:
- Vehicle selection / add vehicle
- Service input method selection
- Receipt upload
- Receipt processing using mocked OCR
- Voice input using mocked transcript/voice processing
- Manual entry
- Structured draft display

Do not implement final validation, confirmation, or saved service records until Module 2.

## Module 1 Design Screens

| Screen | Purpose |
|---|---|
| My Vehicles / Add Vehicle Modal | Allows the owner to create or select a registered vehicle profile. |
| Add Service Record Method Selection | Allows the owner to choose Receipt, Voice, or Manual input. |
| Receipt Upload | Allows the owner to upload a receipt image. |
| Receipt Processing | Shows OCR/AI processing progress before creating a draft. |
| Voice Input | Allows the owner to record or enter spoken service information. |
| Manual Entry | Allows the owner to manually enter service details. |
| Structured Draft Display | Shows the generated draft from any input method. |

## Module 2 Preview Screens

Screens that mention validation, correction, confirmation, or saved records belong to Module 2. These should be used later when implementing Service Data Validation and Correction.
# Frontend Context

## Purpose

This workspace contains the React frontend for Trevora.

## Frontend Rules

- Build simple, clean, usable MVP screens.
- Prioritize working flow over visual polish.
- Keep pages aligned with SDD screen names.
- Show loading, success, and error states where needed.
- Do not create unrelated pages outside Module 1 unless asked.

## Module 1 Frontend Scope

Build the following screens:

- VehicleProfileSelectionPage
- ReceiptUploadPage
- VoiceInputPage
- ManualEntryPage
- StructuredServiceDraftPage

## User Flow

Vehicle owner creates/selects vehicle  
→ chooses receipt, voice, or manual input  
→ submits service information  
→ views structured ServiceDraft  

## UI Standard

The UI does not need to exactly match the high-fidelity design yet, but it must be understandable, navigable, and demo-ready.

## Design References

Frontend UI screenshots are stored in:

`/frontend/design-reference`

Before changing frontend layout or routes, read:

- `/frontend/design-reference/README.md`
- `/frontend/design-reference/routes.md`

Use the screenshots as visual references. The implementation does not need to be pixel-perfect, but it should preserve the same flow, page purpose, and main UI elements.

## Module 2 Frontend Scope

Module 2 starts from an existing ServiceDraft created by Module 1.

The frontend should allow the owner to:

1. Review the draft.
2. See missing required fields.
3. See low-confidence or source metadata when available.
4. Correct draft fields.
5. Confirm and save the validated record.

Do not break Module 1 routes or input flows.
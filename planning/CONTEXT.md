# Planning Context

## Project

Trevora is a web-based vehicle service history system for vehicle owners and mechanics/service personnel. The system helps vehicle owners capture, validate, consolidate, understand, and share maintenance and repair records.

## Approved Modules

1. Service Record Input
2. Service Data Validation and Correction
3. Unified Vehicle Service History Consolidation
4. AI-Assisted Service Understanding and Mechanic Handoff

## Current Development Status

Module 1 MVP is complete:
- Vehicle create/select
- Manual service record input
- Receipt upload with mocked OCR
- Voice transcript with mocked processing
- Structured ServiceDraft display

Module 2 MVP is complete:
- Review ServiceDraft
- Validate missing required and flagged fields
- Correct draft fields
- Confirm and save validated ServiceRecord
- Mark draft as CONFIRMED

Module 3 MVP is complete:
- Unified service history from confirmed service_records
- Vehicle-scoped history
- Chronological sorting
- Basic filtering/categorization
- Record detail view

## Current Focus

Module 4: AI-Assisted Service Understanding and Mechanic Handoff.

## Module 4 Development Split

| Person | Scope |
|---|---|
| Person A | Authentication / Access Foundation + Login/Register |
| Person B | AI-generated service explanation |
| Person C | QR/share access request and owner approval |
| Person D | Temporary mechanic read-only access and mechanic search |

## Module 4 Goal

Module 4 should allow vehicle owners to understand confirmed service records through AI-generated explanations and share selected vehicle service history with mechanics using owner-approved temporary read-only access.

## Module 4 MVP Boundary

For MVP, AI-generated explanations and AI-assisted search may use mock/template logic.

The MVP must still enforce the important access rules:
- no mechanic access before owner approval
- no mechanic editing
- access is temporary
- access is limited to the approved vehicle
- shared data comes from confirmed service_records only

## Module 4 Authentication Foundation

Login and registration are now part of Person A's Module 4 foundation. The MVP must support `VEHICLE_OWNER` and `MECHANIC` users, with `ADMIN` kept as an optional placeholder role.

Vehicle owners use the existing Modules 1-3 owner workflows and Module 4 owner features. Mechanics must only use Module 4 mechanic access features after owner approval. Mechanic-facing access must use confirmed `service_records`, never incomplete `service_drafts`.

For development safety, the existing mock owner fallback should remain available when no logged-in user or current-user headers are present.

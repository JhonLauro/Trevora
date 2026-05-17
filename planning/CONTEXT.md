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
- Manual input
- Receipt upload with mocked OCR
- Voice transcript with mocked processing
- Structured ServiceDraft display

Module 2 MVP is complete:
- Review ServiceDraft
- Validate missing required and flagged fields
- Correct draft fields
- Confirm and save validated ServiceRecord
- Mark draft as CONFIRMED

Module 3 MVP is complete and verified:
- Confirmed ServiceRecord history by VehicleProfile
- Latest-first and oldest-first chronological sorting
- Service type filtering and deterministic keyword search
- List and grid service history views
- Standalone service record detail page
- Vehicle/owner scoped backend history APIs

## Current Focus

Build Module 4: AI-Assisted Service Understanding and Mechanic Handoff.

## Module 3 Goal

Module 3 should display confirmed ServiceRecord data under the correct registered VehicleProfile.

The owner should be able to view a selected vehicle’s confirmed service records, sorted chronologically, filtered/categorized, and shown in one unified service history page.

## Important Module 3 Boundary

Do not build history from incomplete ServiceDraft rows.

Do not implement AI explanation, QR sharing, mechanic handoff, or AI-assisted search. Those belong to Module 4.

## Module 4 Starting Point

Module 4 can start from the verified Module 3 history baseline:

- `GET /api/vehicles/{vehicleId}/history`
- `GET /api/vehicles/{vehicleId}/history/{recordId}`
- `/vehicles/:vehicleId/history`
- `/vehicles/:vehicleId/history/:recordId`

Module 4 should continue using confirmed `service_records`, keep vehicle/owner scoping, and avoid treating incomplete `service_drafts` as service history.

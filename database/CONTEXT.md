# Database Context

## Purpose

This workspace contains Supabase database and storage design for Trevora.

## Current Focus

Module 4 planning and implementation support.

## Required Tables for Module 1 MVP

- users
- vehicle_profiles
- service_drafts
- field_confidences

Optional for MVP:
- receipt_inputs
- voice_inputs
- manual_inputs

## Rules

- Each vehicle profile belongs to one user.
- Each service draft belongs to one vehicle profile.
- Each service draft must have an input method.
- Receipt, voice, and manual input must all map to service_drafts.
- Uploaded receipt images and audio files may be stored in Supabase storage, with file references saved in the database.

## Module 3 Database Scope

Module 3 uses the `service_records` table created in Module 2.

Expected relationships:

- One User owns many VehicleProfiles.
- One VehicleProfile has many ServiceRecords.
- One ServiceRecord may reference one ServiceDraft through `draft_id` for traceability.

## Module 3 Data Rules

- Vehicle service history must be built from `service_records`.
- Do not display incomplete `service_drafts` as vehicle history.
- Keep `service_records.draft_id` for traceability.
- Queries should be scoped by `vehicle_id`.
- Access should be checked through the selected vehicle ownership.

## Useful Query Requirements

Module 3 may need repository queries for:

- find confirmed records by vehicleId
- find record by vehicleId and recordId
- sort by serviceDate descending or ascending
- filter by serviceType
- search by keyword across serviceType, shopName, partsReplaced, laborPerformed, remarks

## Module 3 Database Status

Module 3 MVP is complete and verified without a new database migration. It uses the existing Module 2 `service_records` table as the confirmed history source.

## Module 4 Database Starting Point

Module 4 should continue treating `service_records` as confirmed service history. If AI explanations, mechanic handoff, QR sharing, or access logs require persistence, add those as Module 4-specific tables or fields without weakening vehicle/owner scoping or changing incomplete `service_drafts` into history records.

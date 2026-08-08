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

## Module 4 Database Status

Project was paused for ~3 months (resumed 2026-08-08). Module 4 migrations are applied, not just suggested:

- `003_module_4_auth_foundation.sql` — auth foundation (`password_hash` etc. on `users`)
- `004_module_4_qr_owner_approval.sql` — QR/access request and mechanic access session tables, owner approval flow
- `005_split_user_names.sql` — user name field split

`service_records` remains the confirmed service history source; `service_drafts` continues to be excluded from history/mechanic-facing views. Confirm current table/column names directly in the migration files above rather than the "suggested" schema below, since implementation may have diverged from the original suggestion during Module 4 build-out.

## Module 4 Data Rules

- AI explanations should reference confirmed `service_records`.
- QR/share access requests should reference selected `vehicle_profiles`.
- Mechanic access sessions should reference approved access requests.
- Supported MVP account roles are `VEHICLE_OWNER` and `ADMIN`. Mechanics are not registered users; mechanic identity is captured on temporary access request rows.
- Vehicle owners use Modules 1-4 owner features.
- Mechanics use Module 4 mechanic access features only after owner approval.
- Mechanic access must expire.
- Mechanic access must be scoped to one vehicle.
- Mechanic search must only search records from the approved vehicle.
- Do not expose incomplete `service_drafts`.

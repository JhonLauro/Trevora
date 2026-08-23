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

## Receipt line entries (011)

A visit is three levels deep, not two:

```
service_records          one shop visit  (date, shop, odometer, total_cost)
  service_record_items   one service performed  (service_type, service_category)
    service_record_line_entries   one printed line  (kind, description, part_code, qty, unit_price, line_total)
```

`service_drafts` mirrors this exactly, one table per level.

`kind` is the column the rest of the product turns on:

| kind | means | may identify a component? |
|---|---|---|
| `OPERATION` | labour the shop performed | **yes — only this one** |
| `PART` | fitted to the vehicle and still on it | no |
| `MATERIAL` | consumed doing the work (paint, thinner, tape, rags) | no |
| `FEE` | charged but neither (disposal, shop supplies, towing) | no |

**Component attribution comes from the operation, never from the materials.**
This is the rule 011 exists to make expressible. Before it there were two
free-text buckets, `parts_replaced` and `labor_performed`, so a Toyota
body-and-paint invoice's eleven consumables were all stored as replaced parts —
and three separate keyword matchers (parts map, AI explanation, spend category)
read "WASTE PAD" as brake work. The owner was shown a brake service they never
had. A can of degreaser is not evidence about any part of the car.

`parts_replaced` and `labor_performed` still exist on the item tables and are
being retired. New readers must use line entries; the columns are dropped once
review, correction, detail and the explanation have moved over.

`line_total` is what the receipt printed, not `quantity * unit_price`. Where
the invoice disagrees with the arithmetic, the invoice is the fact.

Both tables are fail-closed RLS with no policies, matching 006 and 007.

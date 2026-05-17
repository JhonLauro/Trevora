# Module 3: Unified Vehicle Service History Consolidation

## Purpose

Module 3 displays and organizes validated vehicle service records after they have been confirmed in Module 2.

Module 3 must use confirmed `ServiceRecord` data created by Module 2. It should not use incomplete `ServiceDraft` records as the main source for service history.

## SDD Transactions

3.1 Link Validated Record to Vehicle Profile
3.2 Organize Records Chronologically
3.3 Categorize Service Records
3.4 View Unified Vehicle Service History

## Module 3 Input

Module 3 receives confirmed/validated service records from Module 2.

Expected source table/model:

- `service_records`

Related data:

- `vehicle_profiles`
- `users`
- optionally `service_drafts` through `service_records.draft_id` for traceability

## Module 3 Output

The vehicle owner should be able to:

1. View confirmed service records under the correct vehicle profile.
2. See the selected vehicle’s service history in chronological order.
3. Filter or categorize records by service type, parts, cost, shop/mechanic, or keywords.
4. Open/view the complete unified service history for one registered vehicle.

## Important MVP Boundary

Module 3 should not create new service drafts. That belongs to Module 1.

Module 3 should not validate, correct, or confirm drafts. That belongs to Module 2.

Module 3 should not implement AI explanations, QR sharing, mechanic access, or AI-assisted search. Those belong to Module 4.

## Existing Handoff from Module 2

Module 2 confirmation creates or updates a validated `ServiceRecord` and marks the related draft as `CONFIRMED`.

Module 3 should build history screens and APIs using `service_records`.

Do not build history from incomplete `service_drafts`.

## Module 3 Transactions

### 3.1 Link Validated Record to Vehicle Profile

The system must ensure each validated ServiceRecord is associated with the correct VehicleProfile.

For MVP, this may already happen during Module 2 confirmation. If so, Module 3 should verify and display that relationship instead of duplicating confirmation logic.

Expected behavior:
- ServiceRecord has `vehicleId`.
- VehicleProfile owns many ServiceRecords.
- The owner can only view records for vehicles they own.

### 3.2 Organize Records Chronologically

The system displays service records by service date.

Expected behavior:
- Default sort should be latest-first.
- Optional toggle may allow oldest-first.
- If service date is missing, use created date as fallback only if needed.
- Records must be scoped to one selected vehicle.

### 3.3 Categorize Service Records

The system allows the owner to browse/filter records by service-related categories.

MVP filters:
- service type
- keyword search across service type, parts replaced, labor performed, shop name, remarks
- optional cost range
- optional shop/mechanic name

### 3.4 View Unified Vehicle Service History

The system displays all confirmed service records for a selected vehicle in one centralized page.

Expected behavior:
- Vehicle details appear in the page header.
- Confirmed service records appear in a list/timeline.
- Owner can open a record detail view.
- Empty state appears if the vehicle has no confirmed records.

## Suggested Frontend Routes

Recommended:

- `/vehicles/:vehicleId/history`
- `/vehicles/:vehicleId/history/:recordId`

Optional:
- `/vehicles/:vehicleId/history?sort=latest`
- `/vehicles/:vehicleId/history?serviceType=Oil%20change`

## Suggested Frontend Pages

- `VehicleServiceHistoryPage`
- `ServiceRecordDetailPage` or `ServiceRecordDetailDrawer`
- `ServiceTimelineView`
- `ServiceRecordTimelineItem`
- `HistoryFilterToolbar`
- `TimelineEmptyState`

## Suggested Backend Endpoints

History:
- `GET /api/vehicles/{vehicleId}/history`
- `GET /api/vehicles/{vehicleId}/history/{recordId}`

Optional filters as query params:
- `sort`
- `serviceType`
- `keyword`
- `minCost`
- `maxCost`
- `shopName`

Example:
`GET /api/vehicles/{vehicleId}/history?sort=latest&keyword=oil`

## Suggested Backend Components

Controllers:
- `HistoryController`

Services:
- `ServiceHistoryService`
- `VehicleService`

Repositories:
- `ServiceRecordRepository`
- `VehicleRepository`

Entities / Models:
- `ServiceRecord`
- `VehicleProfile`

DTOs:
- `ServiceHistoryResponse`
- `ServiceRecordSummaryResponse`
- `ServiceRecordDetailResponse`
- `HistoryFilterRequest` or query parameters

## Validation and Access Rules

- The selected vehicle must belong to the authenticated/mock owner.
- Service history must only return records for the selected vehicle.
- Do not expose records from other vehicles.
- Do not return incomplete `ServiceDraft` records as history.
- Only confirmed/validated `ServiceRecord` rows should be displayed.

## MVP Sorting Rules

Default:
- Sort by `serviceDate` descending.
- If two records have the same service date, sort by `createdAt` descending.

Optional:
- Allow `sort=oldest` for ascending order.

## MVP Filtering Rules

Keyword search may check:
- serviceType
- shopName
- partsReplaced
- laborPerformed
- remarks

Service type filter may check:
- exact service type match or case-insensitive match

Cost filters:
- optional `minCost`
- optional `maxCost`

## Do Not Break

Module 1 routes:
- `/vehicles`
- `/service-input/:vehicleId`
- `/service-input/:vehicleId/manual`
- `/service-input/:vehicleId/receipt`
- `/service-input/:vehicleId/voice`
- `/service-drafts/:draftId`

Module 2 routes:
- `/service-drafts/:draftId/review`
- `/service-drafts/:draftId/correct`
- `/service-drafts/:draftId/confirm`
- `/service-drafts/:draftId/saved`

Do not change Module 1 draft creation behavior.
Do not change Module 2 confirmation behavior unless needed for a minimal integration fix.

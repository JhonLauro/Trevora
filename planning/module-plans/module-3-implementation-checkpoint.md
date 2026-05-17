# Module 3 Implementation Checkpoint: Unified Vehicle Service History Consolidation

Last updated: May 17, 2026

## 1. Module 3 Status Summary

Module 3 is implemented and verified as an MVP. It displays confirmed service history for a selected vehicle using `service_records` created by Module 2 confirmation. It does not display incomplete `service_drafts` rows as history and does not implement Module 4 mechanic handoff, QR sharing, AI explanation, or AI-assisted search.

Backend compile/test, frontend production build, and live backend history API verification passed on May 17, 2026. Module 4 is ready to start from the confirmed service history baseline.

## 2. Completed Module 3 Features

- Backend history controller and service.
- Vehicle ownership check before history access.
- Service history list endpoint scoped by `vehicleId` and mock owner.
- Service history detail endpoint scoped by `vehicleId`, `recordId`, and mock owner.
- Default latest-first chronological sorting.
- Optional `sort=oldest`.
- Service type filter.
- Keyword search across service type, shop/mechanic, parts, labor, and remarks.
- Simple MVP category labels for history records.
- Frontend service history API client.
- Vehicle service history route and page.
- History list and grid views with empty, loading, and error states.
- Standalone record detail route and page.
- View History action from vehicle cards.
- View History action from the saved-record page.
- Sidebar Service History link for the active vehicle.

## 3. Transaction-by-Transaction Implementation Status

### 3.1 Link Validated Record to Vehicle Profile

Status: Complete for MVP.

Module 2 confirmation writes `vehicle_id` into `service_records`. Module 3 verifies the selected vehicle belongs to the mock owner before returning history. History list queries use both `vehicleId` and owner id.

Implemented by:

- `ServiceHistoryService#getVehicleHistory`
- `ServiceHistoryService#getVehicleHistoryRecord`
- `VehicleService#verifyVehicleBelongsToMockOwner`
- `ServiceRecordRepository#findByVehicleIdAndOwnerId`
- `ServiceRecordRepository#findByRecordIdAndVehicleIdAndOwnerId`

### 3.2 Organize Records Chronologically

Status: Complete.

Default sorting is latest service date first. When two records have the same service date, created time is used as the secondary sort. `sort=oldest` reverses this to oldest first.

### 3.3 Categorize Service Records

Status: Complete for MVP.

Records receive simple category labels:

- `Maintenance` for oil/filter/tire/tyre service types.
- `Repair` for brake/battery/repair/replace service types.
- `Inspection` for inspect/diagnostic/check service types.
- `General` fallback.

The frontend displays category chips and supports service type filtering.

### 3.4 View Unified Vehicle Service History

Status: Complete for MVP.

The owner can open `/vehicles/:vehicleId/history`, see selected vehicle information, view confirmed service records in list or grid mode, filter/search/sort records, and open a standalone record detail page through `/vehicles/:vehicleId/history/:recordId`.

## 4. Current Frontend Routes and Pages

Module 3 routes:

| Route | Page | Purpose |
|---|---|---|
| `/vehicles/:vehicleId/history` | `VehicleServiceHistoryPage` | View confirmed service records for one vehicle. |
| `/vehicles/:vehicleId/history/:recordId` | `ServiceRecordDetailPage` | Open one confirmed record on its own detail page. |

Existing Module 1 routes preserved:

- `/vehicles`
- `/service-input/:vehicleId`
- `/service-input/:vehicleId/manual`
- `/service-input/:vehicleId/receipt`
- `/service-input/:vehicleId/voice`
- `/service-drafts/:draftId`

Existing Module 2 routes preserved:

- `/service-drafts/:draftId/review`
- `/service-drafts/:draftId/correct`
- `/service-drafts/:draftId/confirm`
- `/service-drafts/:draftId/saved`

## 5. Current Frontend Components

Module 3 pages/components:

- `VehicleServiceHistoryPage`
- `ServiceRecordDetailPage`

Existing components touched for navigation:

- `App`
- `AppShell`
- `VehicleProfileSelectionPage`
- `ServiceRecordSavedPage`

API client:

- `api/serviceHistory.js`
  - `getVehicleServiceHistory`
  - `getVehicleServiceRecord`

## 6. Current Backend Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/vehicles/{vehicleId}/history` | Return confirmed history records for the selected vehicle. |
| `GET` | `/api/vehicles/{vehicleId}/history/{recordId}` | Return one confirmed history record for the selected vehicle. |

Supported query parameters for the list endpoint:

- `sort`
- `serviceType`
- `keyword`

## 7. Current Backend Controllers, Services, Repositories, Entities, DTOs, and Enums

Controllers:

- `HistoryController`
- existing `VehicleController`
- existing `ServiceRecordController`
- existing `ValidationController`

Services:

- `ServiceHistoryService`
- existing `VehicleService`
- existing `ServiceRecordService`
- existing Module 1/2 services

Repositories:

- `ServiceRecordRepository`
- existing `VehicleRepository`
- existing `ServiceDraftRepository`

Entities:

- `ServiceRecord`
- `VehicleProfile`
- `User`
- `ServiceDraft` remains only for traceability and Module 1/2 flows, not as the history source.

Module 3 DTOs:

- `ServiceHistoryResponse`
- `ServiceRecordSummaryResponse`
- `ServiceRecordDetailResponse`

Relevant enums:

- `InputMethod`
- `DraftStatus` remains relevant to Module 2, but Module 3 does not query drafts by status.

## 8. Current Database Tables/Fields Used by Module 3

Primary source table:

- `service_records`

Fields used:

- `record_id`
- `draft_id`
- `vehicle_id`
- `owner_id`
- `source_input_method`
- `service_date`
- `service_type`
- `odometer`
- `total_cost`
- `shop_name`
- `location`
- `parts_replaced`
- `labor_performed`
- `remarks`
- `field_metadata`
- `created_at`
- `updated_at`

Relationship/access tables:

- `vehicle_profiles`
- `users`

Traceability only:

- `service_drafts` through `service_records.draft_id`

No Module 3 schema migration was needed.

## 9. Sorting Behavior

Default:

- `sort` omitted or unknown -> `latest`
- Sorts by `serviceDate` descending, then `createdAt` descending.

Oldest first:

- `sort=oldest`
- Sorts by `serviceDate` ascending, then `createdAt` ascending.

## 10. Filtering/Categorization Behavior

Filters:

- `serviceType`: exact case-insensitive match.
- `keyword`: case-insensitive contains search across `serviceType`, `shopName`, `partsReplaced`, `laborPerformed`, and `remarks`.

Categories:

- Generated in `ServiceHistoryService` from `serviceType`.
- Used for MVP display and browsing context.
- Not persisted to the database.

## 11. How Module 3 Receives Data from Module 2

Module 2 confirmation creates or updates a `ServiceRecord` from a valid `ServiceDraft` and marks the draft `CONFIRMED`. Module 3 reads those `service_records` rows by selected `vehicleId` and mock owner id.

Module 3 does not:

- create drafts,
- correct drafts,
- confirm drafts,
- read incomplete drafts as history.

## 12. How Module 3 Hands Off to Module 4

Module 3 provides the consolidated confirmed vehicle history that Module 4 can later use for AI-assisted explanations, mechanic handoff, QR sharing, and search. Module 4 should read confirmed `service_records` and respect vehicle/owner scoping.

Module 3 currently does not expose mechanic access, AI summaries, QR links, or AI-assisted search. Those features are the next module boundary and can start from the verified history list/detail routes.

## 13. Known MVP Limitations

- Authentication is still mocked.
- No automated backend tests cover the history service.
- No automated frontend tests cover the history page.
- Service categories are simple keyword-derived labels.
- Filters are limited to service type and keyword.
- No pagination exists yet.
- Service history sidebar link uses `trevora.activeVehicleId`.

## 14. Remaining Risks/Technical Debt

- `service_records` has no explicit status column; the code treats rows in this table as confirmed because Module 2 only writes them after validation/confirmation.
- If other future code writes to `service_records`, it must preserve the invariant that rows are confirmed/validated.
- History filtering currently happens in the service after loading records for the selected vehicle. This is acceptable for MVP but may need repository/database filtering later.
- Runtime verification was completed against the currently running local backend/Supabase setup; future developers still need local Supabase environment variables to run the backend from a fresh shell.

## 15. What Module 4 Developers Should Not Break

- Do not read incomplete `service_drafts` as service history.
- Do not remove `service_records.draft_id` traceability.
- Do not bypass `vehicleId` and owner scoping.
- Do not expose records from another vehicle in detail views.
- Do not replace the Module 3 history APIs with frontend-direct Supabase reads.
- Do not turn keyword search into AI-assisted search without keeping the current deterministic filter behavior available.
- Do not add mechanic handoff, QR sharing, or AI explanation into Module 3 routes unless the module boundary is explicitly changed.

## 16. Audit Result

SDD alignment:

- 3.1 Link Validated Record to Vehicle Profile: aligned.
- 3.2 Organize Records Chronologically: aligned.
- 3.3 Categorize Service Records: aligned for MVP.
- 3.4 View Unified Vehicle Service History: aligned.

Backend audit:

- Uses `service_records` as the history source.
- Does not query incomplete `service_drafts` for history.
- Verifies selected vehicle ownership before history access.
- List endpoint scopes by `vehicleId` and owner id.
- Detail endpoint scopes by `recordId`, `vehicleId`, and owner id.
- Controller -> Service -> Repository -> Entity layering is preserved.

Frontend audit:

- `/vehicles/:vehicleId/history` route exists.
- `/vehicles/:vehicleId/history/:recordId` detail route exists.
- Vehicle card View History action exists.
- Saved-record page View History action exists.
- Module 1 and Module 2 routes are preserved.
- No Module 4 UI features were added.

UI/design-reference audit:

- No `frontend/design-reference/module-3` folder exists.
- Root-level Module 3 reference screenshots exist at `frontend/design-reference/module3-ref.png`, `module3-ref2.png`, `module3-ref3.png`, `module3-ref4.png`, and `module3-ref5.png`.
- The implementation follows the existing AppShell, page header, filter bar, badge, and history display patterns.
- The history page now supports list and grid view modes to match the reference direction.
- The detail action now opens a standalone detail page. The page follows the reference layout structure while intentionally leaving AI explanation content for Module 4.
- History rows/items visibly show `Validated`, matching the reference emphasis that history records are confirmed records.

Issues found and fixed:

- The sidebar module chip was hard-coded to Module 3 on every route. It now reflects Module 1, Module 2, or Module 3 based on the current route.
- The earlier in-page detail behavior could keep an old selected record while a new detail request was loading or failing. The detail flow now uses a standalone route/page.
- History timeline items now show a `Validated` badge to better align with the Module 3 reference screens and clarify that incomplete drafts are not being displayed.
- The history page was missing the requested list/grid view switch. It now supports both views.
- The detail action previously behaved like an in-page detail experience. It now opens `/vehicles/:vehicleId/history/:recordId` as a standalone detail page.

Verification:

- Backend command: `cmd /c "set JAVA_HOME=C:\Users\USER\Trevora\.tools\jdk21\jdk-21.0.11+10&& set PATH=C:\Users\USER\Trevora\.tools\jdk21\jdk-21.0.11+10\bin;%PATH%&& .\mvnw.cmd test"` from `backend/trevora-api`.
- Backend result: passed. Maven build success; no test sources were present.
- Frontend command: `npm run build` from `frontend/trevora-web`.
- Frontend result: passed.
- Runtime API result: passed against the currently running backend on `localhost:8080`.
- Confirmed test vehicle: `bf11a399-94f8-4588-8295-04003c7b2cf7` (`Route UI Verify`), with 8 confirmed records.
- List endpoint verified: `GET /api/vehicles/bf11a399-94f8-4588-8295-04003c7b2cf7/history`.
- Detail endpoint verified: `GET /api/vehicles/bf11a399-94f8-4588-8295-04003c7b2cf7/history/06ed1d06-292c-4a91-9274-7bac2f581203`.
- Sorting verified: `sort=oldest`.
- Filtering verified: `serviceType=Receipt-based service`.
- Keyword search verified: `keyword=receipt`.
- Frontend dev route smoke checks passed on `localhost:5173` for `/vehicles` and the sample history route.

Local runtime commands to run with Supabase env vars configured:

```powershell
cd C:\Users\USER\Trevora\backend\trevora-api
$env:JAVA_HOME='C:\Users\USER\Trevora\.tools\jdk21\jdk-21.0.11+10'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
$env:SUPABASE_DB_URL='jdbc:postgresql://<host>:<port>/<database>?sslmode=require'
$env:SUPABASE_DB_USERNAME='<username>'
$env:SUPABASE_DB_PASSWORD='<password>'
.\mvnw.cmd spring-boot:run
```

Then test:

```powershell
Invoke-RestMethod 'http://localhost:8080/api/vehicles/<vehicleId>/history'
Invoke-RestMethod 'http://localhost:8080/api/vehicles/<vehicleId>/history?sort=oldest'
Invoke-RestMethod 'http://localhost:8080/api/vehicles/<vehicleId>/history?serviceType=<serviceType>'
Invoke-RestMethod 'http://localhost:8080/api/vehicles/<vehicleId>/history?keyword=<keyword>'
Invoke-RestMethod 'http://localhost:8080/api/vehicles/<vehicleId>/history/<recordId>'
```

Frontend runtime command:

```powershell
cd C:\Users\USER\Trevora\frontend\trevora-web
npm run dev
```

Open `/vehicles`, click View History on a vehicle with confirmed records, verify records display, apply filters/sort/search, and open a record detail view.

Final verdict:

- Ready to commit.
- Module 4 is ready to start.

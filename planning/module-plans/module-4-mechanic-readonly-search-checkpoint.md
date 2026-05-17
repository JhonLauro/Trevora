# Module 4 Mechanic Read-Only Access and Search Checkpoint

Last updated: May 17, 2026

## 1. Person D Status Summary

Module 4 Person D transactions 4.5 and 4.6 are implemented as an MVP.

Completed scope:

- 4.5 Provide Temporary Read-Only Access
- 4.6 Search Shared Records with AI Assistance

The implementation builds on Person C's approved `mechanic_access_sessions`. Mechanics can open an approved temporary session, view confirmed service records for the approved vehicle only, open a read-only detail view, and run keyword/mock-AI search within only those shared records.

This work does not implement QR generation, owner approval/denial, owner AI explanation, authentication changes, or any Module 1-3 owner workflow changes beyond a small sidebar layout fix.

## 2. Completed Person D Features

- Mechanic-specific backend access service.
- Mechanic-specific backend search service.
- Approved-session validation before returning shared records.
- Expiration validation before returning shared records.
- Read-only permission validation.
- Confirmed `service_records` returned for the session's approved vehicle only.
- Mechanic shared history DTOs that do not expose `draftId`, `ownerId`, or draft metadata.
- Mechanic shared record detail endpoint and read-only detail page.
- Mechanic search endpoint and frontend search panel.
- Keyword/mock-AI search across service type, shop, parts, labor, and remarks.
- Simple semantic handling for common queries such as most recent service, oil, brake, battery, and tire terms.
- Invalid, expired, non-approved, or non-read-only sessions are blocked.
- QR request-link sidebar bug fixed so `/access/request/:token` displays the Demo Mechanic identity.
- Sidebar account block is pinned on desktop so it stays visible while page content scrolls.

## 3. Transaction-by-Transaction Implementation Status

### 4.5 Provide Temporary Read-Only Access

Status: Complete for MVP.

Implemented by:

- Backend: `MechanicAccessController`
- Backend service: `MechanicAccessService`
- DTOs:
  - `MechanicSharedHistoryResponse`
  - `MechanicSharedRecordDetailResponse`
  - `MechanicSharedServiceRecordResponse`
- Frontend route: `/mechanic/access/:sessionId`
- Frontend page: `MechanicAccessSessionPlaceholderPage`
- Frontend route: `/mechanic/access/:sessionId/history/:recordId`
- Frontend page: `MechanicSharedRecordDetailPage`

The page shows temporary read-only access status, approved vehicle context, confirmed shared service records, and no edit/create/delete/correction/validation controls.

### 4.6 Search Shared Records with AI Assistance

Status: Complete for MVP.

Implemented by:

- Backend service: `MechanicSearchService`
- DTO: `MechanicSearchResponse`
- Frontend component: `MechanicAISearchPanel`
- Frontend API: `api/mechanicAccess.js`

Search is keyword/mock-AI for MVP. It is isolated behind `MechanicSearchService` so it can be replaced with real AI search later.

## 4. Current Frontend Routes and Pages

Person D routes:

| Route | Page | Purpose |
|---|---|---|
| `/mechanic/access/:sessionId` | `MechanicAccessSessionPlaceholderPage` | Show approved temporary read-only history and mechanic search. |
| `/mechanic/access/:sessionId/history/:recordId` | `MechanicSharedRecordDetailPage` | Show one shared service record in read-only mode. |

Related Person C route affected by the bug fix:

| Route | Page | Purpose |
|---|---|---|
| `/access/request/:token` | `MechanicAccessRequestPage` | Mechanic submits or checks a temporary access request. |

`/access/request/:token` now renders inside `AppShell` and forces the Demo Mechanic identity in the sidebar for the request page.

## 5. Current Frontend Components and API Helpers

New frontend pieces:

- `MechanicAISearchPanel`
- `MechanicSharedRecordDetailPage`
- `api/mechanicAccess.js`

Updated frontend pieces:

- `MechanicAccessSessionPlaceholderPage`
- `QRSharingPage`
- `App`
- `AppShell`
- `api/qrAccess.js`
- `styles.css`

The Person C placeholder page name remains `MechanicAccessSessionPlaceholderPage`, but it now contains the real Person D read-only history/search implementation.

## 6. Current Backend Endpoints

Person C owner/request endpoints remain unchanged:

- `POST /api/qr-access/requests`
- `GET /api/qr-access/requests?vehicleProfileId={vehicleId}`
- `GET /api/qr-access/requests/{token}`
- `POST /api/qr-access/requests/{token}/mechanic-request`
- `GET /api/qr-access/requests/{token}/mechanic-request/status`
- `GET /api/mechanic-access/requests/pending`
- `GET /api/mechanic-access/requests?status={status}`
- `POST /api/mechanic-access/requests/{requestId}/approve`
- `POST /api/mechanic-access/requests/{requestId}/deny`

Person D mechanic endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/mechanic-access/sessions/{sessionId}/history` | Return approved temporary read-only service history. |
| `GET` | `/api/mechanic-access/sessions/{sessionId}/history/search?query={query}` | Search approved shared records only. |
| `GET` | `/api/mechanic-access/sessions/{sessionId}/history/{recordId}` | Return one approved shared record in read-only form. |

## 7. Current Backend Controllers, Services, Repositories, Entities, DTOs, and Enums

Updated controller:

- `MechanicAccessController`

New services:

- `MechanicAccessService`
- `MechanicSearchService`

Updated service:

- `ServiceHistoryService`
  - Mechanic-specific session history logic was removed from owner history service and moved into `MechanicAccessService`.

New DTOs:

- `MechanicSharedServiceRecordResponse`
- `MechanicSharedHistoryResponse`
- `MechanicSharedRecordDetailResponse`
- `MechanicSearchResponse`

Existing repositories used:

- `MechanicAccessSessionRepository`
- `ServiceRecordRepository`
- `VehicleRepository`

Existing entities used:

- `MechanicAccessSession`
- `ServiceRecord`
- `VehicleProfile`

No new repository or entity was required.

## 8. Current Database Tables/Fields Used by Person D

Person D reuses Person C's migration:

- `database/migrations/004_module_4_qr_owner_approval.sql`

Tables used:

- `mechanic_access_sessions`
- `service_records`
- `vehicle_profiles`

Session fields used:

- `mechanic_access_session_id`
- `vehicle_id`
- `owner_id`
- `permission`
- `status`
- `approved_at`
- `expires_at`

Service record fields returned:

- `record_id`
- `vehicle_id`
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
- `created_at`

Fields intentionally not returned in mechanic shared record DTOs:

- `draft_id`
- `owner_id`
- `field_metadata`
- `updated_at`

No new database migration was added for Person D.

## 9. Read-Only Access Behavior

`MechanicAccessService` validates the session before returning any records.

Allowed only when:

- session exists
- `status = APPROVED`
- `permission = READ_ONLY`
- `expires_at > now()`

Returned records are fetched with:

- `vehicle_id = session.vehicle_id`
- `owner_id = session.owner_id`

This keeps access scoped to the one approved vehicle and its confirmed service records.

Frontend read-only behavior:

- Mechanic page displays temporary access status and time remaining.
- Mechanic page displays shared vehicle service records.
- Mechanic detail page displays one record in read-only mode.
- No create, edit, delete, correction, validation, confirm, approve, or deny controls are shown to mechanics.

## 10. Access Expiration and Blocking Behavior

Blocked states:

- missing session
- invalid session id
- session status other than `APPROVED`
- session permission other than `READ_ONLY`
- expired session

Expired sessions:

- If an approved session is past `expires_at`, `MechanicAccessService` sets status to `EXPIRED`.
- The request is blocked with an access error.

Frontend blocked behavior:

- Shows an "Access unavailable" state.
- Provides a link back to the mechanic access landing page.

## 11. Mechanic Search Behavior

Search endpoint:

- `GET /api/mechanic-access/sessions/{sessionId}/history/search?query={query}`

Search validation:

- Requires a non-blank query.
- Reuses active read-only session validation.
- Searches only records from the approved session's vehicle and owner.

Search fields:

- `serviceType`
- `shopName`
- `partsReplaced`
- `laborPerformed`
- `remarks`

Mock-AI/semantic MVP handling:

- "latest", "most recent", "last service", and "recent service" return the most recent shared record.
- Oil/filter, brake/stopping, battery/electrical, and tire/wheel terms match common related record text.

Search response:

- query
- answer string
- result count
- matched shared record DTOs
- generated timestamp

No search logs table was added.

## 12. UI Fixes Included

### QR request-link sidebar identity

Bug:

- When the owner opened a QR request link from the owner flow, the request overlay could still show the vehicle owner's identity in the sidebar.

Fix:

- `/access/request/:token` now renders inside `AppShell`.
- `AppShell` detects `/access/request/` routes and sets the demo user to Demo Mechanic for that page.
- `QRSharingPage` now opens the actual request route `/access/request/{token}` instead of `/mechanic`.

### Sidebar account block pinning

Bug:

- The demo user/account/sign-out block moved with long page scroll.

Fix:

- Desktop sidebar is now sticky with `height: 100vh`.
- The nav section can scroll inside the sidebar if needed.
- The account block remains pinned at the bottom of the visible sidebar.
- Mobile layout resets sidebar to normal static flow.

## 13. How Person D Receives Data from Person C

Person C creates approved sessions when an owner approves a mechanic request.

Person D depends on:

- `mechanic_access_sessions.mechanic_access_session_id`
- `mechanic_access_sessions.vehicle_id`
- `mechanic_access_sessions.owner_id`
- `mechanic_access_sessions.permission`
- `mechanic_access_sessions.status`
- `mechanic_access_sessions.expires_at`

Person D does not create approval decisions. It only consumes approved temporary sessions.

## 14. Known MVP Limitations

- AI-assisted search is keyword/mock-AI only.
- No `mechanic_search_logs` table was added.
- No backend unit/integration tests specifically cover mechanic access/search services.
- No frontend automated tests cover mechanic access/search pages.
- The route/page file name `MechanicAccessSessionPlaceholderPage` is now stale but kept to minimize churn.
- Session URL access is public by session id for MVP; stronger auth/token rules are future work.
- Expired-session status update happens when the expired session is accessed.

## 15. Remaining Risks/Technical Debt

- Real AI search will need provider integration, prompt/versioning, and stronger fallback handling.
- Session ids should eventually be treated as secrets or replaced by a proper session token route.
- Search currently scans in service memory after loading approved shared records. This is acceptable for MVP but may need database-level search or pagination later.
- Frontend search interaction has no automated test coverage.

## 16. What Person C Must Provide or Keep Stable

Person C must keep stable:

- `mechanic_access_sessions` table.
- `mechanic_access_session_id`.
- `vehicle_id`.
- `owner_id`.
- `permission = READ_ONLY`.
- `status = APPROVED` for approved sessions.
- `expires_at`.
- The rule that sessions are created only after owner approval.

Person C should not:

- Create mechanic sessions before approval.
- Change `permission` or `status` values without updating Person D validation.
- Allow sessions without a vehicle scope.
- Remove the selected vehicle and owner fields from sessions.

## 17. Verification

Backend command:

```powershell
cd C:\Users\Julius Cesar Gamallo\Documents\Trevora Development\Trevora\backend\trevora-api
$env:JAVA_HOME="C:\Users\Julius Cesar Gamallo\.jdks\openjdk-25.0.2"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
$env:SUPABASE_DB_URL="jdbc:postgresql://aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres"
$env:SUPABASE_DB_USERNAME="postgres.bqardmkvbrfpbfmvmbgf"
$env:SUPABASE_DB_PASSWORD="<local password>"
.\mvnw.cmd test
```

Backend result:

- Passed.
- Maven compiled 85 source files with release 21.
- No test sources were present.

Frontend command:

```powershell
cd C:\Users\Julius Cesar Gamallo\Documents\Trevora Development\Trevora\frontend\trevora-web
npm run build
```

Frontend result:

- Passed.
- Vite production build completed successfully.

Runtime API smoke test:

- Confirmed vehicle used: `bf11a399-94f8-4588-8295-04003c7b2cf7`
- Approved mechanic session created through Person C owner approval flow.
- `GET /api/mechanic-access/sessions/{sessionId}/history` returned 10 records.
- Returned records belonged to one unique vehicle only.
- `GET /api/mechanic-access/sessions/{sessionId}/history/search?query=most%20recent%20service` returned one scoped result.
- `GET /api/mechanic-access/sessions/{sessionId}/history/{recordId}` returned read-only detail.
- Read-only detail did not include `draftId`.
- Invalid session id was blocked.
- Expired session was blocked after forcing the smoke-test session past `expires_at`.
- Owner Module 3 history still worked after the changes.

Browser smoke test:

- `/access/request/{token}` displayed Demo Mechanic in the sidebar instead of the owner identity.
- `/mechanic/access/{sessionId}` displayed temporary read-only access, search panel, service history, and View Details actions.
- Mechanic page did not show owner-only controls such as Add Service Record, approve, or deny actions.

## 18. Final Verdict

Module 4 Person D transactions 4.5 and 4.6 are complete for MVP.

Ready to commit after reviewing the working tree. The untracked design-reference screenshots can remain uncommitted unless the team wants to preserve them as design artifacts.

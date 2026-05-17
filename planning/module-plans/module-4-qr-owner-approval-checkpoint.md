# Module 4 QR Owner Approval Checkpoint

Last updated: May 17, 2026

## Status Summary

Module 4 Person C is implemented for MVP.

Completed scope:

- 4.2 Generate QR Access Request
- 4.3 Notify Temporary Access Expiration
- 4.4 Approve Mechanic Access Request

The implementation creates temporary owner-approved access sessions that are read-only, vehicle-scoped, and ready for Person D to use for mechanic history/search.

## Backend

New owner endpoints:

- `POST /api/qr-access/requests`
- `GET /api/qr-access/requests?vehicleProfileId={vehicleId}`
- `GET /api/mechanic-access/requests/pending`
- `GET /api/mechanic-access/requests?status={status}`
- `POST /api/mechanic-access/requests/{requestId}/approve`
- `POST /api/mechanic-access/requests/{requestId}/deny`

New mechanic/public endpoints:

- `GET /api/qr-access/requests/{token}`
- `POST /api/qr-access/requests/{token}/mechanic-request`

New persistence tables:

- `qr_access_requests`
- `mechanic_access_requests`
- `mechanic_access_sessions`

Migration:

- `database/migrations/004_module_4_qr_owner_approval.sql`

## Access Rules Implemented

- Owner can only generate access for vehicles they own.
- QR/share links expire after 24 hours.
- Expired links are blocked.
- Mechanic request submission requires a valid non-expired token.
- Owner can only approve/deny requests for owned vehicles.
- Approval creates a temporary read-only access session.
- Denial blocks mechanic access.
- Approved sessions expire after 4 hours.
- Access is scoped to the selected vehicle.

## Frontend

New routes:

- `/vehicles/:vehicleId/share`
- `/access/request/:token`
- `/access/requests`
- `/mechanic/access/:sessionId`

New pages:

- `QRSharingPage`
- `MechanicAccessRequestPage`
- `OwnerAccessRequestsPage`
- `MechanicAccessSessionPlaceholderPage`

The mechanic read-only history/search route remains a placeholder for Person D.

## MVP Mocked Behavior

- QR image generation is a visual placeholder.
- Notifications are represented by visible expiration/status panels.
- No real notification delivery is implemented.
- Mechanic read-only history and mechanic search are intentionally not implemented.

## Person D Handoff

Use `mechanic_access_sessions` as the access source of truth.

Person D should validate:

- session exists
- `status = APPROVED`
- `permission = READ_ONLY`
- `expires_at > now()`
- requested records match `vehicle_id` on the session

Person D should return confirmed `service_records` only and must not expose `service_drafts`.

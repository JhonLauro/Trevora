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

The old `/frontend/design-reference` screenshots (May 2026) have been removed as outdated. A UI refresh is in progress targeting a modern look suited to middle-age car-owner users; there is no current design reference directory — check with the user or recent commits for the active design direction before making layout changes.

## Module 2 Frontend Scope

Module 2 starts from an existing ServiceDraft created by Module 1.

The frontend should allow the owner to:

1. Review the draft.
2. See missing required fields.
3. See low-confidence or source metadata when available.
4. Correct draft fields.
5. Confirm and save the validated record.

Do not break Module 1 routes or input flows.

## Module 3 Frontend Scope

Module 3 displays confirmed vehicle service history.

The frontend should allow the owner to:

1. Open the service history for a selected vehicle.
2. View confirmed service records in chronological order.
3. Filter/categorize records.
4. Open a service record detail view.
5. See an empty state if the vehicle has no confirmed records.

## Module 3 Frontend Rules

- Use `service_records` returned by the backend history APIs.
- Do not show incomplete drafts as history.
- Do not implement Module 4 AI explanation, QR sharing, mechanic access, or AI-assisted search.
- Preserve all Module 1 and Module 2 routes.
- Keep UI demo-ready and consistent with the existing AppShell/sidebar.

## Suggested Module 3 Routes

- `/vehicles/:vehicleId/history`
- `/vehicles/:vehicleId/history/:recordId`

## Suggested Module 3 Components

- VehicleServiceHistoryPage
- VehicleHistoryHeader
- ServiceTimelineView
- ServiceRecordTimelineItem
- HistoryFilterToolbar
- ServiceRecordDetailDrawer or ServiceRecordDetailPage
- TimelineEmptyState

## Module 3 Frontend Status

Module 3 MVP is complete and verified. The frontend includes:

- `/vehicles/:vehicleId/history`
- `/vehicles/:vehicleId/history/:recordId`
- List and grid history views
- Filter, search, and sort controls
- Standalone service record detail page
- View History actions from vehicle cards and the saved-record page

## Module 4 Frontend Status

Project was paused for ~3 months (resumed 2026-08-08). Module 4 frontend is implemented, not just planned — routes and pages exist in `App.jsx`/`src/pages`:

- Auth: `LoginPage`, `RegisterPage`, `AccountSettingsPage`
- AI explanation: `AIExplanationPanel` component (used from service record detail pages)
- Sharing/approval: `QRSharingPage` (`/vehicles/:vehicleId/share`), `OwnerAccessRequestsPage` (`/access/requests`)
- Mechanic-facing: `MechanicAccessRequestPage` (`/access/request/:token`), `MechanicAccessSessionPlaceholderPage` and `MechanicSharedRecordDetailPage` (`/mechanic/access/:sessionId*`), `MechanicAISearchPanel` component

Verify current behavior against the code/running app before assuming anything below is still outstanding.

## Module 4 Frontend Scope

Module 4 provides owner-facing AI explanation and sharing screens, plus mechanic-facing read-only access screens.

## Module 4 Frontend Rules

- Keep UI consistent with existing AppShell and Module 1–3 styling.
- Do not show edit/delete controls to mechanics.
- Mechanic pages must clearly show read-only and temporary access status.
- Shared history must only show approved vehicle records.
- AI explanation may be template-generated/mock for MVP.
- AI-assisted search may be keyword-based/mock for MVP.
- Do not break existing Module 1, 2, or 3 routes.

## Actual Module 4 Routes (as implemented)

Owner:
- `/vehicles/:vehicleId/share`
- `/access/requests`

Mechanic:
- `/access/request/:token`
- `/mechanic/access/:sessionId`
- `/mechanic/access/:sessionId/history/:recordId`

## Module 4 Auth Foundation Frontend Scope

MVP Supabase Auth signup/sign-in, backend profile sync, and current-user state are implemented. Supported MVP account roles are `VEHICLE_OWNER` and `ADMIN`. Mechanics do not register or sign in; they use owner-approved temporary QR/share links as guests.

Add `LoginPage`, `RegisterPage`, and a logout action. The frontend signs users in through Supabase Auth, sends the Supabase bearer token to `/api/auth/sync`, stores the synced Trevora profile locally for the MVP, and includes both `Authorization: Bearer ...` plus demo-compatible `X-User-Id` and `X-User-Role` headers on authenticated API requests. If no logged-in user exists, the app may keep a demo fallback so the existing mock owner development flow remains usable.

Runtime environment required for Supabase Auth:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Vehicle owner users should keep access to Modules 1-3 owner workflows. Mechanic users should not create vehicle records or service drafts through owner routes; they should use Module 4 mechanic access features only after owner approval.

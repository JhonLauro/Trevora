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

The old `/frontend/design-reference` screenshots (May 2026) have been removed as outdated.

The active design direction is **"Ink"** (handoff bundle `design_handoff_trevora_auth`, Aug 2026). It is intentionally achromatic — there is no brand accent colour, and chroma is reserved exclusively for record status, so a coloured element always means something. Type and target sizes are deliberately larger than SaaS defaults for the middle-age owner audience: no text below 16px, no grey text below 17px. Do not tighten spacing or shrink type when migrating a screen; reflow instead.

Ink tokens now live at `:root` in `src/styles/ink-app.css`, which is loaded globally from `main.jsx`. `src/styles/ink-auth.css` keeps the auth-only rules; `src/styles/ink-garage.css` holds the shell, Garage and Records surfaces. Cascade order is stated once, in `main.jsx`: `styles.css` → `ink-app.css` → `ink-auth.css` → `ink-garage.css`. `.ink-button` is shared across auth and the app, so a rule that only makes sense in one of them must be scoped (see `.ink-auth .ink-button`).

Migrated so far: auth (`LoginPage`, `RegisterPage`, `AuthCallbackPage`, password reset, `RegisterVehiclePage` via `InkAuthShell`), the app shell (`AppShell`), the Garage dashboard (`GaragePage`), the vehicle page (`VehiclePage`) and `RecordsPage`. Still on the older "Calm Professional" tokens in `src/styles.css`: Add Service Record, the record detail page, Shared Access, Notifications, Account Settings.

Shared Ink components live in `src/components/ink/` — `RecordsTable` (cross-vehicle and single-vehicle shapes), `Timeline`, `PartsView`, `Tabs`, `MonthBars`. Derivations live in `src/utils/` and are shared by both pages: `recordStatus`, `serviceComponents`, `componentStatus`, `serviceCategory`, `completeness`, `monthlySeries`, `nextDue`, `format`, `vehicleText`.

### Information architecture (changed Aug 2026)

There is **no global "active vehicle"** any more. It used to live in `localStorage` and the sidebar, and it made every number on every page ambiguous until the user checked a control somewhere else — which this audience does not do. Vehicle identity comes from the route param.

| Route | Page |
|---|---|
| `/` | **Garage** — all vehicles, one card each carrying its own numbers. This is the dashboard. |
| `/vehicles/:vehicleId` | **Vehicle page** — everything about one car. Absorbs the old Service History page; `/vehicles/:id/history` redirects here. Three views: Timeline (default), Components, Table. |
| `/vehicles/new` | **Add a vehicle** — in-app. Signup's step 2 (`RegisterVehiclePage`) is the same fields on the auth shell. |
| `/records` | **Records** — cross-vehicle list. |

### Make, model and body type

Free-text make and model produced `Receipt`, `Voice` and `Route` as makes, plus `honda`/`Honda` as separate values. Both add-vehicle forms now share `components/ink/VehicleIdentityFields.jsx`, which pairs two `Combobox` fields against `src/data/vehicleCatalog.js` — a PH-market make → model → body-type table.

The combobox is a picker you can also type into: an unlisted value is kept as typed, so the long tail still works. It is deliberately neither a `<select>` (cannot be typed into; a native wheel past twenty options is miserable on a phone) nor a plain input (the original problem).

**Body type is a lookup, not a guess.** Picking a listed model fills it in — the catalogue knows a Hilux is a pickup — and it stays editable, because a catalogue can be wrong and a value the user never saw is one they can never correct. Changing the make clears a model that belonged to the old one, which is what stops "Toyota Xpander". A model typed under an unknown or misspelt make still resolves via `bodyTypeForModelAnywhere` — someone who types "Toyata Vios" typed a real Vios, and a Vios is a sedan whoever spelled the make.

When nothing can be derived, `BodyTypePicker` asks. It is **not** a `<select>` of "Sedan / Hatchback / MPV": plenty of owners do not know those words, and the people who reach this fallback are exactly the ones least likely to. Each option carries a plain description ("Open cargo bed at the back") and three example models, grouped under "Four wheels" and "Two wheels", so it is answerable by recognition rather than vocabulary.

### Motorcycles are not cars

`vehicleClassFor(bodyType)` returns `car` or `motorcycle`, and that is the **only** distinction anything downstream should branch on — never the body type itself.

`utils/serviceComponents.js` holds one shared rule set plus a per-class extension: `componentRulesFor(vehicleClass)`. Cars get transmission, aircon and body panels; motorcycles get drive chain/CVT and fairings, and never get aircon. `componentStatuses(records, vehicle)` builds its list from the class, so a motorcycle is never offered a part it does not have. Unknown body type falls back to `car` — what every pre-picker row is, and the safer default.

**There is no due-date or interval logic.** It was removed deliberately: the intervals were car conventions applied to every vehicle (telling scooter owners their oil was fine at 5,000 km), and prediction is outside the project's objectives. Component status is two states — has records / no record found. Do not reintroduce interval maths without real per-class intervals; see `planning/DEFERRED.md`.

Adding a model is a one-line change in the catalogue. The table is intentionally not exhaustive.

`/dashboard` and `/vehicles` redirect to `/`. `src/api/activeVehicle.js`, `DashboardPage.jsx`, `VehicleProfileSelectionPage.jsx`, `VehicleServiceHistoryPage.jsx` and `PartsMap.jsx` are unrouted leftovers kept only for comparison; do not build against them. Use `src/utils/vehicleText.js` for vehicle display strings.

The **parts map is drawn**: artwork in `components/ink/vehicleDrawings.jsx`, viewBoxes and marker anchors in `components/ink/vehicleShapes.js`, rendered by `components/ink/VehicleDiagram.jsx` above the component list in `PartsView`.

Two views — Side, and Under the bonnet (Engine and frame on a motorcycle) — each carrying only the components that live in it, so the list under the map is "components in this view". Nine drawings. **Side is per body type; the bay is shared per vehicle class.** The side profile is the view every owner recognises, so that is where the per-type effort goes; an MPV's bay and a pickup's bay genuinely look alike and neither owner has seen theirs from above. The bay keeps its own canvas because seven components live under a car's bonnet — on one side profile they collide with the front wheel or have to be moved somewhere less true.

Front and rear were dropped in the 2026-08-23 redraw. They held lights, brakes and exhaust, all of which the side profile already carries at both ends, so nothing was lost; they were also the two views that duplicated each other's outline and ignored body type entirely.

**Marker numbers are global**, not per view: each is the component's position in its class taxonomy (`componentNumbersFor` in `utils/serviceComponents.js`), so 5 is Tires on both tabs and every body type, and the list is ordered to match rather than putting documented components first. A car's side view reads 1–6 and its bonnet 7–13.

The view tabs are the only real buttons on the map; markers are `aria-hidden`, since each duplicates a list row and putting the same controls in the tab order twice is worse than a pointer-only map. Selection is owned by the row — hovering a marker mirrors its row, not the other way round — and both hover and selection are rings *outside* the marker, because the marker's own fill and stroke are already carrying status (solid + solid ring = has records, hollow + dashed = none). A vehicle with a null `bodyType` gets no drawing and no tabs, just an explanatory note and the full component list — picking a silhouette would assert a fact the row does not carry. The drawing is hidden below 720px where markers fall under a fingertip; the tabs stay, working as a "where on the vehicle" filter.

`PartsMap.jsx` is the pre-Ink parts map, in the old palette and with the four-status due/overdue grading that was removed for being a forecast. It is **not** unwired, whatever earlier notes said: `MechanicAccessSessionPlaceholderPage` is routed at `/mechanic/access/:sessionId` and still renders it. Replacing it is its own job.

Nav is five destinations — Garage, Records, Shared access, Notifications, Settings. "Add service record" is not among them: it is an action, not a place, and it is the primary button in each page header.

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

Add `LoginPage`, `RegisterPage`, and a logout action. The frontend signs users in through Supabase Auth, sends the Supabase bearer token to `/api/auth/sync`, stores the synced Trevora profile locally for the MVP, and includes both `Authorization: Bearer ...` plus demo-compatible `X-User-Id` and `X-User-Role` headers on authenticated API requests. If no logged-in user exists there is no fallback — the backend authenticates on the bearer token alone, so an unauthenticated request is rejected. The `X-User-Id`/`X-User-Role` headers are vestigial.

Runtime environment required for Supabase Auth:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Vehicle owner users should keep access to Modules 1-3 owner workflows. Mechanic users should not create vehicle records or service drafts through owner routes; they should use Module 4 mechanic access features only after owner approval.

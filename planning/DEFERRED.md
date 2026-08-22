# Deferred / Known Gaps

Running record of work consciously postponed, and problems found but not fixed.
Started 2026-08-21, when scope shifted to a UI overhaul ahead of MVP
validation testing.

Ordered roughly by how much it matters.

---

## 1. Onboarding interactivity (deliberately postponed)

Step 2 (add vehicle) works but is a plain form — three consecutive forms
(details → OTP → vehicle) is a weak first impression. Agreed plan, not built:

- **Make as a tappable picker**, not free text — grid of common PH makes
  (Toyota, Mitsubishi, Honda, Nissan, Ford, Suzuki, Isuzu, Hyundai) + "Other".
  Biggest single win; also fixes the data-quality problem in §9.
- **Live vehicle card preview** that assembles as fields are filled
  ("2018 Toyota Vios · ABC 1234") so the payoff is visible.
- **Plate field styled like an actual plate.**
- **Fold the welcome into step 2** — greeting as the serif heading
  ("Welcome, Brent. What do you drive?"), rather than a separate welcome screen.
  A standalone welcome screen was considered and rejected: it adds a screen
  without removing work, and any feature tour would show features that are
  unusable until a record exists.
- **Add a quiet "I'll do this later" skip.** Reversal of the earlier
  hard-gate decision — trapping someone 30 seconds in is a bad impression.

Constraint to respect: Ink reserves all chroma for record status, so
interactivity must come from structure, feedback and motion — never from
adding an accent colour.

## 2. Email verification sits mid-funnel

Decision was to **keep Supabase email confirmation enforced**, so the flow is
details → *leave the app, find an email, come back* → OTP → vehicle. This is
the single biggest friction point in signup, and it is a deliberate choice,
not an oversight.

Alternative if drop-off proves bad: let users in unverified and gate only
**sharing** on verification (the one feature where identity actually matters).
Requires turning off "Confirm email" in Supabase Auth settings.

## 3. Guided empty states — done for the Garage, still open elsewhere

A new account is empty everywhere and current empty states state a fact and
offer nothing ("No service records yet"). Each should name what belongs there
and give the single action that fills it. Instances needed: no vehicles, no
service records, no shared access, no notifications.

**Done (2026-08-22) for the Garage**: "Add your first vehicle" replaces the
whole dashboard when there are none, and "Start with your last receipt"
replaces the charts and table when there are vehicles but no records. A
vehicle with no records of its own keeps its card, showing zeroes and an
all-ticks activity strip — which reads correctly as "nothing documented".
**Still open**: shared access and notifications.

## 4. Get-started checklist card

Persistent, dismissible, doubles as the feature tour:
account ✓ → vehicle ✓ → first record → see what it means (locked) →
share with a mechanic (locked). Introduces features in the order they become
useful, without a modal.

## 5. Dashboard first-run state — resolved 2026-08-22

Was: the dashboard rendered "No records yet" three times for a new account, a
wall of zeros as a first impression. The Ink Garage removed the four
separate always-empty panels (summary / quick actions / notifications /
records) that produced it. The attention strip now renders **only** when
something needs action, and the empty states in §3 replace the zeros.

## 6. First-record prompt needs an escape

After step 2 the user lands on `/service-input/:vehicleId` (the three-way
capture chooser). It needs a visible "I'll do this later" — people sign up
without a receipt to hand.

---

## Backend fields the Garage/Vehicle redesign works around

The Ink dashboard slice (2026-08-22) was built frontend-only by decision. Five
things the design assumes are not in the schema or the DTOs, and each is
currently derived in the browser. Derivation is the wrong home for all of
them — a value re-computed from keywords on every render is a value no user
can correct.

**a. `service_records.validation_status`** — the one that actually misleads
people. `service_drafts` has a status; a confirmed `service_record` does not,
so nothing distinguishes a record whose extracted fields were checked from one
that was waved through. The old `DashboardPage` printed `Validated` on every
row unconditionally, which told owners their unverified records were verified.
`utils/recordStatus.js` now reads `record.validationStatus` and **treats a
missing value as "Needs review"** — deliberately pessimistic, so the failure
mode is nagging rather than lying. Add the column, set it on confirm, and
expose it on `ServiceRecordSummaryResponse` and `ServiceRecordDetailResponse`.

**b. `vehicle_profiles.body_type`** — **built, awaiting migration.** SQL is in
`database/migrations/008_vehicle_body_type.sql` and has not been applied yet.
The backend (entity, both request DTOs, response, service) already reads and
writes the column, so **the API will fail until that migration runs.** Both
add-vehicle forms send it. Values: sedan, hatchback, suv, mpv, pickup, van,
motorcycle. Existing rows stay null — most are test data whose body type
nobody can honestly state, and back-filling would be inventing it.

Still open after the migration: the artwork itself. The parts map needs
bodyType x view SVGs — and now a motorcycle silhouette too, which shares none
of the car geometry — so the Components view remains list-only.

**c. Component attribution per record** — which of tires / brakes /
suspension / body / lights / exhaust / engine / electrical / aircon a record
touched. `utils/serviceComponents.js` keyword-matches the service text.
Keyword matching is a fine *starting* value; it should be written onto the
record at confirm time so a wrong guess can be fixed once instead of being
regenerated on every page load.

**d. Spend category per record** — Maintenance / Repairs / Tires & brakes /
Other, for the dashboard's "Where it went". `utils/serviceCategory.js`, same
story as (c). Note `ServiceItemResponse` already has `serviceCategory` with a
keyword fallback for legacy rows, so there is a place to put this.

**e. Ownership start on the vehicle, and OCR confidence on history records** —
both now visible on the vehicle page, both faked. The history-completeness
strip needs a purchase or ownership-start year; without one it starts at the
earliest record year and the heading reads "Records from {year}" rather than
"Ownership from {year}", because inventing a purchase date would fake the very
number the strip exists to be honest about. OCR confidence is shown as a word
(high / medium / low, never a percentage) in the timeline and the component
rail — but `ServiceRecordSummaryResponse` carries no confidence field, so in
practice the clause is simply absent from every row. `field_metadata` holds it
on the draft; carry it through on confirm.

**f. Vehicle photo, and coverage/warranty records.** The vehicle page reserves
a 184×124 photo slot and renders a dashed placeholder — there is no photo
field and no upload path. The Warranty & coverage tab shows an honest empty
state for the same reason. An earlier `VehicleServiceHistoryPage` version
stored coverage in `localStorage`; that was deliberately **not** carried over,
because data that lives in one browser and vanishes on a new device is worse
than an empty tab that says so.

**g. Service intervals and due dates — removed 2026-08-22, not deferred code.**
`utils/nextDue.js` is deleted and `utils/componentStatus.js` no longer grades
components against an interval table. Two reasons, and both should stay on the
record:

- The intervals were **car conventions applied to every vehicle**. A scooter
  needs its oil changed several times more often than a sedan, so the page
  told riders their engine was fine when it was not. A maintenance tool that
  is confidently wrong about maintenance is worse than one that stays quiet.
- Predicting the next service **is not among the project's objectives**, and
  the proposal's Limitations section lists predictive maintenance as out of
  scope. Consolidating and presenting what actually happened is the objective.

Component status is now two honest states — has records / no record found —
and the "Upcoming" tab is gone. Restoring due dates needs real per-model
intervals sourced per vehicle class, which is genuine future work rather than
something to reconstruct from car defaults.

---

## Untested paths

## 7. Password reset round trip

Screens, validation and the expired-link state are verified. **The actual
email round trip is not** — sending a real reset mail, clicking the link, and
confirming the password changes. Needs a real inbox.

Related: visiting `/auth/reset-password` **while already signed in** shows the
password form rather than "link expired", because `getSession()` returns the
existing session. Arguably fine (a signed-in user changing their password),
but it was not a deliberate decision.

## 8. Vehicle creation POST

Step 2's form logic, validation, focus handling and payload shape are
verified. The actual `POST /api/vehicles` is **not** — it needs a signed-in
session and would write test data to the live Supabase.

Also untested: the Google path now routes owners with no vehicle to
`/register/vehicle`. Never exercised with a genuinely new Google account.

---

## Bugs found, not fixed

## 9. UI labels leaking in as vehicle makes — resolved 2026-08-22

`vehicle_profiles.make` contained `Receipt` (×5), `Voice`, `Route`, `sample`,
`sample 2`, `EFSF`/`Gundam`, `k`/`n`, `s`/`Toyota` and `Koyota`/`Virus`. Not a
leaking code path after all — they are hand-typed test rows. Free text was the
cause, and it is closed: both add-vehicle forms now go through the make/model
picker in `src/data/vehicleCatalog.js`.

`honda`/`civic` was normalised to `Honda`/`Civic` on 2026-08-22. **Nothing else
was touched, deliberately.** Two reasons:

- Renaming `Koyota Virus` to `Toyota Vios` would invent a vehicle identity —
  the same class of bad data the picker exists to prevent.
- **The junk rows hold most of the data.** `Route`/`Verifier` has 10 records
  and 26 drafts, `Koyota`/`Virus` has 6 records, `sample 2` has 3. Deleting
  them would destroy the bulk of the test history, and cascade into
  `service_records`.

**Resolved 2026-08-22.** The pre-auth mock owner's rows (13 vehicles, 12
records, 44 drafts) were deleted via
`database/maintenance/cleanup_mock_owner_data.sql`, and the remaining owned
test vehicles were removed through the new delete feature. Teammates' rows
were deliberately left alone — the junk-looking data spanned ten accounts,
several of them real people.

## 10. Demo header fallback is gone

`CLAUDE.md` documents a fallback chain: Supabase bearer token → `X-User-Id`/
`X-User-Role` demo headers → mock owner `00000000-...-0001`.

`CurrentUserService.getCurrentUser()` now delegates entirely to
`SupabaseAuthService` and throws if it returns empty. The `MOCK_OWNER_ID`
constant is still declared but nothing falls back to it. A request with demo
headers returns 403 "Sign in is required for this action."

Either the code drifted or the doc is stale — decide which and fix the other.

## 11. Draft → record conversion gap

100 `service_drafts` versus 31 `service_records` — a 69% drop at the
validation step. Almost certainly an artefact of development testing, but if
that ratio held with real users it would matter far more than onboarding.

The counts above predate the 2026-08-22 cleanup and no longer describe the
database. Re-measure once real usage produces data worth measuring.

---

## Design process

## 12. Claude Design has not ratified the token changes

The built auth screens deviate from the original "Ink" handoff: control
heights 60/62 → 52px, input text 18 → 16px, labels 17/700 → 15/600, button
labels 19/700 → 16/600, checkbox 26 → 20px, form heading 40 → 32px, and the
"no text below 16px" rule became "16px body, 15px floor for secondary".

The handoff also never specified behaviour **above** its 1280px design frame,
which is what caused the panel to collapse to a stripe on a 1913px laptop.
Panel is now `clamp(540px, 42%, 820px)`.

A full re-handoff prompt covering all of this was drafted but **not sent**.
The auth screens are now the de facto reference for the rest of the app.

---

## Motorcycles

Included, as of 2026-08-22. The proposal says "vehicle" and "vehicle owner"
throughout and never once says "car", "automobile", "sedan" or "four-wheel" —
so nothing in the paper excluded motorcycles, and none of the four objectives
depends on vehicle type. Receipt OCR, voice input, review-and-validate,
chronological consolidation, AI explanation and QR handoff are all
type-agnostic. Excluding them would have meant *adding* a delimitation that
was never written.

**They are not treated as cars.** `data/vehicleCatalog.js` carries a
`vehicleClass` per body type, and that is the only distinction the rest of the
app branches on:

- `utils/serviceComponents.js` keeps one shared rule set plus a per-class
  extension. Cars get transmission, aircon and body panels; motorcycles get a
  drive chain/CVT and fairings and **never** get aircon. Chain service has no
  car equivalent and is the most frequent item in a rider's history, so it
  cannot be folded into "transmission".
- `utils/componentStatus.js` builds its component list from the class, so a
  motorcycle is never shown a part it does not have.
- Unknown or missing body type falls back to `car`, which is what every row
  created before the picker is, and is the safer default — it never claims a
  motorcycle has parts it lacks.

Still car-shaped and worth auditing when motorcycles get real usage:
`utils/serviceCategory.js` ("Tires & brakes" works for both, but chain work
lands in Maintenance by keyword accident rather than by design), and the
receipt-extraction prompts, which have not been tested against a 3S-shop
invoice. See "OCR and extraction quality" below — that work is waiting on
real receipts, not on a decision.

---

## OCR and extraction quality — deliberately waiting

Receipt OCR and the AI extraction step both need work, and neither is blocked
on code. They are blocked on **evidence**: a body of real receipts, varied
enough to show what actually fails — faded thermal paper, handwritten talyer
receipts, printed casa invoices, motorcycle 3S-shop invoices.

Guessing at improvements before that means tuning against imagined failures.
Collect the receipts first, study where extraction misses, then change the
prompts against known cases.

Related and unmeasured: the 85% field-extraction accuracy target in the
proposal's objectives has never been measured against a real sample.

---

## Paper / implementation drift to reconcile

- The **parts map, component statuses and the Warranty & coverage tab are not
  in the proposal** at all. They are not harmful now that the prediction is
  gone, but they are unspecified scope — either justify them as part of
  objective 3 (consolidation) or cut them.
- Worth adding one line to the Scope section making the vehicle-type coverage
  explicit, e.g. "Vehicle types include both four-wheeled vehicles and
  motorcycles; the system is not specific to any vehicle class." The panel
  should not have to infer it.

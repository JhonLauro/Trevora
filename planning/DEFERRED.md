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

The Ink dashboard slice (2026-08-22) was built frontend-only by decision. Each
entry below is something the design assumes but the schema or the DTOs did not
carry, derived in the browser instead. Derivation is the wrong home for all of
them — a value re-computed from keywords on every render is a value no user
can correct. (a) and (b) have since landed; (c)–(f) are still browser-derived.

**a. `service_records.validation_status` — resolved 2026-08-22.** Was: nothing
distinguished a record whose extracted fields were checked from one that was
waved through, and the old `DashboardPage` printed `Validated` on every row
unconditionally, telling owners their unverified records were verified.
Migration `009_service_record_validation_status.sql` is applied; the column
defaults to `NEEDS_REVIEW` (absence of evidence is not validation), is set on
confirm, and is exposed on both `ServiceRecordSummaryResponse` and
`ServiceRecordDetailResponse`. `utils/recordStatus.js` still treats a missing
value as "Needs review", so the pessimistic failure mode survives.

**b. `vehicle_profiles.body_type` — resolved 2026-08-22.**
`database/migrations/008_vehicle_body_type.sql` is applied. The backend
(entity, both request DTOs, response, service) reads and writes the column and
both add-vehicle forms send it. Values: sedan, hatchback, suv, mpv, pickup,
van, motorcycle. Existing rows stay null — most are test data whose body type
nobody can honestly state, and back-filling would be inventing it.

The artwork landed 2026-08-22/23 as well, and was redrawn 2026-08-23 against a
design handoff (`planning/design-handoffs/parts-map.html` is the brief).
`components/ink/vehicleDrawings.jsx` holds the drawings,
`components/ink/vehicleShapes.js` the viewBoxes and anchors, and
`VehicleDiagram.jsx` renders them above the component list.

**Two views, not four**: Side, and Under the bonnet. The first pass shipped
side-only; the second added Front, Rear and Engine bay; the redraw kept the bay
and deleted front and rear. They existed to hold lights, brakes and exhaust,
every one of which the side profile already carries at both ends of the
vehicle, so deleting them cost no component — and they were the two views that
duplicated each other's outline, ignored body type entirely, and so showed a
pickup owner somebody else's vehicle. Thirteen drawings became nine.

The bay keeps its own canvas for the original reason, which still holds: seven
components live under a car's bonnet inside a region about 90 units wide on a
side profile, and at marker radius 13 with 30 units of clearance they do not
fit. Relocating them until they do is the lie the second drawing avoids.

Scoped, deliberately:

- **Side is per body type; the second view is per powertrain family.** The
  side profile is the view every owner recognises, so that is where the
  per-type effort goes. An MPV's bay and a pickup's bay genuinely look alike,
  and neither owner has ever seen theirs from directly above, so the six cars
  share one. Bikes do not: a scooter's CVT unit and a chain-driven engine hung
  in a frame are not the same object, so scooters get their own.
- **Motorcycles split three ways.** Superseded — the old rule was one generic
  naked standard, on the grounds that `bodyType` records only `motorcycle` and
  a sub-type drawing would be a guess dressed as a fact. That reasoning was
  circular: the original parts-map spec called for the split and named the
  column change as its first step, so deferring the column is what made the
  drawings look unsupportable. Migration `012` added `scooter` and
  `underbone`. Seventeen of the twenty-three motorcycles in the catalogue are
  one or the other, so the single drawing was wrong about 74% of them. Twelve
  drawings now. Rows created before the split keep `motorcycle`, which means
  big bike and is the honest fallback of the three — it claims no bodywork, so
  it under-describes a scooter rather than inventing an apron.
- **Each component appears in one view, with a single exception.** The two
  views partition the taxonomy rather than overlapping — 6 + 7 on a car, 7 + 5
  on a bike. The exception is `drive` on a scooter, which is in both: the CVT
  case is visible in profile *and* is the subject of the engine view, because
  it carries the rear wheel. The design always allowed this and nothing
  breaks; the earlier note saying no component was ever in both was written
  before scooters existed.
- **Marker numbers are global**, the component's position in its class
  taxonomy, so 5 is Tires on both tabs and every body type. The cost is that
  the list is ordered by taxonomy rather than documented-first, and reads 1–6
  on the side and 7–13 under the bonnet. Reverting means dropping
  `componentNumbersFor` and going back to `index + 1`.
- **A null `bodyType` gets no drawing and no tabs**, just the full list and a
  note. Falling back to a sedan would assert a body type the row does not
  carry — the same invention the migration avoided by not back-filling.

`PartsMap.jsx` is no longer rendered anywhere. `/mechanic/access/:sessionId`
was ported onto `PartsView`, which is what stopped a shared motorcycle being
drawn for the mechanic as a sedan with an aircon and a gearbox it does not
have; the mechanic history response gained `vehicleBodyType` to carry it.
`PartsMap.jsx` and `VehicleServiceHistoryPage.jsx` are both unreferenced now
and can be deleted — left as its own commit so this one stays reviewable.

Markers are `aria-hidden`; the list underneath remains the accessible path,
because putting the same controls in the tab order twice is worse than a
pointer-only map. The view tabs are focusable, being the one control with no
equivalent in the list. Below 720px the drawing is hidden — a marker there is
smaller than a fingertip — and the tabs stay on as a plain "where on the
vehicle" filter.

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

## Attribution reads operations only — 2026-08-23

Migration `011` split a receipt line into OPERATION / PART / MATERIAL / FEE
because two free-text buckets could not hold three kinds of line, so every
consumable was stored as a replaced part. The tables landed before the readers
did, so the bug it was written to fix stayed live: on a Toyota body-and-paint
job the materials list held a "WASTE PAD", `/pad/` matched it, and the owner
got a green Brakes marker and AI advice about stopping distance for a scratch
repair.

All three consumers now read operations and nothing else:

- `utils/serviceComponents.js` gained `componentEvidenceText`, which reads the
  service type plus OPERATION lines. `inferComponents` uses it.
- `utils/serviceCategory.js` uses the same text, so a tin of thinner cannot
  file a repair under "Tires & brakes".
- `AIExplanationService` matches `buildWatchFor` on operations, and its
  narrative now names PART lines as parts and MATERIAL lines as materials
  instead of announcing consumables as parts fitted to the vehicle.

**`recordSearchText` stays deliberately broad** and is now separate. It was
doing both jobs, which was its own bug — a shop called Brake Masters lit up the
Brakes marker on every record from it. Search should match the shop, the
location and the remarks; attribution must not. It also now reads line entries,
which it did not when they were introduced, so search would have gone blind to
receipt content once the legacy columns are dropped.

Records written before 011 fall back to `laborPerformed`, which is the same
claim the backfill made. `partsReplaced` is never read for attribution — it is
precisely the field that cannot be trusted to name a component.

Still open: the attribution is still *derived* rather than stored, so a wrong
guess still cannot be corrected by the owner. Narrowing the evidence makes it
wrong far less often; it does not make it fixable. That is the DEFERRED item
above this one.

## Insurance coverage on spend — added 2026-08-23

`total_cost` was one column with no stated meaning, so owners filled it with
whichever number they had — the invoice, or what they actually handed over —
and "Total spent" summed the two together as though they were the same
quantity. Migration `010` adds `amount_covered` to drafts and records.

- `total_cost` — what the service cost. The invoice. Meaning unchanged.
- `amount_covered` — what insurance or a warranty absorbed. 0 when nothing did.
- **Out-of-pocket is derived, never stored.** A third column could contradict
  the two it comes from the moment either was edited.

A numeric rather than a boolean, because partial coverage (a deductible on an
otherwise covered repair) is the common case and "covered: yes" can express
neither that nor "they paid all of it".

Display: "Total spent" is out-of-pocket, with `PHP x covered` on a second line
that renders only when something actually was. Folding covered money into a
spend figure silently overstates what a vehicle cost; excluding it without
saying so is worse. A fully covered record reads **"Covered"**, not "PHP 0" —
a column of zeroes reads as broken data and buries the good news.

Entered in the review step behind a toggle, off by default. A receipt cannot
show what an insurer later paid, so it is inherently owner-supplied, and most
records have no coverage at all.

**Not exposed to mechanics.** `MechanicSharedServiceRecordResponse` and the
sharing DTOs still carry `totalCost` alone. A handoff needs the value of the
work, not the owner's insurance arrangements.

Still open: the **policies** themselves — insurer, cover, premium, expiry —
which is what the Warranty & coverage tab is still empty for. Per-record
coverage says what a policy paid, not what the policy is.

**Rows predating this are 0**, which is correct arithmetic for them but note
the caveat above: some existing `total_cost` values may already be
out-of-pocket amounts rather than invoices, and there is no way to tell which.

## Model year is optional — resolved 2026-08-23

Both add-vehicle forms required a model year. Nothing else did: `model_year` is
nullable, the DTOs carry `@Min(1886)` with no `@NotNull`, and every display
path builds its label with `[year, make, model].filter(Boolean)`, so a missing
year degrades to "Toyota Vios" on its own. Nothing computes anything from it —
not the parts map, not component status, not the AI explanation.

So the requirement existed only in the two forms, and its effect was to make an
owner who does not know the year guess. A guessed year is indistinguishable
from a known one once stored, in the field an owner is least able to check.

Both forms now accept a blank year, and the hint names the document it is on
("Year Model" on the OR/CR) and the mistake it invites — a secondhand owner
reaching for a year will reach for the year they bought it. The format checks
still apply to anything actually typed.

**Existing rows were left alone**, deliberately. There is no way to tell a
correct year model from an entered purchase year after the fact, and guessing
which are wrong would be inventing data a second time. Some of the years
already stored are probably acquisition years; that is not recoverable and
should not be papered over.

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

Receipt OCR and the AI extraction step were audited on 2026-08-23 and largely
rebuilt. **This section is now the handoff — read it before touching
`serviceinput`.**

The old note here said the work was blocked on evidence: a body of real
receipts. That was half right. It turned out most of the pipeline could be
measured from **two** receipts already sitting in `service_drafts`, because the
extraction failures were structural rather than long-tail. The evidence problem
was real; the volume needed to start was much smaller than assumed.

### How to measure anything here

`backend/trevora-api/src/test/resources/golden/` — real receipts with
hand-checked answers and a per-field scorer. Read its `README.md` first.

```
./mvnw test              # unit tests, no API calls
./mvnw test -Pgolden     # scores extraction, needs OPENAI_API_KEY, costs money
./mvnw test -Pgolden -Dgolden.dump=true    # also print the extracted lines
```

**Do not change the extraction prompt without running this before and after.**
Two prompt changes during the audit looked like clear improvements in the diff
and were regressions: one dropped real part lines while trying to stop
hallucinated ones (line kinds 100% → 36%), and one made the model split a
receipt into one service per operation, orphaning every part line (100% → 36%
again). Neither was visible without the set.

### Where it stands

Three cases, three runs each. The 2026-08-23 audit column, and where F8–F11
(2026-08-24) left it:

| Metric | Before | After audit | After F8–F11 |
|---|---|---|---|
| Line kinds correct | 0% | 100% | 100% |
| Line prices correct | 0% | 100% | 100% |
| Components correct | 75% | 83% | 83–89% |
| Date / odometer / shop / location | 100% | 100% | 100% |
| Lines reconcile to printed total | not checked | 2 of 3 | 2 of 3 |
| Total cost | 50% | 67% | 67% |

F8–F11 were hardening, not accuracy work, and the numbers say so: every scored
metric is unchanged. Components is written as a range because it moved between
83% and 89% across four runs on identical code — the GTA case sometimes returns
`[Engine, Cooling System]` and sometimes `[Cooling System]`. Neither number is
an improvement over the other; one field on one case is simply not stable, and
quoting the 89% run as a gain would be reading noise as signal.

The two remaining failures are both the Toyota case and both are the correct
behaviour: its OCR text predates layout reconstruction, so its per-line prices
genuinely are unrecoverable and the pipeline says so instead of guessing.

### Fixed, with the reasoning worth keeping

- **The mock fallback fabricated data.** With `OCR_PROVIDER` unset — the
  default — it returned `LocalDate.now()`, ₱1,500.00, "Mock OCR Auto Shop" and
  invented confidence scores, into exactly the fields the owner confirms. Three
  such rows were in the production database. Now every field returns null.
- **The AI was never asked for line entries**, so migration `011` was reachable
  from manual entry and nothing else. Every receipt-created draft saved zero
  lines, and `componentEvidenceText` fell back to `laborPerformed` every time.
  The prompt now defines the four kinds and the parser reads them.
- **Nothing reconciled the lines against the printed total.** A receipt is its
  own checksum. Now warned on, never silently corrected — the gap says one of
  the two figures is wrong, not which.
- **Vision's layout was discarded.** Word bounding boxes are now grouped into
  printed rows, so a price stays attached to its description; columns are
  separated with a pipe and the prompt is told what it means.
- **The extractor was never told what vehicle it was reading for**, and the
  component vocabulary was car-only. Both fixed together, because the
  vocabulary can only be chosen once the vehicle is known.
- **Nothing checked whether a value was possible**, only whether it was
  present. `DraftPlausibilityService` now checks future dates, odometers below
  the highest known reading, and duplicate receipts.

### F8–F11, done 2026-08-24

- **F8 — truncation reported itself.** The 12,000-character cap lived in two
  classes: the extractor cut the text, and `OCRProcessingService` guessed that
  it had by re-deriving the condition from its own copy of the number. That
  guess fired on the raw-OCR fallback, which truncates nothing, and would have
  gone silent the moment either copy moved. The cap now belongs to the code
  that applies it and emits its own warning, and the cut lands on a line
  boundary so no half-row reaches the model inviting a guessed price. The
  voice transcript cap was silent entirely; it warns now too.
- **F9 — Structured Outputs with a strict schema** (`ServiceDraftResponseSchema`).
  Strict mode forbids open-ended maps, so `fieldSources` and `fieldConfidence`
  now name six fixed keys — the visit-level factual fields, which is exactly the
  set the parser reads back. Per-service evidence was dropped: a flat map could
  never say which of three services a `serviceType` entry belonged to, so it was
  unusable, not lost. `ServiceDraftResponseSchemaTest` enforces the strict-mode
  rules, because a schema that breaks them fails as a 400 at request time and
  surfaces as an empty draft for a reason unrelated to the receipt.
- **F10 — three attempts with exponential backoff.** 429 and 5xx retry; 4xx
  does not, because a rejected request is rejected the same way twice.
- **F11 — `asInteger` reads a number instead of a run of digits.** It stripped
  every non-digit and parsed the remainder, so "12,345.6 km" read as 123456 — a
  reading ten times the real one, plausible enough that nothing questioned it.
  It now drops grouping separators, treats a decimal point as one, and rounds.
  `asOdometer` adds the bound check that needs no history: negatives and
  anything past 2,000,000 km are blanked with a warning rather than stored.
  `DraftPlausibilityService` still owns the comparison against past readings,
  but it has nothing to compare on a vehicle's first receipt — which is exactly
  where an extra digit has nothing to contradict it.

### Found while doing F9: the model sometimes runs away

Twice across five golden runs, one extraction came back with
`finish_reason: length` — the model spiralling on a repeated array entry rather
than the receipt being too long. At temperature 0, on byte-identical input,
with the runs either side clean. It first appeared as "invalid JSON", which is
what a truncated body looks like from the parser, and cost a run before the
`finish_reason` check made it legible.

Three consequences, all in place:

- A cut-off response is **retryable**, on that evidence rather than on hope.
- So is a body that fails to parse. A strict schema constrains what the model
  generates, not what arrives intact.
- `max_completion_tokens` is set to 8,000. Left unset the model may spend its
  whole 16k output window before anyone finds out, and both the bill and the
  wait are the owner's.

**This is the strongest argument yet for more golden cases.** A ~1-in-20
per-extraction failure was invisible in three runs of three cases and only
showed up because F8–F11 meant running the set five times. Nothing in the
current set would catch it regressing.

### Blocked on you, not on code

- **Re-upload the Toyota receipt image** (`3aed31c3-…jpg`, in Supabase
  storage). Its `ocr.txt` was produced before layout reconstruction, so
  regenerating it should make the pending line prices recoverable and turn that
  case into the strongest test in the set.
- **One real motorcycle receipt.** `scooter-cvt-service` is synthetic and
  marked as such. It proves the vocabulary and vehicle context work; it proves
  nothing about whether they survive real OCR. Treat its scores as an upper
  bound until a real one replaces it.
- **More format coverage**: handwritten talyer receipt, thermal POS slip, tyre
  shop with repeated identical lines, parts-only with no labour, part-Tagalog,
  and one unreadable photo whose correct answer is all-null. The README lists
  these as gaps.

Fifteen receipts is enough to start; thirty makes the numbers defensible. The
unit that matters is judgements per field, not receipts — one receipt with
fourteen lines gives fourteen line-kind judgements but only one date judgement.

### Note on run-to-run variance

At `temperature: 0` the model is *mostly* stable given identical text — the
golden runs show zero spread on most fields. Two things qualify that, both
found on 2026-08-24 by running the set five times instead of once:

- **`relatedComponents` on `gta-toledo-cooling` alternates** between
  `[Engine, Cooling System]` and `[Cooling System]`, moving the overall
  component score between 83% and 89% with no code change. Any component
  finding smaller than six points is noise.
- **Roughly 1 extraction in 20 does not finish at all**, coming back
  `finish_reason: length`. See the section above.

The instability one layer down is worse: two production extractions of the same
Toyota image returned totals ₱400 apart because Google Vision returned 3,502
characters on one run and 3,511 on the other **for the same image**. So the text
layer needs a few repeats — three is too few to see the tail — and the image
layer needs several.

### The golden set can fail the build now (2026-08-24)

Two changes, both of which the set's own javadoc had asked for and neither of
which needed more receipts.

**Regression floors.** `GoldenReport` carries a minimum per field and the test
throws when a score walks through one. Set from the measured baseline with room
for the wobble — line kinds and line prices at 90%, date and odometer at 95%,
shop and location at 90%, total cost and reconciliation at 60% because the
Toyota case legitimately cannot reach them. **`relatedComponents` has no floor
on purpose**: it measured 83–89% across runs of identical code, and a check that
fires on noise gets ignored.

The two audit regressions — line kinds 100% → 36%, twice — would both now break
the build instead of reading as improvements in a diff.

**A single bad extraction no longer destroys the run.** Roughly one in twenty
comes back unusable at temperature 0; throwing meant losing the report for the
other eight, which cost two paid runs before anyone noticed the failure was
intermittent. Failures are counted, printed, and only fail the build past a
quarter of all attempts — a rate that means something is actually broken.

`GoldenReportTest` covers the floor logic offline and free, so the rules that
decide "has extraction regressed" are themselves checked on every `./mvnw test`
rather than only behind a paid call. Verified live: the set passes with floors
active, same numbers as the August baseline.

**Correction to an earlier claim in this document:** running the golden set
costs one or two US cents, not enough to coordinate around. That was asserted
several times without doing the arithmetic. The real trap is that without
`OPENAI_API_KEY` the test *skips* rather than failing, so a green run does not
prove it ran.

### Still unmeasured

The 85% field-extraction accuracy target in the proposal's objectives. The
golden set is now the instrument that could measure it, but three cases — one
of them synthetic — is not a sample anyone should quote a percentage from.

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

---

## Add-record and validation UI redesign — claimed 2026-08-24

Brent is doing the Ink migration and redesign of the add-record flow
(`ServiceInputMethodPage`, `ReceiptUploadPage`, `VoiceInputPage`,
`ManualEntryPage`) and the validation/review UI (`ServiceDraftReviewPage`,
`ServiceRecordConfirmationPage`, `ServiceRecordSavedPage`).

These are the last screens still on the old "Calm Professional" tokens in
`styles.css`, which makes them a tempting thing to fix in passing. Please leave
them alone until this lands — a partial migration by a second person is worse
than the current inconsistency, because it splits one screen across two systems.

The current-state brief for Claude Design is
`planning/design-handoffs/add-record-and-validation-brief.md`. It documents what
exists today, the Ink constraints it has to migrate into, and the design
questions that are genuinely open. Two of those questions touch things outside
this area and are worth other people's opinions:

- **Ink reserves chroma for record status, but the review screen has a
  seven-state field-confidence badge.** Whatever resolves that sets a precedent
  for every other status-bearing surface, not just this one.
- **`utils/fieldConfidence.js` is read across features** (per
  `COLLABORATION.md` §2). If the redesign changes the badge vocabulary, the
  confirmation screen and anything else reading `fieldSignal` changes with it.

Ownership is recorded in `planning/CONTEXT.md`.

## Receipt drafts never render their own warnings — found 2026-08-24

`ServiceDraftReviewPage` has two layouts. The receipt one renders
`BlockingCallout` but not `ValidationSidebar`, so on receipt drafts —
the recommended path, and the common one — `flaggedFields`, `reviewSummary`,
the odometer plausibility warnings and the possible-duplicate warning are
never rendered at all. Voice and manual drafts show all of it.

`attentionCount` still counts flagged fields, so the extraction bar can read
"3 fields to check" on a screen that displays nothing to check and gives no
field to click.

The duplicate warning has a second problem underneath the first: it is filed
under the synthetic field name `duplicate`, deliberately, because it describes
the record rather than any one value — the comment in `DraftPlausibilityService`
notes that filing it under `totalCost` would silently overwrite that field's
confidence flag. So even with the sidebar present there is no field badge that
could carry it. Any redesign of this screen needs a home for record-level
issues, not only field-level ones.

Not fixed, because the redesign of this screen is about to change where all of
this lives. Worth fixing separately first if the redesign takes a while — a
duplicate receipt that confirms silently inflates both the spend total and the
years-covered figure on the Garage.

## Add-record + validation redesign landed — 2026-08-24

Built from the Claude Design canvas "Trevora Add Record" (project `23d5f5d3`,
artboards 1A–1J), which was drawn from
`planning/design-handoffs/add-record-and-validation-brief.md`. All six screens
plus the badge system are implemented. `npm run build` is clean and the login
screen is unaffected — but **nothing behind the login has been clicked by a
human yet**, so treat the flow itself as unverified.

What it decided, for anyone who has to extend it:

- **Seven badge states, three tiers, ranked by containment** (`utils/fieldTier.js`).
  Filled chip > outline > bare mono text. Red on exactly the two states that
  block a save, which is the one thing Ink already lets chroma mean. Any eighth
  state slots into a tier — nobody needs to invent a colour. This is the
  precedent for other status surfaces, not just this one.
- **One layout for all three input methods.** The receipt moved out of the
  column layout into a page strip above the fields, which freed the second
  column for a status rail. That is what puts the warnings, the duplicate
  notice and the summary back on the receipt path.
- **The counting bug is fixed structurally.** The rail is built from the same
  signals the fields render with, so the count and the rows cannot disagree.
  Every rail row is a jump link to its field.
- **Record-level issues get a band** under the bar (`RecordIssueBand`), which
  is where the duplicate warning now lives.

### Three places the design could not be built faithfully

1. **The conflicting-value chooser is not built.** Artboard 1G shows the "Two
   different values found" state offering both readings as pickable cards
   ("Using this one" / "Use this instead"). The payload cannot support it:
   `CONFLICTING` is only a `sourceType` on the field, and `fieldSources[field]`
   carries a single `sourceText`. **The second candidate value is never sent.**
   The badge and the explanation render; the picker does not. Fixing it means
   extraction emitting both readings — a `serviceinput` change, and one that
   touches the extraction prompt, so it needs the golden set run before and
   after.
2. **"Compare the two" on the duplicate band is not built.** The issue carries
   a human-readable message but no id for the record it matched, so there is
   nothing to link to. Substituted a link to the vehicle's records. Dismissing
   is local-only — there is no endpoint recording "the owner says this is a
   different service", and inventing one silently would be worse than the
   notice returning on reload.
3. **The saved screen's "parts map" figure is not built.** Artboard 1J shows
   what the record closed on the parts map ("Engine oil filled"). Nothing
   computes that delta, so the third figure reports what was charged instead.

### Smaller deviations, all deliberate

- **Page reorder stays on buttons, not press-and-drag.** The artboard says
  press and hold. The existing code comments argue buttons, because this is
  used one-handed on a phone with the paper in the other hand, and a drag
  target is the wrong control for a thumb. Kept the buttons.
- **Voice: translation is additive, as drawn — but the English is still what
  gets extracted.** The artboard says editing the original "changes what we
  read". Editing it now clears a stale translation, so that stays true, but the
  submitted transcript is the English when one exists. Sending the extractor a
  different language is an extraction change, not a layout one, and was out of
  scope for a redesign.
- **Receipt lines stay editable on the checking screen.** Artboard 1G draws
  them read-only, but its own balance copy says "change either side", and the
  screen's founding rule is that everything on it saves. Editable won.

### Dead code removed

`StepIndicator.jsx`, `ServiceItemsEditor.jsx` and `ReceiptBalance.jsx` had no
consumers left and are deleted. **`ServiceLineEntriesEditor.jsx` is kept even
though its default export is now unused** — `ServiceItemsList` imports its
`ServiceLineEntriesList` named export, and that reaches the mechanic-facing
pages. Do not delete it on the strength of the default export looking orphaned.

`.claude/launch.json` gained `"autoPort": true` on the web entry so two
sessions can run a dev server at once.

### Correction to the entry above — same day

Two things in the first pass were wrong and are now fixed.

**The flow was built as a full-screen takeover, and it should not have been.**
The Claude Design artboards draw each screen standalone, with their own dark
top bar and no navigation. That is a canvas convention for showing one screen
in isolation; I read it as an instruction to replace the app's chrome. The
result rendered inside `AppShell` and then covered it with a
`position: fixed` overlay — so the 264px sidebar was still in the DOM,
underneath, and a second dark bar sat directly against the already-dark
sidebar. The flow is now an ordinary `.ink-page` inside the shell, using the
shared `.ink-page__header` / `__title` / `__summary` classes. The six-segment
progress bar stays: that part of the artboards was a real improvement over the
old three-of-six indicator, and it does not require owning the chrome.

**`styles.css` has a bare `button { min-height: var(--field-h) }` — 52px — and
min-height beats height.** This is worth knowing outside this feature. Any new
component with a control smaller than 52px gets silently floored, with no
warning and nothing in the diff to suggest it. It was flattening the receipt
tab pills, the duplicate band's actions, the icon buttons and the retake
button, all of which are specified smaller. `service-flow.css` now scopes
`.flow button { min-height: 0 }` and every control states its own height.
Anyone building a new Ink surface will hit the same thing.

A side effect worth naming: text buttons had been getting a 52px touch target
by accident from that same rule. With it reset they needed an explicit mobile
floor, which they now have.

**Contrast, measured rather than eyeballed.** The artboards draw a disabled
primary button as `#F7F4EF` on `#C4BDB0`. That is **1.70:1** — not a
legibility opinion, an unreadable label — and `ink-auth.css` already shipped
the same pair in `.ink-button--primary:disabled`. The flow now uses ink on the
same grey (9.22:1), keeping the filled-pill shape. Disabled ghost buttons went
from 3.12:1 to 6.53:1. **The identical bug is still live in
`ink-auth.css:551`** on every auth screen; it is not mine to change, but
whoever owns auth should know.

### The hover bug, and the real root cause — 2026-08-25

The reported symptom was a vehicle card on the pick-a-vehicle screen going
near-black on hover with its text still dark: the label vanished. Measured,
that was **1.31:1** for the card title and 1.72:1 for the subtitle.

The cause is `ink-app.css:284`:

    button:hover:not(:disabled) { background: var(--ink-hover); }

A bare element hover at specificity **(0,2,1)**. Any component rule written as
`.some-card:hover` is **(0,2,0)** and loses to it — so every button-shaped card
in the app fills near-black on hover, and if the component sets its own dark
`color` without a matching hover colour, the result is dark-on-dark.

This is the third legacy element-level rule to leak into new work, after
`button { min-height: var(--field-h) }` and `button { background:#1c1b19 }`.
They share one shape: **bare element selectors in the global sheets that
out-specify ordinary single-class component rules.** Anyone building a new Ink
surface will hit all three.

`service-flow.css` now handles them in two layers:

1. `.flow :where(button)` — zero-specificity reset of the legacy fill, colour,
   weight, padding, radius and min-height. Sits at (0,1,0), so every component
   class still wins.
2. `.flow button:hover` — also (0,2,1), and service-flow.css is imported last,
   so the tie breaks our way and the legacy dark fill never lands. Component
   hovers carry `:not(:disabled)` to reach (0,3,0) and win in turn.

Verified by simulating the cascade over the live CSSOM with L4 specificity
arithmetic across nine interactive surfaces: every one now resolves to a flow
rule, none to the legacy hover, contrast 6.97–15.69:1. The vehicle card goes
1.31 → **14.71:1**.

**Note on how this was verified.** Live `:hover` could not be measured — with
the browser pane not displayed the renderer does not apply hover styling, and
an injected `background:red` on the same selector did not paint either, while
`matches(':hover')` still reported true. So the check is cascade simulation
against the real stylesheets, not a screenshot. A human should still look at it.

**The bug is still live everywhere else.** `button:hover:not(:disabled)` is
global, so any other screen with a button-shaped card that sets its own colour
has the same failure. Not mine to fix, but worth a sweep — the Garage vehicle
cards are `<article>` rather than `<button>` and so are safe, which is likely
why nobody hit this before.

### Three things the flattened lines editor had dropped — 2026-08-25

Flattening `ServiceItemsEditor` into `components/flow/ServiceLinesEditor` lost
three things from the old `ServiceLineEntriesEditor`. Restored:

- **The per-kind hint.** The old editor printed `LINE_KINDS[].hint` under every
  line. This is the one that mattered: the kind decides whether a line puts a
  component on the vehicle's parts map, and "Part / Supplies / Fee" is not
  self-evident to an owner reading a receipt — a tin of degreaser kinded as a
  Part adds a component the vehicle never had. It is now stated **once** per
  editor in a collapsed "What these kinds mean" legend rather than repeated
  under all five lines, which in a flat table was the same four sentences over
  and over.
- **The empty state.** A service with no lines rendered nothing but an "Add a
  line" button. It now says what the emptiness costs — a total and nothing
  about what it bought — at the moment it is true, rather than leaving the
  owner to find out on the history screen.
- **The part code.** `partCode` round-tripped through the form but was never
  shown. It is back under the description, read-only and in the mono face,
  because it is evidence off the receipt rather than something to type.

**No dropdown option was ever missing** — the select maps the full four-element
`LINE_KINDS`, verified rendering Labour / Part / Supplies / Fee.

## The parts map on a phone — changed, with the reasoning — 2026-08-25

`ink-vehicle.css` hid `.vehicle-diagram` outright below 720px. The note above
the rule argued: the markers are smaller than a fingertip, a map you cannot
reliably tap is worse than no map, and the list carries the same information at
44px a row.

**The first half is right and is kept. The conclusion is what changed**, at
Brent's request after the drawing vanishing on a phone read as a bug rather
than a decision.

The original reasoning treats the drawing as *only* a tap target. On a phone
its greater value is orientation — *where on my car is this* — which needs no
tapping at all. So the drawing now stays and the markers stop being controls:
`pointer-events: none` below 720px. Selection still flows the other way, from
the list to the map, so tapping a 44px row lights up its marker. That makes the
drawing an output on a phone rather than a second, worse copy of the list, and
nothing is offered that cannot be hit.

No accessibility change either way: `VehicleDiagram` already renders the whole
SVG `aria-hidden="true" focusable="false"` with markers as `<g>` rather than
buttons, so nothing here was ever in the tab order. Verified at 375px (diagram
visible, markers inert, zero focusable descendants) and at 750px (unchanged —
`pointer-events: auto`, `cursor: pointer`).

**This is the vehicle-page slice, not `serviceinput`/`validation`.** It is on
its own branch, `vehicle-diagram-on-mobile`, off `main` rather than folded into
the add-record work, so whoever owns the vehicle page can take it or drop it on
its own merits. If you disagree, the one-line revert is restoring
`display: none` — but please leave a note saying why rather than deleting this
one.

---

## Account settings rebuilt on Ink — two sections removed (2026-08-25)

`/account-settings` was the last signed-in screen still served by the legacy
`styles.css` block (~7329-7690). It is now a one-scrolling-page Ink screen in
`src/styles/ink-settings.css`, imported last in `main.jsx`. The legacy block is
untouched and simply stops matching - the new markup uses `set-*` class names.

**This landed on top of the notification-preferences and profile-photo work
(b009418..bebdc20), which was written against the old layout at the same time.**
The layout here is mine; the data layer is theirs, unchanged:
`api/notificationPreferences.js` owns the switches, `api/profilePhoto.js` owns
the upload. Nothing in this slice reimplements either.

The one deletion worth disagreeing with:

**"Privacy & Access History" and "Active Shared Sessions" are gone from
Settings.** Both called the same two endpoints as `/access/requests` (Shared
Access) and showed a weaker read-only copy of it under different names - no
filters, no approve/deny, no QR. Shared Access is now the single home of access
control, and Settings no longer calls the mechanic-access endpoints at all. If
you want a summary back on Settings, the argument for it is discoverability
(the owner may not know Shared Access exists), and the fix is a one-line link,
not a second list.

An earlier draft of this screen had the two mechanic-access notifications as
always-on facts rather than switches, on the grounds that they are the only
ones with a consequence for who sees the owner's records. That is dropped: the
preference module makes all three real, and a design that draws a working
switch as an immovable fact is worse than the argument for it. The grouping
survives - one row under "Your records", two under "Mechanic access" - because
the split is still the honest description of what they are about.

Copy follows the same rule and was corrected twice while writing it: the photo
follows the account now (Supabase storage, migration 013) and saves on choice,
so only the phone number is browser-local; and the preferences are no longer
write-only, so the note says they control the notifications list and the
sidebar count rather than claiming they do nothing.

**Verified as far as it can be.** Production build passes. Layout, tokens,
control heights, the <=820px phone layout, per-field password validation, the
unsaved-changes count, and the sign-out confirm step were checked in a
throwaway harness that mounts the page outside the route guard (removed
afterwards). **Nobody has clicked this behind a real login** - the
Supabase-backed paths (profile save, email change, password re-auth, photo
upload, sign out) are unexercised, and the photo upload in particular is
someone else's code meeting my markup for the first time.

---

## The green brand — landing v2, auth v2, and the token layer (2026-08-27)

The palette is now green, not the warm paper "Ink" one. Source of truth is the
`Trevora Landing v2` and `Trevora Auth v2` boards in the Claude Design project
(`23d5f5d3-ea99-44d8-a814-2bb688f56f9c`). This is a whole-product change, not a
landing-page change, so read this before you next touch a stylesheet.

**How it was done, and why that way.** One new sheet,
`src/styles/trevora-brand.css`, imported last in `main.jsx`. Every existing
sheet already routes colour, type and radius through tokens (`--tv-*` in
`styles.css`, `--ink*` / `--font-*` in `ink-app.css` and `ink-auth.css`), so the
whole app re-skins by redefining those tokens in one place. Nothing in
`styles.css` was edited — it is 11k lines and four people have it open.

Two token decisions that will look wrong until you know the reason:

- `--font-serif` no longer names a serif. The brand's display face is
  Bricolage Grotesque. Every heading in the app already reads that token, so
  the token changed value rather than several hundred call sites changing
  token.
- `--ok-*` / `--status-ok-*` are the brand's own dark green. A green "ok" badge
  on a green product stops being a signal, so those states lean on their word.
  Status is still never colour-only.

**The logo changed.** Three plates offset in depth, the top one carrying the
lines — records piling up. It lives in `components/TrevoraMark.jsx`, which
`InkLockup` and `BrandLogo` both wrap, plus `public/trevora-mark.svg` for the
favicon. It takes `currentColor`, so the dark shell chrome (sidebar, mobile
topbar, menu drawer) gets it in paper and everywhere else in green. Do not
shrink it below 30px: the rear two plates are three pixels of tone each and
that is the entire idea.

**The landing page was rebuilt, not restyled.** `LandingPage.jsx` and
`styles/landing-v2.css`, under a `.tvl-` prefix that collides with nothing. It
no longer names any `.fig-*` class — those ~300 rules in `styles.css` and all
of `styles/ink-landing.css` are now dead, but they are left in place because
deleting from a shared file mid-sprint is how you lose an afternoon. Someone
should remove them once nothing else is in flight.

Its photographs are slots (`ImageSlot`), not fixed assets: they render a
labelled frame until a real file exists at the path, and the real image the
moment one does. **Nine of them are still frames.** Drop files into
`public/landing/` — `receipt.jpg`, `vehicle-page.png`, `mechanic.jpg`,
`view-timeline.png`, `view-components.png`, `view-table.png`,
`receipt-p1..3.jpg` — and no code changes.

**Verified as far as it can be from here.** Production build passes. The
landing page and `/login`, `/register` were checked in the running dev server
at 1280px and 375px: tokens resolve, the mint auth panel and its drift render,
fields are 14px, buttons are pills, the mark is green at 30px, and neither
width scrolls horizontally. **Every screen behind the login is unverified** —
the token layer re-skins the Garage, Vehicle, Records, settings and mechanic
surfaces sight-unseen, and nobody has looked at them. Expect a handful of
places where a colour was hard-coded rather than tokenised and so did not
follow; those need finding by eye, one screen at a time.

### Addendum, same day — signup goes straight through

The two-step signup is one step for now, at the owner's request. Concretely:

- **No OTP screen.** `registerUser` used to sign the new account back out and
  post a six-digit code even when Supabase had already returned a session. It
  now uses that session: sync the profile, set the local user, done.
  `verifyRegistrationOtp` is parked in `api/auth.js`, unreferenced, because the
  step is expected back and rewriting it against `verifyOtp`'s type/session
  handling twice is a waste.
- **No vehicle step.** Signup lands on the Garage. `/welcome` and
  `/register/vehicle` still exist and are still routed — they are simply no
  longer linked from signup, and `WelcomePage` (someone else's file, landed in
  the same pull) was not touched. The walkthrough is therefore unreachable
  until someone re-points it; that is a decision waiting, not an oversight.

**The one thing to know before testing this:** whether signup lands straight in
the app depends on the Supabase project's **Confirm email** setting, not on our
code. With it on, `signUp` returns no session and the owner genuinely has to
click a link in their inbox first — the page says so and stops. With it off,
they are in. If signup appears to "not work", check that toggle before
reading the code.

Also fixed here: a specificity trap worth knowing about, because it will bite
again. `button:hover:not(:disabled)` in `ink-app.css` scores (0,2,1), so it
beats any plain `.some-class:hover` at (0,2,0) and repaints the element
near-black on hover — this is why the FAQ rows and the Google button went dark.
A component hover rule on a `<button>` needs either a third class-level token
(`.x:hover:not(:disabled)`) or an ancestor class to clear it.

### "Supabase Auth is not configured" after pulling — read this before debugging it

Nothing to do with the brand work. The `vite.config.js` that arrived in the
same batch sets `envDir: '../..'`, moving the frontend's configuration from
`frontend/trevora-web/.env` to a single `.env` at the repository root — which
is what `.env.example` has always described. The frontend `.env` is no longer
read, and on a machine with no root `.env` every `VITE_*` variable comes back
empty, so `requireSupabaseClient()` throws on the first sign-in attempt.

`.env` is gitignored, so this hits each person exactly once and looks like a
regression in whatever they touched last. **The fix is to create `.env` at the
repository root** — copy the `VITE_*` lines out of
`frontend/trevora-web/.env`, and restart the dev server, because Vite reads
env files only at start. Done on this machine already.

Two things still open on it: the root `.env` here holds only the two `VITE_*`
variables that existed in the frontend file, not the backend block
`.env.example` lists, so the single-shared-file arrangement is half done. And
`VITE_API_BASE_URL`, `VITE_SUPABASE_RECEIPT_BUCKET`,
`VITE_SUPABASE_AVATAR_BUCKET` and `VITE_SUPABASE_VEHICLE_PHOTO_BUCKET` are all
read by the app and are all absent — they have defaults, but whether those
defaults are the right ones for this project is unverified.

#### Same root cause, backend half: `Connection to localhost:5432 refused`

The note above was only half the story. Commit `0b92554` ("refined mechanic
view") moved **both** halves of the project onto a single repository-root
`.env` in one go — `envDir: '../..'` in `vite.config.js`, and

    spring.config.import=optional:file:.env[.properties],optional:file:../../.env[.properties]

in `application.properties`. Neither import is required, so with no root `.env`
the backend reads no configuration at all and silently falls through to the
defaults — including `spring.datasource.url`'s
`jdbc:postgresql://localhost:5432/postgres`. Hence a stack trace about a local
Postgres nobody is running, on a project that has never used one.

`file:.env` does resolve to `backend/trevora-api/.env` **if** Maven is invoked
from `backend/trevora-api`. Run from the repository root — which is what
`.claude/launch.json` does — that same path resolves to the root `.env`, and
`../../.env` resolves outside the repo entirely. So whether the API boots
depends on which directory you were standing in, which is not a property a
project should have.

Fixed here by merging the backend variables from `backend/trevora-api/.env`
into the root `.env`, which makes both invocation directories work. **Verified
by actually starting it**: Hikari opens a Supabase connection, Hibernate
validates the schema, Tomcat comes up on 8080 and `/health` answers 200.

Left deliberately undone, because it is a call for whoever owns deployment:
the values now exist in two files, and `backend/trevora-api/.env` and
`frontend/trevora-web/.env` are both dead weight that will drift. One of them
should be deleted and `.env.example` made the only description of the layout.

While in here: the primary button's pressed state was `#084a31`, a third step
down from base -> hover, and it read as black rather than as a press. It is now
the hover green plus a 1px nudge. Base -> hover -> darker-still does not work
with a green this deep; move the button, do not keep dimming it.

### The walkthrough is back in the signup flow, rebuilt (2026-08-27)

Signup is account -> `/welcome` -> `/register/vehicle` again. `RegisterPage`
routes owners to the walkthrough on success; admins still go straight to the
dashboard.

**One accuracy fix that matters more than the paint.** `HistoryPreview` showed
a green "Validated" badge on all three rows. That is the exact claim migration
009 exists to prevent, and the same one that was deliberately removed from
`ServiceRecordDetailPage` and the mechanic view. `utils/recordStatus.js` is
explicit: the backend exposes no validation status on confirmed records, so a
record without one is **"Needs review"**, never "Validated". Onboarding was
teaching owners to expect a badge the app will never give them. The preview now
shows what they will actually see, its columns match `RecordsTable`
(date / service / odometer / cost / status), and the step copy says a record
carries its own status rather than one being assigned on their behalf.

Three claims were checked and are correct, so nobody needs to re-check them:
four-hour session expiry (`AccessApprovalService.SESSION_EXPIRATION`, distinct
from the 24-hour QR link), "Step 4 of 6 / Check the details" on the review
screen, and the search placeholder wording.

**`styles/ink-welcome.css` was rewritten in place**, not overlaid. It has one
consumer and every selector is `wt-`-prefixed, so a second sheet fighting it
would be worse. It reads brand tokens throughout — no hard-coded colour.

Motion is `key={current.id}` on the stage: changing the key remounts it, so the
CSS entry animation re-runs per step with no animation library and no state to
keep in sync with the step index. Preview rows stagger in beneath it. All of it
is off under `prefers-reduced-motion`.

**Signup step 2 got its own shell variant.** `InkAuthShell` builds class names
from `variant`, and the vehicle form was passing `signup` — inheriting a 420px
column meant for five short fields while carrying eight plus a photo dropzone.
That is what made it a tall thin stack. It now passes `vehicle`, and
`styles/signup-vehicle.css` gives that variant a 620px column with year and
plate paired. `/register` is untouched.

Also: the password strength meter and its rule are hidden until something is
typed, on both signup and password reset. Four empty bars beside an untouched
field read as a failure state, which is a poor first impression of a form.

**Still unverified end to end.** Nobody has walked signup with a real account.
The walkthrough was checked by stubbing `trevora.authUser` in the browser to
get past the route guard — enough to confirm layout, tokens, animation and the
corrected table, not enough to confirm that `hasSeenWalkthrough` /
`markWalkthroughSeen` behave against a live session, or that the once-only
redirect actually fires for a returning owner.

#### Correction to the above: signup step 2 left the auth shell entirely

The `vehicle` shell variant described in the previous note lasted about an
hour. Widening the shell's column was treating the symptom — the real problem
is that `InkAuthShell` is a two-column split with a panel down the left, which
suits sign in and create-account (short forms with room to spare beside them)
and does not suit eight fields plus a photo dropzone. `RegisterVehiclePage` no
longer uses the shell: no panel, no "Step 2 of 2" meter, no next-steps list —
a centred 720px sheet on the page instead, edge-to-edge below 768px.

**It still carries the `ink-auth` root class, and that is deliberate.** Every
input, label, help and error rule in `ink-auth.css` is scoped under it.
Dropping the class would mean restyling every control on the page to gain
nothing. `styles/signup-vehicle.css` undoes the shell's *layout* — the flex
row, the panel, the fixed column — and leaves its control styling alone. If
you are tempted to "clean up" that class, this is why it is there.

The step counter went with the panel. Signup is now account -> walkthrough ->
vehicle, and the walkthrough already has its own six-position stepper, so a
second "2 of 2" counting something different was two progress indicators
disagreeing about how long signup is.

Verified at 1440px and 375px: no panel, no progress meter, controls keep their
52px height and 14px radius, no horizontal scroll at either width. Still not
walked with a real account — see the note above.

### Bringing the green into the app: the Garage, and the method (2026-08-27)

The palette swap alone did not make the signed-in screens look rebranded, and
the reason is worth writing down before anyone repeats the diagnosis: the app
sheets were already fully tokenised — `ink-garage.css`, `ink-record.css`,
`ink-settings.css` and `ink-mechanic.css` contain **zero** hard-coded hex — so
`trevora-brand.css` did move every colour. What it could not move is a design
decision. Ink's own header says "No decorative accent colour. Chroma means
record status, nothing else", and a grep confirms it: before this change, not
one app stylesheet referenced `--brand`. Nothing after the login was green
because nothing after the login was *meant* to be coloured.

So this is not a token job. It is a per-surface design pass, and there are
four parts to it:

1. **Radius literals -> tokens.** Ink's 12px card against the brand's 20px is
   the single biggest reason a screen still reads as the old product. There
   are ~78 hard-coded `border-radius` values left across the app sheets;
   `service-flow.css` alone has 33 against 16 token uses.
2. **Pick where green goes** — primary action, active nav, selected state,
   eyebrow. One or two per screen. Spraying it everywhere loses the meaning.
3. **One tinted ground per screen** (`--brand-wash` / `--brand-tint`), so
   something sits off the white.
4. **Fix the hover/press fall-through** on anything restyled. See below.

**`styles/brand-app.css` is where this lives**, one section per surface as
each is converted, scoped to a page-level class so converting one screen
cannot silently repaint another nobody has looked at. It is a migration, not a
layer: when the app is fully across, fold these rules into the sheets they
override and delete the file.

Garage is done — cards and panels at 20px, a `--brand-wash` head on each
vehicle card, brand green on the page actions, the eyebrows, the active
carousel dot, the table link and the spend ramp. The spend ramp is still one
ramp rather than a hue per category, for the reason `ink-garage.css` already
gives: ordering is not category identity.

**The rail stays dark.** It is the app's only dark surface, and mint there
would leave the product one flat field with nothing anchoring the layout.
Brand green on `#16211c` fails contrast badly, so the active nav marker and
the nav count use `--brand-glow-b`, the palest tint in the ramp. Revisit if
someone wants it, but revisit it deliberately.

**Two pre-existing bugs surfaced and are fixed globally, not per screen.**
`.ink-button--outline:hover` scores (0,2,0) and loses to ink-app.css's bare
`button:hover:not(:disabled)` at (0,2,1), so **every outline button in the
product** filled near-black on hover — wrong before the rebrand too, just far
more visible now. The carousel's page dots had the same problem. This is the
third time this exact fall-through has bitten; assume it applies to every
`<button>` you restyle with a single class.

Also fixed in passing: the Garage's empty state promised "records, reminders
and what you share with a mechanic". Trevora does not do reminders — the
landing page says so out loud. It now says history.

**Unverified by a human, as ever.** Checked by stubbing `trevora.authUser` to
get past the route guard and reading computed styles, including on injected
probe nodes for the card, panel, breakdown and empty-state rules that need
real data to render. That confirms every selector matches and wins the
cascade. It does not confirm the screen looks good with actual vehicles in it.

#### The rail went light (2026-08-27)

Reversing the call made a few hours earlier in the note above, deliberately and
with the owner's agreement rather than by drift. The argument for keeping it
dark was that it anchored the layout. The argument against turned out to be
stronger: it was the last piece of pure Ink in the product — a 264px slab of
`#16211c`, square edges, hairline dividers, a 3px left rule for the active row
— and it spoke a different language from the mint panels, 20px cards and pills
on every other surface. That mismatch is what read as clutter, not the content.

What it is now: 240px on `--brand-wash` with a hairline right edge, no
dividers (space separates things in this brand; rules are for tables), an icon
per row, the active row as a filled mint pill, and the account block as one
rounded white tile instead of two hairline-divided rows.

**The concrete gain, beyond consistency:** brand green on `#16211c` fails
contrast badly, which is the only reason the active marker was `--brand-glow-b`
rather than the brand colour. On a light rail the accent is `#0e7a52` itself
and the active label is `#0a5a3c` on `#eef6f1`.

Active state has now changed three times, always for the same reason — two
devices saying one thing. It was a filled row *and* a left rule; then weight
plus the rule; now the pill alone. If you find yourself adding a second marker
to it, that is the mistake repeating.

The mobile topbar and the menu drawer went light with it. They were dark for
the same reason the rail was, and leaving them would have meant the phone and
desktop layouts disagreeing about what the app chrome is.

Verified at 1440px and 375px by stubbing the session: rail `#f7faf8` at 240px,
five icons, active pill `#eef6f1` with `#0a5a3c` text and no left border,
account tile white at 16px, lockup back to brand green, topbar light with dark
type, no horizontal scroll. Still nobody has clicked it with a real account.

#### The rail collapses (2026-08-27)

A toggle beside the wordmark narrows the rail from 240px to 68px: icons only,
wordmark hidden, mark kept, account tile down to the avatar. Not a full hide —
hiding the nav outright makes every navigation cost a click to bring it back,
and the icons added in the previous change are exactly what makes an icon-only
state readable. This was not a viable option before them.

Three details that are load-bearing and easy to undo by accident:

- **The labels are clipped, not removed.** `display:none` on
  `.ink-nav__label` would leave five links a screen reader announces as
  nothing at all — the label *is* the row's accessible name. It gets the
  sr-only clip treatment instead, and `title` gives sighted users the same
  thing on hover. Verified: the collapsed row still reports "Garage".
- **The state is per browser, not per account.** It is about the screen you
  are sitting at, so it is localStorage (`trevora.railCollapsed`), read
  defensively — private mode and blocked site data throw on access rather
  than returning null.
- **The localStorage write is outside the state updater.** React StrictMode
  calls updater functions twice in development to surface impure ones, so a
  side effect in there fires twice per click. Harmless when writing the same
  value; not harmless as a habit.

Sign out is not reachable from the collapsed rail — a 68px column has no room
for a text row. It is one click away via widening the rail, and it is also on
the account settings page. If that turns out to annoy people, the answer is an
icon row, not a squeezed label.

Below 900px the rail is `display:none` and the topbar takes over, so the
toggle is hidden there; it would have nothing to act on.

**On the verification:** collapsing, expanding, the accessible name, the width
change, and restoring the collapsed state on load were all confirmed. Getting
there was messier than it should have been — the stubbed session keeps being
cleared by a 401 from the fake token, which redirects to /login and remounts
the shell mid-test, and that produced one run that looked like the preference
was not persisting when it was. Worth knowing before anyone repeats the
stub trick: if the rail state looks wrong, check the session is still there
before you go looking at the code.

### Vehicle page across to the brand (2026-08-27)

Same four-part pass as the Garage, in `styles/brand-app.css` under
`.vehicle-page`, which the page already carried.

Cards, table card and empty states to 20px; the identity block — photo, name,
badges, actions — gets the tinted ground, deliberately the same move as the
vehicle card head in the Garage so the two screens agree about what "this
vehicle" looks like. The photo placeholder keeps its dashed border: it is
holding space for a photo nobody has added, and a solid box would read as one
that has been.

**The completeness bar is the interesting one.** A documented year was `--ink`
— the same near-black as body text — so the bar read as a chart rather than as
coverage. It is green now, because this is the one place the page says "there
are records here".

That change shipped broken for about ten minutes and the bug is worth
recording, because it is the kind that reviews miss. `.vehicle-page
.vehicle-years__block` and `.vehicle-years__block.is-empty` tie on specificity
(both 0,2,0), so the new rule won on source order and painted **every**
undocumented year the same green as a documented one — turning a coverage bar
into one solid block that says nothing, on a screen whose entire job is
showing gaps. The fix is `:not(.is-empty)` on the brand rule, and it is
load-bearing rather than decorative: anyone "tidying" that selector away
reintroduces it silently, because the page still looks fine, it just lies.

The Timeline / Components / Table switcher is a pill of segments now instead
of a boxed group, and the divider between segments is gone — with a filled
pill marking the selection, the rule was a second device saying the same
thing. That is the same reasoning that took the left rule off the nav rows.
`.ink-segmented` is used only by this page, so those rules are unscoped.

Verified by probe nodes under a stubbed session: identity ground `#f7faf8` at
24px, cards 20px, filled year `#0e7a52` and empty year `#f2f6f4` still dashed,
eyebrows and page actions brand green, segmented pill 100px with a white-on-
green active segment. Nobody has seen it with a real vehicle in it.

### Records across to the brand — the list and one record open (2026-08-27)

Both, because "records" without the detail page would leave the two halves of
the same feature in different design languages. `RecordsPage` had no
page-level class of its own, so it gained `records-page`; the detail page
already carried `record-page`.

The list: table card and empty state to 20px, the empty state on the wash, and
the toolbar's two controls — search and filter — to the 14px field radius with
the brand's focus ring instead of the ink one. Those two were the only
interactive things on the screen and they still looked like the old product.

One record open, two changes worth naming:

- **The per-field icons** were 36px outlined boxes — thirty-odd hairline
  squares down a page whose subject is a single service visit. Filled with the
  tint, rounded to 12px, border dropped. They stop competing with the values
  beside them, which are the reason anyone opened the page.
- **The provenance disclosure** (`record-trace`, where each value came from)
  sits on the wash now, and its hairline top border went with the fill. A rule
  *and* a background doing the same separating job is the pattern this rebrand
  keeps removing — it is the third time, after the nav rows and the segmented
  control. Treat it as a rule: pick one.

The trace stays deliberately quiet — wash rather than tint — because it is
reference material, not the subject.

Verified by probe under a stubbed session: search and filter 14px, table card
and record card 20px, notice 18px, field icons `#eef6f1` on 12px with
`#0a5a3c` glyphs, trace on `#f7faf8` at 16px with no top border, eyebrows and
page actions brand green. Neither screen has been seen with real records in
it, and the detail page in particular has states I cannot reach — an AI
explanation present, a stored receipt, line entries.

### The .env pruning, settled (2026-08-27)

Three `.env` files existed; one is correct. **The repository root is the single
source**, because that is what both halves of the project were pointed at by
commit `0b92554` — `envDir: '../..'` in `vite.config.js` and
`spring.config.import=…file:../../.env` in `application.properties` — and it is
what `.env.example` has always documented. Keeping per-module copies means
three files that drift silently, and the drift shows up as a runtime failure
in whichever one you did not edit.

Checked before touching anything: the root file's key set is a strict superset
of both module files, and every shared key has an identical value. So nothing
was lost.

`frontend/trevora-web/.env` and `backend/trevora-api/.env` are **renamed to
`.env.superseded-20260827`, not deleted.** Neither Vite nor Spring loads that
name, `.env.*` is gitignored so they stay out of the repo, and one `mv` puts
them back. Deleting gitignored secrets has no undo and that is not a risk worth
taking on someone else's machine — **delete them yourself once you are
satisfied.**

Verified rather than assumed: the API was stopped and restarted from the
repository root with only the root `.env` present. Hikari opened a Supabase
connection, Hibernate validated the schema, Tomcat came up, `/health` returned
200. The frontend build passes and the browser reports Supabase configured.

Six variables `.env.example` documents are set nowhere: `PORT`,
`VITE_API_BASE_URL`, `VITE_SUPABASE_RECEIPT_BUCKET`,
`VITE_SUPABASE_AVATAR_BUCKET`, `OPENAI_RAW_TRANSCRIPTION_MODEL`,
`OPENAI_TEXT_TRANSLATION_MODEL`. All have code defaults that match the
migrations (`service-receipts`, `profile-photos`, `http://localhost:8080/api`),
so local development is fine without them. **Deployment is a different
question** — `VITE_API_BASE_URL` defaulting to localhost is exactly the kind of
thing that ships broken to Render.

### Add-record flow across to the brand (2026-08-27)

`service-flow.css` is the best-behaved sheet in the project: its own `.flow-*`
namespace, its own root class, and it already routes its primitives through
`--radius` and `--radius-card`, so card and button *shapes* came across with
the token swap unaided. What it lacked was the accent, for the reason its own
header gives.

**That rule is kept where it means something.** The blocking tier stays red
(`--tier1`) — a field that stops the save is not brand expression. Green goes
only on what the owner acts on: the primary button, the six-segment progress,
and selection.

Two of its arguments are restated rather than overridden, because both survive
the palette change and both are easy to "fix" back into bugs:

- **Disabled keeps its filled grey with an ink label.** Paper on `#c4bdb0`
  measures 1.70:1 — an unreadable label, not a style opinion.
- **Selection is a thickened border, not a colour change**, so it survives
  greyscale. Only the hue moved.

One inconsistency found and fixed while in here: `.ink-button` picks up the
pill radius from the brand layer, but `.flow-btn` is a different class in a
different sheet and was left at the 14px field radius — so the add-record flow
was the one place in the product with square-ish buttons. Easy to miss,
because the two classes never appear on the same screen.

Verified by probe under a stubbed session: primary `#0e7a52` at 100px,
disabled `#d8e1dc` with `#16211c` text, completed progress segments green,
eyebrows green, selection a 2px brand border with a filled brand tick, all
three button sizes pilled. Nobody has walked the six screens with a real
draft — and the camera, receipt-upload and voice screens have states
(a live stream, an uploaded image, a recording in progress) I cannot reach.

### Account settings across to the brand (2026-08-27)

Scoped under `.ink-settings`, which the page already carried. Buttons to brand
green and to pills — `.set-button` is its own class in its own sheet, so like
`.flow-btn` it never picked the pill radius up from the brand layer. That is
now three separate button classes in three sheets; worth collapsing when this
migration file gets folded back in.

**Two variants had to be restated, and the reason is not stylistic.** The
brand fill is written against `.set-button`, which also matches
`.set-button.quiet` and `.set-button.danger` — both of which set their own
fills further up `ink-settings.css`. Left alone, the new rule wins on source
order and paints both green, and *a green "Delete account" button* is the
worst outcome available on this page. Danger keeps the red pair, quiet keeps
white. If either looks redundant later, it is not.

Field focus takes the brand ring, the avatar takes the tint, group labels take
the green.

**The notification switches are green when on**, which is the one place in this
product where a colour appears to carry state on its own. It does not:
`.set-row-word` prints "On" or "Off" beside every track, and `ink-settings.css`
is explicit that the word is why the switch may be coloured at all. Removing
the word to tidy the row would break the rule the colour depends on.

Verified by probe under a stubbed session: primary `#0e7a52` at 100px, quiet
white with ink text, danger `#fdf2f1` with `#a8342a` text, avatar `#eef6f1`,
group labels green, cards 20px, inputs 14px, toggle `#0e7a52` when checked and
`#f2f6f4` when not. The page's real work — saving a profile, changing an email,
re-authenticating for a password change, uploading a photo — is untouched and
still unexercised by anyone.

### Shared access and the mechanic view (2026-08-27)

Both scoped to page classes they already carried, `.access-page` and
`.mechanic-page`.

Shared access: cards to 20px, actions to brand green, and the two sets of
outlined icon boxes — the privacy notice's shield and the numbered
how-it-works steps — filled with the tint, the same move as the record fields.
The **live-sessions count** is green: it was ink like the other three, and
green is what makes "somebody is reading your records right now" findable in a
row of four numbers. The greyed `:not(.is-live)` rule already in
`ink-access.css` does the other half of that job.

**The QR code is explicitly left on white.** A scanner needs the contrast the
code was generated for, and a tinted ground behind a QR code is the kind of
styling that works in a screenshot and fails in a workshop. There is a rule
restating `background: #ffffff` purely so a later "tint everything" pass
cannot take it.

The mechanic view is the one screen someone outside the account ever sees, and
it is read-only by design — it has no actions to colour. So the green goes on
orientation only: the expiry chip becomes a mint pill, the timeline year
headings take the dark green, and nothing near the records themselves changes.
The warn and bad notes keep their status colours: a mechanic reading "this
record was never reviewed" needs that to be the loudest thing on the line.

**One page is not done, and it is not a brand pass.**
`MechanicAccessRequestPage` — the page a mechanic lands on after scanning,
before the owner approves — is still on the pre-Ink `styles.css` classes:
`page-shell module-four-page`, `mechanic-dashboard-card`, `button-secondary`,
`modal-backdrop`. It never got rebuilt on Ink, so there is no Ink sheet to
re-skin. It has taken the green *palette* through the `--tv-*` tokens, so it
does not look broken, but it is in the old layout language and none of the
brand's shapes reach it. Rebuilding it is a page rewrite on the scale of the
vehicle-signup one, not an entry in `brand-app.css`. **It is also the only
screen in the product a stranger sees before they trust it**, which is an
argument for doing it sooner than its size suggests.

Verified by probe under a stubbed session — access: summary and cards 20px,
live count `#0e7a52` against `#7a867f` for the idle ones, notice and step icons
`#eef6f1` at 12px, scope panel on the wash, QR still `#ffffff`, actions green.
Mechanic: expiry a 100px `#eef6f1` pill with `#0a5a3c` text, year headings
`#0a5a3c`, warn note still `#f0e3c6`, cards 20px. Neither screen has been seen
with a real access request or a real session.

### The mechanic's request page, rebuilt (2026-08-27)

The last page still wearing the pre-Ink classes from `styles.css` —
`page-shell module-four-page`, `mechanic-dashboard-card`, `button-secondary`,
`modal-backdrop`. There was no Ink sheet to re-skin, so it is rewritten on its
own sheet, `styles/mechanic-request.css`, under a `.mreq-` prefix. None of the
legacy classes were touched.

**Three things changed that are not paint, and the first one matters most.**

- **The form shipped pre-filled with a person who does not exist.** Its
  initial state was "Juan Santos" of "Superior Auto Repairs", with a phone
  number and a written-out reason — demo data left in a live form. A mechanic
  who tapped Send without editing four fields sent the owner a request under
  that name, and the owner's approval screen would have shown it to them as
  the person asking. On the one screen in this product that exists to
  establish trust between two strangers. Fields start empty, with placeholders
  that say what each is for, and the name is the one required field because
  the owner approves or declines on the strength of it.
- **The request form is inline rather than a modal that opened itself.** It
  appeared over the page before the reader had seen what they were being asked
  to agree to, and a backdrop dialog is the wrong container for four text
  fields on a phone held at arm's length in a workshop.
- **The status enum is no longer printed raw.** "PENDING" went straight from
  the API into a sentence a stranger reads. There is a map now, and
  "Waiting for the owner" is deliberately *not* amber — waiting is not a
  warning, and colouring it would tell a mechanic something had gone wrong
  when the owner simply has not looked at their phone yet.

Unchanged on purpose: **no plate number appears here.** The page is reachable
by anyone holding the link, before any approval, so it shows only the label
the owner chose. That was already right and the comment saying so is kept.

The page assumes mobile first — no shell, no nav, full-width controls, and
16px inputs so iOS Safari does not zoom the viewport on focus.

Verified at 1440px and 375px: a bogus token correctly resolves to "Access link
was not found" rather than hanging; cards 20px on white, scope panel on the
tint with a brand shield, inputs 14px/52px/16px, invalid state red, action a
full-width brand pill, no horizontal scroll at either width. The states that
need a live token — a valid link, a sent request, an approval arriving through
the five-second poll — are unexercised. Someone should scan a real code.

### Notifications, rebuilt (2026-08-27)

The other page still on the pre-Ink classes — `page-shell
notifications-page`, `notification-page-card`, `notification-tabs`,
`button-link-secondary`. Same situation as the mechanic request page: nothing
to re-skin, so it is rewritten on `styles/notifications.css` under a `.notif-`
prefix. The legacy rules in styles.css are untouched.

**The filter reuses `.ink-segmented`** rather than inventing a second two-way
switch. It is the vehicle page's view switcher — a pill of segments in the
brand — and a filter that looks like the switcher one screen over is one
fewer thing to learn. If that control changes, both change together, which is
the point.

**Unread is the tint plus the word.** The old row carried a `.unread-dot`
*and* a card modifier; the row now takes a wash background, a tinted icon, and
a small "New" pill. That is not the "two devices saying one thing" problem
this rebrand has removed three times elsewhere — the standing rule here is the
opposite one: *a state is never colour alone, each badge carries its word*.
Removing the pill to tidy the row breaks the rule the tint depends on.
Removing the tint only makes the list harder to scan.

**The icons were literal characters.** Each builder stored a glyph: `'!'` for
"somebody wants to read your service history", `'⏱'` for an expired session,
`'•'` for anything else. An exclamation mark in a circle is the icon for
"error" everywhere else on the web, which is not what a mechanic asking
politely for access is. The glyph is now chosen from the notification's
`category` at render time — a lucide icon per category, falling back to a
bell — and the `icon` field on the builders is left in place, unread, rather
than touched in three functions for no gain.

"Mark all read" is a text button rather than a filled one: it is a tidying
action and should not compete with the request each row links to.

Verified at 1440px and 375px under a stubbed session: rows 20px, unread
`#f7faf8` with an `#eef6f1` icon against white/`#f2f6f4` for read, "New" pill
brand green at 100px, filter pill 100px with a white-on-green active segment,
empty state on the wash, "Mark all read" correctly disabled and grey at zero
unread, no horizontal scroll. **The list itself was empty** — no real
notification has been rendered through this markup by anyone.

### Terms and Privacy Policy — real pages (2026-08-27)

The account form linked to `/terms` and `/privacy`, which did not exist. As
bare `<a href>` they did a full page load into a route with no match, so the
catch-all sent the reader to `/login` — a person who clicked "Privacy Policy"
before agreeing to it lost their half-filled signup form and landed on a sign
in screen. Both are real routes now, public and outside the auth guard,
because somebody deciding whether to agree has to be able to read them without
an account.

**READ THIS BEFORE THE PROJECT IS SHOWN TO ANYONE OUTSIDE THE TEAM.** I am not
a lawyer and neither document has been reviewed by one. What I could do, and
did, is make every factual claim in them true of this system — checked against
the code, not against a template:

- the four-hour approved session and the 24-hour share link;
- that scanning a code grants nothing until the owner approves;
- that the plate number is withheld until approval;
- that voice audio goes to OpenAI for transcription and is **not** stored,
  while the transcript is;
- the actual processor list: Supabase (auth, database, file storage), OpenAI
  (extraction, transcription, translation, mechanic search), Google Cloud
  Vision (OCR), Google (optional sign-in);
- that there is **no self-service account deletion**, because there is not
  one — `.set-button.danger` on the settings page is Sign out. Both documents
  say to email instead. Claiming a delete button that does not exist is the
  same class of lie as the "Validated" badge, and on a page with legal weight.

Accuracy is not legal sufficiency. Get both read by someone qualified.

Three placeholders live in `src/legal/constants.js` and nowhere else, so
filling them is one edit and cannot be done to one document and not the other:
`LEGAL_ENTITY` (currently "the Trevora team"), `LEGAL_CONTACT` (currently
`privacy@trevora.example` — the Privacy Policy promises a reply within thirty
days at that address, so it has to be a mailbox someone reads), and
`LEGAL_UPDATED`. Governing law is stated as the Philippines and the rights
section is written against the Data Privacy Act of 2012; if the entity is not
Philippine, that section is wrong rather than merely incomplete.

**A separate bug fixed on the way.** The agreement sentence was inside the
`<label>` for its checkbox, so a click on either link activated the label and
toggled the tick instead of opening the document. The sentence is now a
sibling of the input rather than its label — the input keeps its own
`aria-label`, so it is still named, and what is traded away is
click-the-words-to-tick, which is the right thing to lose on a sentence made
mostly of links.

Verified at 1440px and 375px: both documents render signed out, the
register-page links reach them client-side without losing the form, the 68ch
measure holds, cross-links between the two work, and there is no horizontal
scroll at either width.

### The walkthrough: typed headings and a real QR (2026-08-27)

**The QR was not a QR.** It was a 6x6 grid of `<span>`s switched on by
`index % 3 === 0 || index % 7 === 0` — a chequerboard with no finder squares
and no quiet zone, which no phone would even attempt to decode. On the step
whose entire subject is "a mechanic scans your code", the picture of a code
was the one thing on screen that could not be one.

It is a real `QRCodeSVG` now (`qrcode.react`, already a dependency and already
used on the owner's share screen). It encodes a **sentence rather than a URL**,
on purpose: scanning it decodes to "Trevora walkthrough preview - this is an
example code and grants no access", so a mechanic who points a phone at the
walkthrough is told what they are looking at instead of being sent to a link
that cannot work. It sits on white with no tint over it, same rule as the
share screen — a QR is read by a camera and the contrast it was generated for
is the point.

**The heading types itself**, and two things about that are deliberate:

- **Screen readers get the whole heading immediately.** The full text is in
  the DOM from the first frame as `.ink-sr-only`, and the typed copy is
  `aria-hidden`. A heading announced one character at a time is not an effect,
  it is a fault.
- **The rate is derived from the length**, clamped to 12–26ms per character,
  so every heading finishes in about the same second rather than the long ones
  dragging. `key={current.id}` on the stage already remounts per step, so the
  typing restarts on its own with no state to keep in sync.

The stage now builds in parts rather than arriving whole — eyebrow, heading,
body at 420ms, preview at 560ms. Those delays are tuned against the typing
speed so the body lands while the heading is still being typed; changing one
without the other pulls them apart. All of it, and the caret, is off under
`prefers-reduced-motion`, where the caret is hidden entirely rather than left
as a green bar stuck to every heading.

Verified: typing completes and the caret flips to done on both the first step
and the share step, the sr-only heading carries the full text throughout, the
QR renders at 41x41 modules on white. CSS animations do run in this preview
pane (checked — the staggered children reach opacity 1), so the build order is
real and not merely declared. **What I have not done is watch it**, because the
pane will not produce screenshots; the timings are measured, not judged. If the
stagger feels slow or the caret feels fussy, that is a taste call somebody has
to make with their eyes.

One stub-session artefact worth knowing, since it wasted time: with a fake
`trevora.authUser` the walkthrough sometimes redirects to `/register/vehicle`
mid-test, because `hasSeenWalkthrough()` reaches a live backend that answers
unpredictably for a token that is not real. It is not a bug in the page.

#### The preview now waits for the typing, rather than guessing at it

The mockup and the final CTA were on fixed delays (560ms and 680ms) chosen to
sit after the heading. That was a guess at how long the typing takes, and it
was wrong the moment a headline changed length — the mockup slid in underneath
a sentence still being written.

They are not on a timer any more. `TypedHeading` reports through `onDone` when
the last character lands, `WelcomePage` records which step that was, and the
preview gets `is-in` only when it matches the current step. Comparing against
`step` rather than holding a separate boolean means it resets itself on every
move with nothing to clear. The beat after the heading is a 140ms
`animation-delay` on the `is-in` state, which is the only number left to tune.

Two details that are easy to undo:

- **`onDone` fires from an effect, not from inside the state updater.**
  StrictMode calls updaters twice in development, so a callback in there runs
  twice per character.
- **Hidden means `visibility: hidden`, not just `opacity: 0`.** A preview that
  is invisible but still in the accessibility tree and the tab order is a
  place for focus to disappear into. The `prefers-reduced-motion` block
  restores both properties, because typing is skipped there and the hidden
  state must never be what paints while React catches up.

Verified across three steps: mid-typing the frame is `opacity: 0` /
`visibility: hidden` with no `is-in`; once the caret reports done it is
visible at full opacity with the 140ms delay applied; the last step's CTA
behaves identically. Still not watched by a human — the pane produces no
screenshots, so the sequence is measured rather than judged.

#### Auto-advance, and a lock against skipping a step (2026-08-27)

Each step now holds for **seven seconds and then moves on by itself**, except
the last, which ends with a decision rather than a deadline.

The seven seconds are counted **from the moment the heading finishes typing**,
not from arrival. Counted from arrival, a second of it is spent watching the
sentence appear and the reading time is really six — and it would shorten
further every time somebody wrote a longer headline. Measured end to end at
8109ms for the first step: ~1.1s of typing plus the 7000ms hold.

**Next is locked until the step has finished arriving.** Two mechanisms,
because one is not enough:

- `disabled` until the heading is typed, which also gives the reader a visible
  reason the button is not ready. It is a filled grey rather than a faded
  green — a half-opacity brand button reads as a rendering fault, and this one
  is on screen for about a second every step.
- A `movingRef` guard inside `go()`. Two clicks landing in the same frame both
  read the pre-click `step`, and with a functional updater that advances
  twice — one step skipped, and a skipped step here is a whole screen of the
  product. The disabled state closes most of that window; the ref closes the
  rest. Verified: **five clicks fired in a tight loop advance exactly one
  step.**

The right-arrow key is gated the same way. Left is not — leaving a step early
is always allowed.

**A Pause control was added, and it is not optional politeness.** Content that
moves on its own for longer than five seconds needs a mechanism to stop it —
WCAG 2.2.2. Seven is longer than five. The active stepper segment also fills
across the seven seconds so the advance is something you can see coming
rather than something that happens to you; paused, the fill stops where it is
rather than resetting, and under `prefers-reduced-motion` the fill is removed
entirely (a bar frozen at zero would read as a step that never loaded) while
the timer and the Pause button both still work.

**A crash was introduced and fixed during this change, and it is worth
recording why the build did not catch it.** The keyboard effect names
`headingDone` in its dependency array, and that array is evaluated during
render — above the `const headingDone = ...` line it is still in its temporal
dead zone, so `/welcome` threw `Cannot access 'headingDone' before
initialization` and rendered the error boundary instead. `npm run build`
passed the whole time. This is the frontend version of the standing warning in
CLAUDE.md about `./mvnw test` not proving the app starts: a green build says
the modules resolve, not that the page renders.

Verified against a stubbed session: no advance in 10s on the last step; no
advance in 10s while paused, with `aria-pressed` and the label flipping and
manual Next still working; the measured 8.1s interval above; and the
five-rapid-clicks case. The `/auth/me` call had to be intercepted in the page
to hold a session long enough to measure any of it — the fake bearer token is
correctly rejected by the backend (checked: 400, "Supabase session is invalid
or expired"), which signs the stub out mid-test.

### The hand-off from the walkthrough to the vehicle form (2026-08-27)

"Add your first vehicle" is the one moment in signup where the product stops
explaining and starts asking, and it was a cut. It now plays a one-second
overlay — a car pulling in on the mint ground, wheels turning, three lanes of
road streaming the other way — and then navigates.
`components/GarageTransition.jsx` and `styles/garage-transition.css`.

Decisions worth keeping:

- **Skip does not get it.** Somebody taking "Skip walkthrough" has said they
  want out, and a second of car is the opposite of honouring that. `leave()`
  is still the direct path; only the finishing CTA calls `startLeaving`.
- **The car barely moves; the road does.** Translating the car across the
  screen turns it into a blur at the size it needs to be legible. The ground
  moving underneath sells the motion and keeps the car centred.
- **`prefers-reduced-motion` skips the component entirely** rather than
  showing a still car for a second — the caller checks and navigates straight
  through. The CSS also stills everything, as a second line of defence if it
  is ever rendered anyway.
- **It is a status, not just decoration.** `role="status"` with a polite live
  region and the line "Opening your garage"; the car and the road are
  `aria-hidden`. A screen reader gets the sentence, not the scenery.
- **One second, and the number lives in two places.** `LEAVE_ANIMATION_MS` in
  WelcomePage.jsx is what the timer waits; the durations in the stylesheet add
  up to it. Shorten one without the other and the overlay is still driving
  when the next page has mounted underneath it.

The vehicle form now animates in at the other end (`veh-arrive`, 380ms, card
60ms behind the bar). Without it the overlay lifts on a page that was simply
already there, and the second before it reads as a stall rather than a
journey.

Verified: the overlay mounts on the CTA with `position: fixed`, `z-index: 60`
above the shell's sticky chrome, the mint ground, `gt-drive-in` on the car,
`gt-roll` on both wheels, three road lanes, the correct ARIA, and a brand-green
body with mint glass; it is gone a second later; and `/register/vehicle` runs
`veh-arrive` and settles at opacity 1 with no transform left over.

**Not verified: the reduced-motion branch**, which the preview cannot emulate.
It is a plain `if` around one call, but nobody has watched it take the short
path. And as ever, nobody has clicked any of this with a real account — the
stub token is rejected by the backend mid-sequence, which is the auth working
correctly and made this the fiddliest thing in the session to observe.

#### The hand-off is five seconds now, and that changed its shape

Asked for directly. Raising `LEAVE_ANIMATION_MS` alone would have been the
wrong way to do it: the car arrived in 620ms and then sat parked for the other
4.4 seconds, which reads as a hang rather than a transition.

So it became a journey with three parts instead of one entrance — the car
drives in over the first fifth, cruises while the road streams beneath it, and
**leaves the frame in the last fifth**, so the overlay is emptying itself at
the moment the next page takes over. That arc is one keyframe set
(`gt-journey`) spanning the whole duration with the easing carried on the
stops: ease-out in, linear through the middle, ease-in out. Two separate
animations, one in and one out, would fight over `transform` for the middle
three seconds.

The duration now lives in `--gt-run` on `.gt`, and every other timing in the
sheet is a percentage of it. Retiming is that one value plus
`LEAVE_ANIMATION_MS` in WelcomePage.jsx — they must move together.

**It is skippable, and at five seconds it has to be.** Any click or key cuts
it short and goes straight to the form, with "Tap anywhere to skip" appearing
under the label once the car has settled. The listeners attach after the click
that started it has already been dispatched, so that first click cannot skip
its own animation, and a cleanup clears the pending timer if the page unmounts
mid-run rather than navigating a component that has gone.

Worth saying plainly: five seconds is a long hold on a screen the person
demoing this will see many more times than any owner will. The skip is what
makes that acceptable rather than merely tolerable — if the escape is ever
removed, the duration should come down with it.

Measured in-page rather than by eye: a full run holds the overlay for
**5021ms** and lands on `/register/vehicle`; a `pointerdown` sent at 908ms
ends it at **921ms**, thirteen milliseconds later, on the same destination.

One thing that wasted a while and is worth recording: an unstubbed run measured
801ms, which looked like the timer being ignored. It was not — it was
`hasSeenWalkthrough()` resolving against the real backend and redirecting the
page out from under the overlay. Stub `/auth/me` before timing anything on
this screen.

#### The label was wrong, and the car was drawn badly

**"Opening your garage" described the wrong screen.** That click leads to the
form that creates a vehicle; the garage is somewhere the owner has not been
yet and will not reach until they have added one. It reads "Let's add your
vehicle" now, and `label` is still a prop so the component can be pointed at a
different destination when it is reused.

**The car was one hand-written bezier path.** It came out misshapen, which was
predictable: I cannot see the preview pane, and a single clever path is
exactly the thing that cannot be checked without eyes. It is now four kinds of
simple shape — a rounded body rect, a trapezoid cabin, two window panes and
two wheels — chosen because their coordinates can be verified one at a time
against each other. Which they were: body 8..192 x 40..68, cabin 60..142 x
17..42 sitting two pixels into the body so there is no seam, windows inside
the cabin with a six-pixel pillar between them, lamp inside the body at the
end it drives towards, wheels centred on the body's lower edge and drawn last
so they sit over it rather than behind it. Whole drawing 8..192 x 17..80
inside a 200x84 viewBox.

**That is geometry verification, not seeing it.** If it still looks wrong the
useful report is which part — cabin floating, wheels too big, body too long —
because that is the thing measurement cannot tell me and a person glancing at
it knows instantly.

General lesson for this file, since it has now cost time twice: anything
purely visual on this project is unverifiable from here. The preview pane
produces no screenshots, so vector artwork should be built from primitives
whose relationships can be reasoned about, and anyone reviewing it should
expect to be the first pair of eyes on it.

### One record, opened: layout and the explanation panel (2026-08-27)

Four changes, three of them answering a question about what belongs on the
page at all rather than how it looks.

**Actions moved to the top.** "Back to the vehicle" and "Share history" were a
footer under everything — so the way out of the page sat below a receipt
image, an explanation and a field table, and you had to scroll the whole
record to reach it. They are a row beside the breadcrumb now, both with icons.

**The receipt leads the side column.** It was last, underneath an explanation
of itself. It is the document every other thing on the page was derived from,
so it goes first.

**The record identifiers are gone.** The question was the right one to ask:
no, an owner does not need them. They were already folded into a `<details>`,
but folded away is still shown, and a record id and a draft id are diagnostics
for us — nothing in the product ever asks an owner for one, and anyone chasing
a support question still has them on the API response.

The **saved date** was promoted out of that disclosure to an ordinary field.
When a record entered the history is a real thing to want to know, and it was
hidden behind the same fold as the UUIDs purely because it happened to sit
near them.

**The explanation panel was rebuilt, and the run-on paragraph was the point.**
It was the last thing on this page still wearing the pre-Ink classes
(`ai-explanation-card`, `button-secondary`, `muted`). More importantly,
`AIExplanationService` builds "what was done" by concatenating sentences into
one string — "…completed on 7 May 2026 at Toyota Otis. Parts noted: oil
filter, brake pads. Materials used: … Work performed: … Total recorded cost:
…" — so the four facts an owner scans for were buried in prose.

`splitStatements` breaks it at sentence boundaries and promotes any
"Label: value" sentence to a row in a definition list. **This is presentation
only and invents nothing**: a sentence without a leading label stays a
sentence, so a freeform answer from the model degrades to ordinary paragraphs
rather than to nonsense. The label pattern is capped at four words so a
sentence that merely contains a colon is not mistaken for one.

**The real fix is server-side** — `AIExplanationResponse` should carry parts,
materials, labour and cost as fields instead of glued into `whatWasDone`.
That is a change to a DTO the mechanic view also reads, so it wants its own
pass and a grep for consumers first. Until then the frontend is unpicking a
string that should not have been assembled.

Also: the "generated fallback" notice is one quiet line now instead of a boxed
warning. An explanation written from the record rather than by the model is a
normal outcome, and announcing it in a bordered box read as a failure.

One measurement worth keeping: `minmax(min(100%, 220px), 1fr)` — the usual
idiom for stopping an auto-fit track overflowing a narrow container —
collapsed the details grid to one full-width track and three zero-width ones.
A plain `minmax(200px, 1fr)` with an explicit single column under 480px does
the same job predictably. Verified at 620px: two columns of 296px.

Verified: no `.record-trace` and no `.record-actions` remain in the DOM, the
top bar is a space-between flex row, the panel takes the brand's card padding
and green section titles, facts render as a two-column definition list, the
disclaimer keeps its hairline. **Not seen with a real record** — the panel's
content, which is the half of this that matters, needs an actual explanation
from the API to judge.

### Page width, record columns, list items, car outline (2026-08-27)

**`.ink-page` grows now.** It was pinned at 1176px, which is a comfortable
measure at 1440 and a lake of empty margin at 1920 — the app genuinely looked
better on a small screen than a big one, because a big one only ever added
whitespace. `--page-max` is 1440 and the horizontal padding scales with the
viewport. Measured at 1920 with the rail collapsed: 1440px of page and 206px
either side, against 338px before.

Deliberately a ceiling rather than unlimited. Tables and cards benefit from
more room; body copy does not, and every card holding prose keeps its own
measure regardless. Account settings keeps a narrower 1120 — it is a column of
forms, and a 1440px form row is not a better form row.

**The record page reads top to bottom in the order things happened.** The
receipt moved into the left column above everything derived from it: paper,
then what was read off it, then the fields it produced. The explanation has
the right column to itself and a wider one — 1.2/1 rather than 1.55/1, so 705
against 587 at 1920. It is the only prose on the page and it was the thing
being squeezed. It is also sticky above 1100px, because it is what you read
*while* looking at the fields and a long record used to scroll it away.

**Multiple parts are multiple lines.** `joinItemField` on the server glues
items with ", ", so "Parts noted: oil filter, brake pads front, air filter"
was three things wearing one label. `splitItems` breaks them back apart —
**guarded, not eager**: it only splits when every resulting piece is under 48
characters and contains no " and ", so a single value that happens to hold a
comma ("Toyota Otis, Manila") stays one item. No bullets, because the label to
the left already says what the list is.

This is still the frontend unpicking a string the API should not have
assembled. The note above about giving `AIExplanationResponse` real fields
stands, and this makes it slightly more urgent rather than less: there are now
two heuristics reading generated prose.

**The car has an outline.** Brand green on the mint ground was a soft edge and
it dissolved into the background. Body, glass, tyres and lamp are stroked in
the brand's dark green, and the glass went white so it reads as glass rather
than as a hole. The stroke across the join where the cabin meets the body is
intentional — the two shapes overlap by two pixels and the line reads as a
beltline.

Verified: page 1440 at a 1920 viewport, layout columns 705/587 with the side
sticky, list items on separate lines with no markers, every car shape carrying
a `#0a5a3c` stroke. As always, the explanation panel's real content is
unverified — it needs a live record.

#### The parts list: right idea, wrong delimiter

The previous entry claimed multi-value facts were split into lines. They were
not, and the reason is a one-word mistake: `splitItems` looked for `", "`
while `joinItemField` and `lineEntriesOfKind` on the server both reduce with
`first + "; " + second`. Semicolons. So "Parts noted: JLLY SYNTHETIC ENGINE
OIL; OIL FILTER; DRAIN PLUG WASHER; BRAKE PASTE; MISCELLANEOUS; HONDA OIL
TREATMENT; HONDA FUEL CLEANER" stayed one paragraph, exactly as reported.

Fixed, and verified against that exact string: seven items, one per line, each
with a small brand-green dot.

**The comma branch is gone entirely, and that is the more useful outcome.**
Testing it turned up a false positive it would always have had:
`"Toyota Otis, Manila"` split into two items. Both halves are short, neither
contains " and ", so every guard passed and the answer was still wrong. A
heuristic that cannot tell a list from a place name has no business guessing,
and nothing on the server produces comma-joined values anyway. Splitting is
now semicolons only, which is unambiguous and needs no guard.

The bullets reverse an earlier decision in `ai-explanation.css`. The argument
against markers — the label to the left already says what the list is — holds
for two short items and stops holding at seven, where a wrapped line needs
something to show where the next item begins.

Verified by extracting `splitItems` and `splitStatements` from the shipped
file and running them: the seven-part string splits correctly, `Toyota Otis,
Manila` stays whole, `PHP 7,850` stays whole, a single item stays whole, and a
two-item semicolon value splits. Mounting the real component in isolation was
attempted and abandoned — two React copies in the same page do not render —
so **the rendered result still needs a real record and your eyes.**

This is the second bug in a heuristic reading generated prose. The case for
giving `AIExplanationResponse` real fields instead of a glued string is now
made twice over.

### The explanation API returns fields now, and the parsing is deleted (2026-08-27)

The frontend was splitting prose the server had just assembled, and it went
wrong twice — first on the delimiter, then on a shop name containing a comma.
Both heuristics are gone. `AIExplanationPanel.jsx` contains zero references to
`splitItems`, `splitStatements` or `LABELLED`.

**Backend.** New `AIExplanationDetail(String label, List<String> values)`, and
`AIExplanationResponse` gains `List<AIExplanationDetail> details`.
`AIExplanationService` builds the groups directly instead of concatenating
them into `whatWasDone`, which is now the opening sentence only — service
summary, date, shop. Parts, materials, work performed and total cost travel as
`details`, each with its values as a list. A single-valued group is a
one-element list rather than a separate shape, so a client renders every group
the same way.

Two helpers changed shape with it: `lineEntriesOfKind` and the former
`joinItemField` (now `itemFieldValues`) return `List<String>` instead of a
"; "-joined string. `buildWhyItMatters` still matches keywords across parts
and labour and does not care how they are separated, so `joinForMatching`
hands it one string and its rule is unchanged.

**Nothing else consumed this.** Checked before changing it: the only backend
reference is `AIController`, the only frontend reference is the panel, and no
test touches it. It is a `features.ai` DTO, not one of the shared ones
`COLLABORATION.md` warns about.

**Verified as far as it goes.** `mvnw compile` clean; the app **started** —
the first attempt failed on "Port 8080 already in use" with the context
already initialised, so 8080 was freed and it booted properly: Hikari
connected, Hibernate validated, Tomcat up, `/health` 200. The frontend build
passes. What has *not* happened is a request through the endpoint with a real
record — the response shape is right by construction and by compilation, not
by observation.

**Settings width, same change.** It was the last page still on its own
measure: not `.ink-page` at all, its own root with a 1024px cap, so it stayed
narrow while everything else grew to 1440. It matches now — same max width,
same clamped padding. The forms inside do not grow with it: `.set-body` is
capped at 660px, because the original reason for keeping this page narrow was
a real worry aimed at the wrong element. A 1440px page is fine; a 900px text
input is not. The section rail gets 300px above 1200px, where its headings
were wrapping to three lines. Measured at 1920: page 1440, padding 64, body
660, rail 300.

### The stored receipt: fixed frame, paging, and a real close button (2026-08-27)

Rewritten from the pre-Ink version, on its own `.rcpt-` sheet. The
`stored-receipt-*` and `image-preview-*` rules in styles.css are left where
they are; nothing references them now.

**The card has one height.** Every page used to be a tile in a grid, each
sized by its own image, so a tall phone photo and a wide flatbed scan produced
two different shapes and the card grew as each image arrived — on a page where
this sits beside a field table, the layout moved while you were reading it.
One page now, in a 3:4 frame that is the same before the image loads, after it
loads, and if it fails.

**`object-fit: contain`, never `cover`.** This image exists so a figure can be
checked against the paper. Cropping to fill the frame is exactly how the total
at the bottom of a long receipt disappears.

**Multiple pages step rather than tile** — chevrons either side of "Page 1 of
3", wrapping at both ends. With two or three pages a disabled arrow is more
fiddling than it saves.

**The full-size view was the worst of it.** A bare overlay whose close control
was the literal lowercase letter "x" in an unstyled element: ambiguous at a
glance and a twelve-pixel target. It is a 40px circular button with a real X
icon now, on a titled bar, with the same paging as the card and:

- **Escape closes, arrows page** — bound only while it is open, so the card
  never swallows arrow keys from the page around it.
- **The backdrop closes, the image does not.** The handler checks
  `event.target === event.currentTarget`; without that, a click that starts on
  the image and drifts a pixel closes the thing you were trying to look at.
- **Focus moves to the close button on open and back to the thumbnail on
  close**, so a keyboard user is never left on a control that has gone.
- On a phone the arrows move from the sides to the bottom, where a thumb is —
  at 360px a 48px control on each edge eats a quarter of the image.

Verified: the frame measures 420x560 at a 420px column, an exact 3:4, with the
16px radius and zoom-in cursor; pager steps are 34px, the overlay sits at
z-index 80 above the shell, the close button is a 40px circle and the nav
arrows 48px. `storedReceiptPages` still handles both shapes — the multi-page
metadata, per-page bucket overrides, the pre-metadata single-path record — and
drops pages with no path. The wrap arithmetic is right at both ends.

**Not verified: the interaction itself.** Escape, the backdrop check and the
focus handoff need a real record with more than one stored page, and mounting
this component in isolation does not work here — two React copies in one page
render nothing. Someone with a two-page receipt should click through it.

Also worth knowing: `MechanicSharedRecordDetailPage` uses this component too,
so the mechanic's read-only view gets the same frame and full-size view. That
is intended — it is the same document doing the same job — but it is a second
screen changed by this edit and nobody has looked at it either.

### The record page on a phone — and the bug I put there (2026-08-27)

**The main cause was mine, from two changes ago.** Widening the explanation
column, I wrote `.record-page .record-layout` — specificity (0,2,0). The
single-column rule it needed to yield to lives inside ink-record.css's
`@media (max-width: 900px)` block and is `.record-layout` at (0,1,0). **A
media query adds no specificity**, so my page-level rule won at every width
and the record page stayed two columns on a 375px screen: a 171px main beside
a 143px side, with the receipt frame squeezed to 134px wide.

It also reported *no overflow*, which is why it survived a check that was
looking for things sticking out of the viewport. Nothing stuck out. It was
just wrong.

Fixed by restating the single-column rule at matching weight rather than
weakening the desktop one. The general lesson, and the reason this is written
down: **anything that overrides a component at page level has to re-answer
every breakpoint that component already had.** There are several such rules in
`brand-app.css` now, and each one is a chance to make this exact mistake.

**Two real mobile problems besides that.**

The breadcrumb has no `flex-wrap`, so on a narrow screen its items do not wrap
— they *shrink*, and the text wraps inside them, turning "Garage / 2019
Mitsubishi Mirage G4 GLS / 24 August 2026" into three ragged columns of broken
words. `flex-wrap: wrap` plus `flex: 0 0 auto` on the items fixes it
everywhere the class is used, which includes the vehicle page and the
mechanic's view. Below 700px on the record page it is hidden outright: it is
wayfinding that costs two lines, and the back button is the same "up" link
while the header summary already names the vehicle and the date.

The two outline buttons stacked into about 110px of chrome above the title.
They are one row now — Back keeps its words because it is the one people reach
for, and Share becomes a 48px icon button with its label in `aria-label`, so
it is still named. Top bar height at 375px: 48px, down from ~110.

Verified at 375px: one column of 335, main and side stacked, receipt frame
297x396 at a true 3:4, top bar one row, no horizontal scroll. And at 1440px
the desktop layout is unchanged — 590/492 columns, sticky side, breadcrumb
visible, share label showing.

### Sign in and create-account on a wide screen (2026-08-27)

Same complaint as the app pages, different cause. These were full-bleed: the
mint panel on the left, the form column centred in whatever was left. Fine at
1440 and wasteful above it — the panel caps at 820px, so at 2200 a 424px form
floated in roughly 1380px of white.

**The fix is what the design board actually drew.** "Trevora Auth v2" is a
1180px card on a ground, not a split filling the viewport; the full-bleed
version came from the Ink shell it replaced, not from the design. Above 1200px
`.ink-auth` becomes that card — capped at 1240, centred, 28px corners, a
hairline, and the wash colour behind it. Below 1200 it stays full-bleed, which
is right on a laptop and the only sensible thing on a phone.

Three details worth keeping:

- **`min-height`, not `height`.** The card is the viewport height less its
  margins, capped at 840 — but a taller form still grows past it and the page
  scrolls, rather than the form scrolling inside a fixed box. Checked at
  1440x700: create-account grows to 836 and nothing is clipped.
- **`:not(.veh-setup)`** excludes signup step 2. It borrows the `ink-auth`
  class for the form control styles and supplies its own page layout, so a
  card frame there would fight it. Confirmed unaffected: no border, no radius,
  its own 720px sheet.
- **The ground uses `:has()`**, scoped so it cannot touch the app or the
  landing page, both of which paint their own background. Where `:has()` is
  unsupported the card's border still defines its edge — the degradation is a
  white ground, not a broken layout.

Measured: 2200 -> 1240 card with 480 either side; 1920 -> 1240; 1280 -> 1178
(the clamped gutter, not the cap); 1100 -> full-bleed, square corners, white
body; 375 -> full-bleed column. `/forgot-password` picks it up too, since it
uses the same shell.

#### Correction: the card had its proportions inverted

The card was right; the split inside it was backwards, and it looked it.

`ink-auth.css` sizes the panel as `flex: 0 0 clamp(540px, 42%, 820px)` and
lets the form side take whatever is left. That is correct **full-bleed** — the
panel must not swallow a 2200px screen. Inside a 1240px card it is exactly
wrong: the panel got 540 and cramped its headline onto three badly-broken
lines, while the form column floated in 700px with 138px of dead space either
side. Compounded by forcing the card to the viewport height, which padded the
whole thing out with vertical air.

The board is `1fr 540px` — panel flexible, form fixed — and it is that now.
The height is content-sized with a 640 floor instead of stretched to fit.

Measured at 1920: card 1240x697, panel 718, form side 520 holding a 416
column with 52px either side, headline on two lines, 98px of vertical slack.
Before: 1240x840, panel 540, form side 700 with 138px either side, headline on
three. Create-account grows to 836 with nothing clipped; at 1280 the card is
1178x697 with the same proportions.

The lesson is the same one as the record page a few entries up, in a different
costume: **a component rule that was right in its original context is not
automatically right in a new one.** Both times the mistake was carrying a rule
across a layout change without re-deriving it.

#### The auth card is reverted — full-bleed, with the surplus in the panel

The two entries above are superseded. The card was the wrong answer: the
request was "too much space on a big screen" and a centred card is a redesign,
not a fix. Sign in and create-account are full-bleed again, no frame, no
rounded corners, no ground colour behind them.

**What actually needed changing is where the surplus goes.** `ink-auth.css`
fixes the panel at `clamp(540px, 42%, 820px)` and gives the form side whatever
is left, so at 2200px a 424px form sat in 1380px with about 480px of nothing
either side. Empty *white* space, which is why it read as broken rather than
as breathing room.

Inverted above 1200px: the form side is fixed and the panel — mint, drifting
glows, decorative by design — absorbs the rest. A wide panel reads as a
background; a wide white gutter reads as a mistake.

**One trap on the way, worth recording.** The first attempt centred the panel
copy with `padding-inline: max(clamp(...), (100% - 760px) / 2)`, the same
trick the landing page uses. It squeezed the headline to 140px. Percentage
padding resolves against the **containing block**, not the element — so
`100%` was `.ink-auth` at 2200, not the 1580px panel, and it computed 720px a
side. `max-width` with `auto` margins on the panel's children measures the
thing it is applied to, and is what is there now.

Measured at 2200: full-bleed 2200 from x=0, no radius; panel 1580 with its
copy in a 760 block centred at 410; headline 524 on two lines; form side 620
holding a 424 column with **98px of white either side, down from ~480**. At
1440: panel 920, form side 520, gutter 48. Below 1200 nothing changed —
1024 gives the original 540 panel — and 375 is still a single column with no
horizontal scroll.

#### Reverted: the auth screens are back to how they were

Both attempts are out. The card is gone and so is the full-bleed rebalance
that replaced it — `trevora-brand.css` has no `min-width: 1200px` block for
the auth screens at all any more, so `ink-auth.css` governs the layout exactly
as it did before this round: panel at `clamp(540px, 42%, 820px)`, form side
taking the remainder, no frame, no ground colour.

Confirmed back to the original numbers — at 2200: root 2200 full-bleed, no
radius, no border, white body, panel 820 with its 68px padding, form side
1380 holding the 424 column. At 1440: panel 605, form side 835.

Everything else from this session's auth work is untouched and stays: the mint
panel, the drifting discs, the pill buttons, the white Google button, the
clickable lockup, the 14px fields.

Worth writing down rather than quietly dropping: **the whitespace the request
started from is still there** — roughly 480px either side of the form at
2200px. Two fixes were tried and neither was wanted, so the honest state is
that this is a known, accepted characteristic of the screen rather than
something that has been solved. If it comes up again, the useful next step is
a picture of what "right" looks like, because two reasonable readings of the
problem both turned out to be the wrong one.

### Dashboard: six changes (2026-08-27)

All six asked for. Taken together they move the Garage from reporting numbers
to explaining them.

**1. "Other" is gone.** It was a fourth bucket labelled as though it were a
kind of spend, when it is the absence of one — an owner could see money in it
and had no way to find out what, except by hovering, and there is nothing to
hover on a phone. It is **"Not categorised"** now, and `spendByCategory`
returns a `count` and up to three `examples` per bucket, so the row says
"2 records · Body & paint, Aircon cleaning" on the page. Every row carries its
count; a footnote says categories are derived from the description and can be
wrong, which they can.

**2. Time range.** 3 months / 12 months / All time on the spending panel, 12
by default. `monthSeries(records, months)` generalises the old
`lastTwelveMonths`, which stays as a named wrapper because most call sites
want exactly twelve. All-time runs from the first record to now, **capped at
five years and floored at twelve months** — past sixty bars the bars are too
narrow to read and the records table is the better tool. Past eighteen the
month axis is dropped for range ends, because the labels stop fitting.

**3. Trend.** The panel leads with the period total, and beneath it the change
against the same span immediately before. `previousPeriodTotal` returns
**null** when there is no complete previous period rather than zero — a first
month of use has nothing behind it, and a zero would report "down 100%" at
every new owner. The arrow gives direction and the words say what it is
measured against; neither claims it is good or bad, because a big service year
can be exactly what a car needed.

**4. Scope.** Both panels carry an "All vehicles" chip. They always did read
every vehicle; with six cards directly above them, nothing said so.

**5. Vehicle browsing.** The paged carousel is gone. It translated a track by
a measured page width, and six vehicles meant three pages of arrow-clicking.
It is a **native scroller** now with scroll-snap, arrows that nudge by one
card, and disabled states read from `scrollLeft` rather than from a page index
we would have to keep in step. That deletes the per-page arithmetic and the
transform offset, and swipe, trackpad, keyboard and scrollbar all come from
the browser instead of from us.

At four vehicles or more a **Cards / List** switch appears, and List is a
compact table — vehicle, records, spend, last service, open. Cards are right
for two; a table is right for eight, and the fleet case had no answer at all.
The choice is remembered per browser (`trevora.garageView`).

**6. Empty states act.** An empty vehicle card showed three zeroes and a flat
chart: an accurate report of nothing, and three pieces of furniture in front
of the only thing there is to do. It now says what to do and offers **Scan a
receipt** and **Type it in** against that vehicle. The page-level empty state
leads with Scan rather than "Upload a receipt". Reading a receipt is the point
of this product and the dashboard should push toward it.

**Verified by running the new functions against fixtures**, not by eye: a
three-month window spans Jun–Aug and totals 3,500; twelve months totals 8,200;
all-time across a 2023 record gives 43 buckets and 17,200; the previous
three-month period picks up the 4,000 in March; a window with records before
it but none inside returns 0 while a brand-new owner returns null; an empty
garage falls back to twelve months. `spendByCategory` files an oil change
under Maintenance, brakes under Tires & brakes, and puts body work and aircon
in Not categorised with both named. Styles resolve and the track scrolls.

**Not verified: any of it with real data.** Every number above came from
fixtures. The list view in particular has never rendered a real vehicle.

#### Dashboard, second pass — five corrections and a reverted idea

**Reverted: the empty vehicle card.** It went back to stats, chart and the two
original actions. The reasoning for changing it still holds on paper — three
zeroes and a flat chart are furniture — but it was not wanted, and a card that
looks unlike every other card in the row costs more than it gained.

**The list was broken, and it was a one-line cause.** `.ink-table tr` is
`display: grid` with `grid-template-columns: var(--table-columns)`, which
`RecordsTable` sets and `VehicleList` did not, so every row collapsed into one
implicit column. It sets its own columns now; the row measures
`495 120 225 140 64` at 1500px.

**"Where it went" was stretching the spending panel.** `.garage-panels` is a
grid, and grid children stretch to the tallest row by default — so adding a
line under one category grew the chart panel beside it and left a gap under a
chart that had not changed. `align-items: start`.

**The category detail moved onto hover.** Inline it cost four lines and was
the thing doing the stretching; as a tooltip it costs none, and it says more —
count, what is in it, and the share of total spend.

Two details there that are not incidental. It uses **`:focus`, not
`:focus-visible`**: `:focus-visible` deliberately does not match a tap, so on
a phone — which has no hover at all — the tooltip would have been unreachable
by any means. And it toggles **`visibility`** as well as opacity, so a
transparent tooltip is not left sitting in the accessibility tree as a hit
target.

**The scrollbar.** The default UA bar is a chunky grey slab directly under the
cards. It is `scrollbar-width: thin` with a `--border` thumb that picks up the
brand tint on hover.

**The page-level horizontal scroll.** Caused by the scroller itself: an
element with 3,000px of content will widen its own container unless it is told
not to, and `padding: 2px; margin: -2px` — which I had added to make room for
a focus ring — is precisely the shape that pushes a full-width child past its
parent. The ring is drawn inset now, and the track carries `min-width: 0` and
`max-width: 100%`. Verified with six cards injected at 1500px:
`documentElement.scrollWidth` equals `clientWidth`, so the page does not
scroll while the track still holds 3,096px of cards.

Worth separating, because it confused the diagnosis: elements *inside* a
horizontal scroller legitimately report `getBoundingClientRect().right` beyond
the viewport. That is not page overflow. The only reliable test is
`scrollWidth > clientWidth` on the document.

#### The page-scroll bug was `tv-reveal`, not the scroller

Worth recording in full, because the obvious suspect was wrong twice and the
real cause will catch the next person.

The vehicle track has `overflow-x: auto` and clips correctly. It was still
giving the whole page a horizontal scrollbar. Two earlier guesses — a negative
margin, then a missing `min-width: 0` — were both plausible, both applied, and
neither fixed it, because neither was the cause.

**The cause is `tv-reveal` on the carousel.** It animates a transform, and a
transformed ancestor contributes its descendants' *pre-clip* overflow bounds
to the scrollable area — so all 3,096px of cards reached the document even
though the track was clipping them visually. Measured directly: removing the
`tv-reveal` class dropped the carousel's own `scrollWidth` from 2,624 to
1,143.

Fixed with `overflow-x: clip` on the carousel. **`clip`, not `hidden`** —
`overflow-x: hidden` forces the other axis to become a scroll container, and
this element must not start clipping vertically.

**Anything else that puts `tv-reveal` on a container holding a horizontal
scroller will need the same line.** That is a real trap: the reveal is meant
to be sprinkled freely on data containers, and this interaction is invisible
until someone notices a scrollbar at the bottom of the window.

Two diagnostic notes that cost time here. `getBoundingClientRect()` reports
*pre-clip* geometry, so cards scrolled out of a horizontal scroller
legitimately report positions beyond the viewport — that is not evidence of
page overflow. The only reliable test is `documentElement.scrollWidth >
clientWidth`. And it cannot be reproduced against an empty garage: this needed
six stubbed vehicles before it appeared at all.

#### The vehicle list, rebuilt

It was five columns of thin text in a wide card, which read as empty — a worse
first section than the cards it offered to replace. It now carries what a card
carries: an initial badge, the name and plate, the **twelve-month activity
strip**, a status badge, spend and last service. Denser than a card, not
emptier.

The strip is the important part: it is the one thing in a row that is a shape
rather than a number, and it is what stops six rows reading as a spreadsheet.
Vehicles with no records say "No activity" rather than drawing an empty chart.

Not a photo in the badge, deliberately: vehicle photos are optional, most rows
would be a placeholder, and a placeholder is worse than a letter.

Verified with six stubbed vehicles at 1500px: six rows at ~105px, grid columns
`402 132 90 201 124 64`, twelve bars per strip at 34px, the sr-only chart
table correctly `position: absolute`, badges reading None / 2 to review / etc,
and no page overflow in either view.

Also fixed while in there: the category tooltip's id was built from the
percentage *and* the name, so two categories sharing a figure — which several
do at 0% — produced duplicate ids and two rows pointing `aria-describedby` at
the same element. It is keyed on the name alone now, which `CATEGORY_ORDER`
guarantees is unique. That one is correct by construction rather than
measured; the page had reset before I could re-read the ids.

#### The list is removed, and the spend chart gained tooltips

**The list view is gone** — component, toggle, stored preference and styles.
It was rebuilt once to carry the activity strip and status badges, and it
still read as thinner than the cards it offered to replace. A second layout
that is worse than the first is not a choice worth offering, and the code for
it was a real amount of surface to keep working.

`readStoredView`, `LIST_VIEW_FROM`, `VIEW_STORAGE_KEY` and the `.garage-list`
rules are all deleted rather than left dormant. `trevora.garageView` may still
exist in a browser or two; nothing reads it.

**The spend chart's bars answer the same question the category rows do.**
Hovering a bar gives the month, the amount and what it was spent on:
"OCT 2025 · 16,610 · 2 records · SRA / FIX, Body & Paint". `monthSeries`
buckets now carry the records that landed in them — references, not copies —
so the chart can say what a bar is made of rather than only how tall it is.

Three decisions there:

- **`interactive` is opt-in.** The dashboard renders one large chart and up to
  six card-sized strips; making every column of every strip focusable would
  put seventy-odd tab stops between the top of the page and the table below
  it. Only the large chart takes it. Verified: the card strips render twelve
  columns and zero tooltips.
- **Empty months are not focusable and have no tooltip.** A month with no
  service has nothing to say, and would be a tab stop that answers nothing.
- **`:focus`, not `:focus-visible`**, and `visibility` alongside opacity —
  same two reasons as the category tooltip: a chart has no hover on a phone,
  and a transparent tooltip is still a hit target.

**On the verification, precisely.** The tooltip content above is from real
data, not fixtures — the stub did not take and the page was showing the actual
garage. Measured: base state hidden, correct content and position, tooltip
above the bar and inside the viewport, `pointer-events: none`, only the two
months with spend focusable, card strips with none. What could **not** be
demonstrated here is `:hover`/`:focus` actually firing — this preview pane
does not own window focus, so `element.matches(':focus')` returns false even
when `document.activeElement` is that element. A probe rule of the same shape
was applied by hand and did reveal the tooltip, and the identical pattern on
the "Where it went" row was demonstrated opening in an earlier run. So the
declaration is proven and the trigger is inferred.

---

## Rate limiting on the paid-API endpoints (2026-08-29)

Audited every call that spends money on a third-party key — Google Vision,
OpenAI extraction, OpenAI transcription/translation, gpt-4o mechanic search.
There was no rate limiting of any kind: no bucket4j, no filter, no per-user
quota, and no Spring Security. Two of the seven findings are now fixed.

**Fixed — the mechanic search endpoint was the worst of it.**
`GET /api/mechanic-access/sessions/{id}/history/search` reaches gpt-4o, our
most expensive model, with a session UUID as its entire credential — no bearer
token. It also sent an uncapped query string into the prompt and set no
`max_tokens`. It now has a `MAX_QUERY_CHARS` cap of 300 (enforced in the
service, not only at the controller, so it holds whoever calls it),
`max_tokens` of 700, and a per-session ceiling of 30 AI searches counted in
`mechanic_access_sessions.ai_search_count` (**migration 017**).

**The budget degrades rather than fails.** Past 30, search falls through to the
keyword path that already runs when OpenAI is unreachable. The mechanic still
gets an answer; we just stop paying for it. `answerSource` already
distinguishes the two and the frontend already renders both, so no UI change
was needed. If someone later decides an exhausted budget should be visible to
the mechanic, that is a deliberate product call, not an oversight here.

**Fixed — a bucket4j filter on the five money endpoints.**
`shared/ratelimit/AiRateLimitFilter` keys mechanic search by session id (it has
no user) and the four `/api/service-drafts` AI routes by owner. Two bandwidths
per bucket: 10/minute against a burst, 100/day against a slow drip. All four
numbers are properties; `TREVORA_AI_RATE_LIMIT_ENABLED=false` turns it off for
a load test.

Two limits of that filter, stated rather than buried:

- **It is in-process.** Two instances means two copies and an effective
  ceiling of twice the configured number. That is acceptable for a cost brake;
  it is why the ceiling that has to hold exactly — the per-session budget — is
  in the database instead. Redis is the change to make when we run more than
  one instance.
- **It verifies the caller's token a second time.** With `SUPABASE_JWT_SECRET`
  set that is an in-process signature check and costs nothing next to the
  multi-second OpenAI call it guards. Without the secret it is a second network
  call to Supabase Auth on those routes — one more reason to set it.

### Still open, from the same audit

- **No HTTP timeouts on any outbound call.** `RestClient.create()` in
  `GoogleVisionOCRProvider`, `MechanicSearchService`,
  `OpenAIServiceDraftExtractionProvider`, and `HttpClient.newHttpClient()` in
  `VoiceTranscriptionService` all default to no read timeout. A slow OpenAI
  pins a Tomcat worker indefinitely; at the 200-thread default that is a DoS on
  the whole API, not just the AI routes. The rate limiter narrows how fast you
  can get there but does not fix it. **This is the next one to do.**
- **Receipt upload loops Vision calls over an uncapped file list.**
  `ServiceRecordController.createReceiptDraft` takes `List<MultipartFile>` and
  `OCRProcessingService` iterates it. One request, arbitrarily many billed
  calls. Cap it around 10.
- **`VoiceTranscriptionService.MAX_AUDIO_BYTES` (25 MB) is dead code.** No
  `spring.servlet.multipart.*` is configured, so Boot's defaults (1 MB per
  file, 10 MB per request) reject first. Worth checking against real phone
  photos on the receipt path too — a 12MP JPEG is routinely 3–5 MB, so the
  1 MB default may be rejecting legitimate uploads today. Set both properties
  deliberately.
- **`VoiceTranslationRequest.transcript` is `@NotBlank` with no `@Size`.** JSON
  body, so the multipart cap does not apply, and unlike the extraction path
  there is no truncation before the text goes to gpt-4o.
- **Retry amplification.** `OpenAIServiceDraftExtractionProvider` retries three
  times with 500 ms backoff, no jitter, and ignores `Retry-After` — so it
  retries into a 429 exactly when the provider is asking us to back off.

CORS is not a control here and was never one: an attacker uses curl, not a
browser.

**Migration 017 is applied to Supabase** (project `bqardmkvbrfpbfmvmbgf`), all
fifteen existing sessions backfilled to `ai_search_count = 0`.

One thing worth knowing while you are in there: Supabase's *tracked* migration
history jumps from `012_motorcycle_sub_types` straight to this one. The schema
is fine — 013 through 016 are all really applied, columns, storage bucket and
all — they were just run by hand rather than through the migration tool, so
the tracker never recorded them. Anyone reading `list_migrations` to work out
what state the database is in will read it wrong. Not urgent; worth a
backfill of the history table when someone has a quiet moment.

### Timeouts and the receipt page cap (2026-08-29, same pass)

Findings 3 and 4 from the audit above are now done.

**Every outbound call has a timeout.** `shared/http/OutboundHttp` builds the
clients; `GoogleVisionOCRProvider`, `MechanicSearchService`,
`OpenAIServiceDraftExtractionProvider` and `VoiceTranscriptionService` all go
through it. Connect is 5s everywhere. Read differs by what is on the other end:
30s for Vision, 60s for a chat completion, 120s for audio transcription, which
uploads the recording before any work starts. They are deliberately generous —
this is a backstop against a hung socket, not a latency target, and cutting off
a call that was about to succeed costs the owner their extraction.

`OutboundHttpTimeoutTest` reproduces the actual failure: a server that accepts
the connection and then says nothing. That is the case that used to hold a
Tomcat worker forever, so it seemed worth reproducing rather than asserting a
setter had been called.

**One number to keep in mind:** the extraction provider retries three times, so
its worst case is now roughly three 60s reads plus backoff — about three
minutes on one thread before it gives up. Bounded, which it was not before, but
not short. If receipt uploads ever feel like they hang, that is the arithmetic
to revisit, either by lowering the read timeout on that path or by dropping to
two attempts.

**Receipts are capped at 10 pages** (`trevora.receipt.max-pages`), enforced in
`OCRProcessingService` before the provider is consulted, so the limit holds
whoever calls it and applies whether or not OCR is configured. Over the cap is
a 400 via the new `ReceiptUploadException` — deliberately not a silent truncation
to the first ten, because a draft that looks complete while missing whatever
was on page eleven is worse than a refusal.

**The frontend does not know about this cap.** `ReceiptUploadPage` lets you add
pages without limit and would now take an upload all the way through Supabase
storage before the API rejects it. Whoever owns that page should stop it at ten
in the picker; it is a worse experience than it needs to be until they do.

Still open from the audit: the unset `spring.servlet.multipart.*` defaults (1 MB
per file may be rejecting legitimate phone photos today — worth checking before
anyone widens the page cap), the missing `@Size` on
`VoiceTranslationRequest.transcript`, and the retry loop ignoring `Retry-After`.

**Multipart limits are now set rather than inherited.** 25 MB per file, 60 MB
per request, spilled to disk rather than buffered in heap.

The per-file number comes from the largest legitimate single file, which is a
voice recording — it matches the 25 MB check `VoiceTranscriptionService`
already makes, and that check was dead code until now because Boot's 1 MB
default rejected long before it ran. The 1 MB default was also almost certainly
rejecting real receipts: `receiptImage.js` downscales photos to roughly a
megabyte, but its `catch` sends the original untouched when the browser cannot
decode the format, which is what happens to HEIC on some browsers. Worth asking
whether anyone hit an unexplained receipt upload failure on an iPhone.

Because that per-file ceiling has to clear audio, it is no limit at all for a
photo, so receipts carry their own: 10 MB per page
(`trevora.receipt.max-page-bytes`). `GoogleVisionOCRProvider` reads a page into
memory and base64-encodes it, so a page costs about 2.3× its own size in heap —
a 25 MB page would be roughly 58 MB, which is not a limit anyone chose either.

`MaxUploadSizeExceededException` now answers 413. The container raises it before
any controller runs, so the feature's own message never gets a chance; without
the handler an upload that is merely too big looked like a server crash.

### The last two audit items (2026-08-29, same pass)

**The extraction retry loop honours `Retry-After`.** A 429 carries the
provider's own answer to "how long?", and retrying on our own 500ms schedule
regardless is how one rate limit becomes three. When the header asks for longer
than ten seconds we give up instead of sleeping: someone is waiting on that
request, and falling back to the raw OCR text now beats holding a thread for two
minutes and very possibly failing anyway. Only the numeric-seconds form is read
— `Retry-After` also permits an HTTP date, which OpenAI does not send, and
guessing at a malformed value is worse than our own backoff.

**Both voice transcripts are bounded, but not the same way, and the difference
is deliberate.** `VoiceTranslationRequest` caps at 8000, matching the ceiling
the extraction path already applies, because nothing truncates it — it goes into
a gpt-4o prompt exactly as it arrives and we pay by the token.
`VoiceServiceDraftRequest` caps at 50000, far above the 8000 it will actually
read, because going over that is *not* an error there: the transcript is
truncated and the draft carries a warning naming what was not read. That is
better than refusing a long recording, so the cap only stops a payload that was
never a transcript. Do not "fix" the inconsistency by lowering the second one.

Nothing from the original audit is now outstanding. What remains is verification
a human has to do: the receipt, voice and mechanic-search paths behind the login.

### Regression pass over the rate-limiting work (2026-08-29)

Checked the whole change against normal flows rather than the error paths it
was written for. Three things were wrong; all three are fixed.

**A CORS preflight was being charged a token.** This is the one that mattered.
Browsers send an OPTIONS before every multipart POST and before any request
carrying an Authorization header, so each upload cost two tokens rather than
one — and a preflight answered with 429 never reaches the page as a rate limit,
it surfaces as a CORS error with nothing explaining it. Reproduced against a
running instance (fourteen preflights, eleventh returned 429), fixed by
skipping OPTIONS, re-verified, and pinned by `AiRateLimitFilterTest` so it
cannot come back quietly.

**`max_tokens` on mechanic search was 700, which is too low.** The model returns
a sentence plus one uuid per matching record and a uuid is around eighteen
tokens, so a vehicle whose whole history matches a broad question can want well
over a thousand. Too low is not a cheaper answer, it is a truncated one: the
json fails to parse and the search drops to keyword matching, which looks like
the AI quietly getting worse rather than a bug. Now 2000.

**The timeout work had swapped the HTTP implementation as a side effect.**
Naming `SimpleClientHttpRequestFactory` to reach its timeout setters replaced
the client `RestClient.create()` would have selected from the classpath — JDK
HttpClient here — with `HttpURLConnection`. Now built through Boot's
`ClientHttpRequestFactories`, which applies the timeouts and leaves the
selection alone.

**Verified unaffected:** every endpoint still routes and still answers 403
rather than 500 without a token; `@Validated` on `MechanicAccessController` did
not break its other endpoints; a normal-length transcript passes validation and
only an over-cap one is rejected. The multipart and per-page limits are both
strictly more permissive than the 1 MB default they replace, so nothing that
uploaded successfully before can fail now.

**Not verified, and this is the residual risk:** no real TLS call to OpenAI or
Google Vision has been made since the request factory changed.
`OutboundHttpTimeoutTest` exercises the new factory over plain HTTP, so it does
execute requests, but TLS to a real provider is unproven. If anything from this
pass is going to break a feature, that is where it will show — so the first
thing to try behind the login is a receipt upload, and the failure to watch for
is every extraction falling back to raw OCR text.

**Two pre-existing warts found while sweeping, neither caused by this work.**
The catch-all `@ExceptionHandler(Exception.class)` swallows Spring MVC's own
status codes: a wrong `Content-Type` answers 500 instead of 415, and a missing
required parameter answers 500 instead of 400. Both reproduced on a running
instance. The new 413 handler fixes one instance of that pattern; the general
case is still there and makes ordinary client mistakes look like server
crashes, which is worth an hour sometime. Separately, body-validation messages
come out prefixed with the field name ("transcript That transcript is too
long..."), which reads oddly in a toast.

**The catch-all now keeps Spring's own status codes.** A wrong `Content-Type`
answers 415, a missing required parameter 400, a wrong method 405 — all three
were 500 before, which told a caller their own mistake was our crash and sent
anyone reading the logs hunting for a fault that was never there. Anything that
does not describe its own status is still a 500, which is what that handler is
actually for. Verified against a running instance, not only in tests.

Worth knowing if you handle errors by status on the frontend: requests that
used to come back 500 for these three reasons now come back 4xx. Nothing that
was already a 4xx or a 2xx changed.


**The golden set can now start from the photograph, not just the OCR text.**
`-Pgolden-image` runs a case end to end — photo, Google Vision, the layout
reconstruction, the extraction prompt — and scores it with the same scorer the
text layer uses, so the two are directly comparable. That comparison is the
point: a case that scores well from `ocr.txt` and badly from its own photo has
an OCR problem, and every prompt change aimed at it is wasted work. Until now
nothing in this project could tell those two apart, which is why "receipts come
out wrong when they are slanted" had never been narrowed past a complaint.

Above the scorecard it prints what Vision returned before any model saw it:
character and line counts across repeat runs of the same image, the number of
column breaks the layout reconstruction found, and the number of **orphan
amounts** — lines holding a price and nothing else. That last one is the skew
metric. A row spanning the page drifts vertically further than the row
tolerance in `GoogleVisionOCRProvider.layoutTextFromPages` allows, the row
splits, and the money column lands on lines of its own; that is what produced
the seventeen unattached amounts on the Toyota invoice. It is a number that
moves when a fix works, rather than a judgement about how a receipt should look.

**No floors are asserted on this layer, deliberately.** The text layer's floors
came from a baseline that held across four separate code states. This layer has
no baseline at all yet — there are no photographs in the set. A floor invented
before the first run is a number someone made up, and it would fire on noise
and get ignored, which is worse than no floor. Whoever runs the first clean set
should record the numbers and add floors in the same commit that says what they
were measured from.

**The photographs are not in the repository and should not be put there.** They
are photographs of real customers' receipts and this repository is going to be
submitted and archived; OCR text can be redacted, a photograph cannot. Cases
name a bare file name in `case.json` and the runner resolves it against
`GOLDEN_IMAGE_DIR`. A case whose file is missing is skipped *and listed*, so a
run that measured nothing says so rather than going quietly green.

**Nothing about the pipeline changed.** This is measurement only — no deskew,
no preprocessing, no prompt edit. `GoogleVisionOCRProvider` still sends the raw
upload to Vision untouched. The next step is the fix, and it now has something
to be judged by; the honest order is to record a baseline from the tilted set
first, because a deskew that helps one photo and hurts three is the same shape
of change as the two prompt "improvements" that went 100% to 36%.


**Documents are no longer all the same thing.** Extraction now classifies what
kind of paper it is reading before it reads any number off it, because they were
being treated as interchangeable and are not. One Toyota Talisay visit produces
a Repair Order totalling ₱5,534.01 and a Service Invoice totalling ₱3,106.49 for
the same work, and the Repair Order says in its own print that it is only an
estimate. Photograph the wrong sheet of that stack and the vehicle's history
gained ₱2,427.52 of work that never happened — stored as fact, shown to a
mechanic, and explained by Module 4 in confident prose. The old prompt opened by
naming "receipts, invoices, job orders, and official receipts" in one breath and
then read all four identically, so nothing anywhere could tell them apart.

`DocumentType` is on the draft, on the record, and in migration `018`.

**The default is load-bearing and points the way it does on purpose.**
`SERVICE_INVOICE` is what you get unless another type is *earned* by evidence
printed on the page, and every other type needs positive proof. This is what
keeps the small shops working: a talyer hands over one untitled sheet that is
the invoice and the receipt at once, with no boilerplate and often no heading,
and it must keep its cost. Defaulting to `ESTIMATE` — or treating a missing
heading as suspicious — would have silently demoted every existing draft, every
voice draft, and every handwritten receipt in the country to "quoted, not paid".
Do not flip this to be safe. It is already the safe direction.

Classify by what a document CONTAINS, not what it is TITLED. A sheet headed
"RECEIPT" that itemises three parts is a final bill; a sheet headed "OFFICIAL
RECEIPT" carrying nothing but amounts is not.

**Two things the classification changes downstream, and one it does not.** An
estimate's total still extracts exactly as printed — blanking it would lose the
only record of what was quoted — but now carries a warning saying it is quoted
rather than paid. An official receipt with no work lines warns that the cost is
reliable and the service details are missing and must not be guessed. What it
does *not* yet do is stop such a draft being confirmed into history as though it
were complete. That is the next decision, and it belongs to Module 2.

**No floor on `documentType` yet, deliberately.** It is scored and printed, but
all three golden cases are `SERVICE_INVOICE`, so the number currently measures
only that the classifier does not over-fire. A floor set from that would be a
floor on half the behaviour. The set needs a case that *should* come back
`ESTIMATE` — the Talisay repair order photos exist and are the obvious source.

**Migration numbering: `CLAUDE.md` is wrong about this.** It says `012` is the
highest. The directory actually runs to `017`, and there are already two
different `017_` files — the exact collision that warning exists to prevent,
already happened. This work claims `018`. Whoever reads that line in `CLAUDE.md`
next should check the directory rather than trusting it, and someone should fix
the duplicate `017`.

**Not verified:** the app has not been started against a database with `018`
applied. The entities now map a `document_type` column that does not exist until
someone runs that migration, so the first thing to try is a boot, not a receipt
upload — and a boot failure here would be bean-level, not subtle.


**Migration `018` is APPLIED to the shared Supabase database (2026-09-01).** Not
just written - applied, and recorded in Supabase's own migration tracking as
`018_service_document_type`. Anyone pulling this branch does not need to run it,
and anyone who does run it again gets a no-op: every statement is
`if not exists` or `drop constraint if exists` first.

State after applying: `document_type text not null default 'SERVICE_INVOICE'` on
both `service_drafts` and `service_records`, with a check constraint carrying all
seven types. All 39 existing drafts and 16 existing records took the default,
which is the intended outcome - nothing distinguished those documents when they
were stored, so calling them final bills preserves exactly the behaviour they
already had rather than inventing a distinction after the fact.

**The app boots against it.** Verified by actually starting it, not by inferring
from a green test run: `Started TrevoraApiApplication in 6.568 seconds`, Tomcat
on 8080. That matters more than usual here because `ddl-auto=validate` means
Hibernate checks every entity mapping against the live schema at startup, so a
successful boot is direct proof that the new columns exist and match the
`ServiceDraft` and `ServiceRecord` mappings. A missing column would have failed
the context, and the whole test suite would still have passed.

**A caution worth carrying, learned the hard way in this pass.** `./mvnw test`
reported 203 passing against a file that did not compile: the compiler plugin
said "Nothing to compile - all classes are up to date" and surefire ran the
previous build's classes. The broken code only surfaced when the golden profile
forced a real compile. If a green run immediately follows an edit, run
`./mvnw clean test` before believing it.


**A cost-only record can now be confirmed, and Module 4 refuses to explain it.**

Confirmation used to require at least one service, always. That was right for
every document the pipeline had seen and wrong for the one owners are most
likely to keep. An official receipt carries a total, a date and a PAID stamp and
not one word about what was done to the car, so blocking on it asked the owner
to supply something the paper never had - on what will probably be the single
most common upload, because people keep the receipt and throw the invoice away.

Now an empty services list on a cost-only document is a WARNING rather than a
blocking error, category `COST_ONLY_DOCUMENT`, still flagged for review. The
message asks the owner to add the services if they know them and says outright
that they must not be guessed. Nothing else loosened: an empty SERVICE_INVOICE
or ESTIMATE still blocks, because those describe work by definition and an empty
one is a failed extraction rather than a document with nothing to say.

**Module 4 returns a `cost_only` explanation instead of generating one.** This
matters more than it looks. Both explanation paths would otherwise have answered
happily - the model, handed a Toyota letterhead and 3,106.49, writes a confident
paragraph about routine maintenance, and the template needs no model at all
because it defaults its service summary to the words "service work" and produces
the same shape of sentence. Neither was told anything about the work, because
nothing on the paper said anything about the work. An owner reading a fluent
paragraph cannot tell that apart from a real explanation, which is what makes
this the dangerous failure rather than merely an unhelpful one.

The `cost_only` response says the document shows the payment but not the work,
offers no watch-for advice and no details - both would have to be invented from
the same nothing - and suggests adding the invoice. It is deliberately NOT
marked `fallback`, because nothing failed: it is the correct and complete answer,
and flagging it as degraded would invite someone to "fix" it by generating text.

The guard keys on the items being empty AND the document type not carrying work,
not on the document type alone. The honest condition is "no work recorded",
whatever the paper was: an owner who typed the services in by hand after
uploading a receipt gets a normal explanation.

**This touches two other people's areas** - `features.validation` (Module 2) and
`features.ai` (Module 4). The validation change adds a category the review screen
has not seen (`COST_ONLY_DOCUMENT`, severity WARNING); check it renders as a
warning rather than falling through to an error style. The AI change adds a
response `source` value of `cost_only` alongside `template`, `template_fallback`
and `openai:*`; any frontend switching on source needs a branch for it.

Verified by booting the app, not only by the suite: 214 tests pass from a clean
build, and `Started TrevoraApiApplication in 5.793 seconds` against the database
with `018` applied.


**Two attempts at the empty picking slip, both reverted. Do not retry either.**

`talisay-picking-slip` classifies correctly as `PARTS_SLIP` and then returns no
line entries at all, on every run, with zero spread. The document is not the
problem: the OCR text holds all five parts cleanly in rows, part numbers,
descriptions and quantities included, and the model reads them well enough to
classify `relatedComponents` from them. It then returns nothing.

Attempt one, a prompt rule saying never return an empty `services` array when
the document itemises anything. It did not move the picking slip and it took
`talisay-repair-order` line kinds from 67% to 31% and `talisay-work-performed`
from 80% to 40%, both with large spreads. Reverted; the repair order returned
to exactly 67% with no spread, which is what confirmed the change was the cause
rather than run-to-run noise.

Attempt two, a top-level `unassignedLineEntries` array in the response schema
plus a parser that wrapped those lines in a carrier service. The reasoning was
that line entries live inside a service, so a document with no service has
nowhere to put its lines - and a picking slip genuinely has no service on it, so
arguing with the model in the prompt was the wrong move. It cost
`talisay-work-performed` everything it had gained, 67% to 0%, and took the
service invoice from 67% to 33% by making it return the JOB DONE prose
operations and the priced parts as separate lines, double-describing one visit.
Reverted, tests included.

**The reason attempt two failed is the finding worth keeping.**
`unassignedLineEntries` came back EMPTY. The model was not failing to find a
home for the parts - it was declining to extract them at all. So the nesting was
never the constraint, and no amount of schema work addresses it. That was only
visible because `-Dgolden.dump=true` was added to the image runner after attempt
one; two prompt changes had been made before that reasoning from scores alone,
and the scores could not distinguish "no home for the lines" from "no lines".
Dump the model output before forming a hypothesis about it.

**A pattern across three attempts, offered as a hypothesis rather than a fact.**
Every addition to the extraction prompt in this area destabilised cases it did
not mention. The prompt is long, and the two changes that worked were a deletion
(removing "priced" from the completeness rule) and a timeout. The two that
failed were additions. If the picking slip is worth fixing, a separate short
prompt for non-bill documents is likelier to work than a fourth paragraph in
this one, and it would not put the priced-receipt path at risk every time
someone touches it.

Weigh that against the payoff before anyone spends more on it: it is one
document type out of seven, and each attempt cost a working case.

**What was kept, and the evidence for each.** Row pairing in
`GoogleVisionOCRProvider` - the Toyota repair order read 592.93 as its grand
total and now reads 5,534.01, verified by reading the OCR text rather than by
trusting the score. The completeness rule no longer requiring a price - job
cards went from 0% to 80% line kinds. `EXTRACTION_READ_TIMEOUT` at 120s, split
from the shared `OPENAI_READ_TIMEOUT` so mechanic search and the explanation
feature keep their 60s - the service invoice failed 3 of 3 extractions at 60s
once the prompt grew, and 0 of 3 after.

**Line extraction is now the weakest part of the pipeline** and the honest place
to look next. Visit-level fields are solid: `documentType` 100%, `totalCost`
100%, `serviceDate` 100%. Line kinds sit at 60-67% on the documents that work
and `reconciles` is 0% almost everywhere. One concrete lead: the flat repair
order reads `TGFS SN/CF 5W-30 1L` with a total of 878.13 when the printed amount
is 2,922.32, and drops the BACTAKLENZ line entirely, while the same document
photographed at an angle gets both right. That is geometry, not prompt.

**Nothing here is gated yet.** All six Talisay cases are advisory and the
numbers still move: `talisay-work-performed` has scored 0%, 40%, 67% and 80% on
line kinds across four runs of three. Do a five-run pass before setting any
floor from these.


**A multi-image upload is now read as several documents, not one long receipt.**

Every image in an upload used to be concatenated into a single block of OCR text
and extracted once. That is correct for pages of one receipt and wrong the moment
the images are different documents, which is what a dealership hands over. The
Talisay visit produces five sheets; photographing them put the repair order's
`GRAND TOTAL 5,534.01` and the service invoice's `TOTAL PRICE 3,106.49` into the
same text with nothing to say which belonged to which, and the model picked one.
It is the same bug the document-type work fixed for a single sheet, one level up.

Uploads of a single image - almost everything a small shop hands over - are
untouched, take the same single extraction call, and carry no new risk. Only
uploads of several images take the new path.

**Precedence is per field and lives in `ReceiptDocumentMerger`.** Cost comes from
the invoice, or the receipt when no invoice was photographed, and never from an
estimate while either exists. Work comes from the invoice, then a job card, then
the estimate, then a parts slip - an official receipt is fully authoritative
about money and describes no work at all, which is precisely why no document may
win outright. The odometer is taken from the value the documents agree on: a
repair order prints the mileage, the warranty expiry kilometres and the next
service interval, all odometer-shaped, and agreement across sheets is the
cheapest evidence available that the right one was read.

**Two rules stop the merge doing damage.** Pages sharing a printed document
number are one document and their lines are joined, so a three-page invoice keeps
all of them. Different documents never have their lines concatenated - the
estimate and the invoice list the same oil change, and adding both would bill it
twice and make reconciliation impossible for good. Documents with no printed
number are never assumed to be the same document, because two untitled sheets
from a talyer might be one receipt or two unrelated ones and joining them on a
guess is the failure this exists to prevent.

**Nothing is dropped silently.** The merged draft carries warnings naming how
many documents were found, which one the cost came from, which one the work came
from, and - when an estimate was set aside - what it had quoted and why that
figure was not used.

**A test caught a real bug in the first version.** The cost ranking held only
invoice and receipt, so an estimate-only upload lost its total entirely: one
photograph of a repair order kept its quote and two photographs lost it, with the
number of images silently deciding whether a cost survived. There is now a
fallback to any document that printed a total, and a test named for it.

**Cost and latency, stated plainly.** A five-image upload now costs five
extractions instead of one, run sequentially, each with up to 120 seconds and
three attempts. There is no way to tell which sheet a number came off without
asking about each sheet separately, so the extra calls are the price of the
correctness rather than an implementation detail worth optimising away. If the
wait becomes a problem the obvious move is to run the per-document extractions in
parallel; nothing about the merge depends on their order.

**The golden set can now hold a case made of several photographs.** `case.json`
takes `imageFiles` as an array, the singular `imageFile` still works, and a case
is skipped unless every one of its images is present - a five-document case
scored from three sheets is a different case, not a weaker one, and it would
report a merge that never had the documents it was meant to choose between.

`talisay-visit` is that case: the whole visit as one upload, two totals in the
same set of images and only one right answer. It is the only case in the set that
measures merging at all; every other case is one document and says nothing about
which sheet wins.

**The image runner now drives the real `OCRProcessingService`** rather than
calling the OCR provider and the extraction provider itself. Per-document
extraction and merging happen inside that class, so a runner that reimplemented
the loop would have measured the copy. The scored answer is now what production
would actually store, related components included - those are read back out of
the result metadata instead of being recomputed a second, differently-derived
way.

**Still unmeasured at the time of writing.** `talisay-visit` was created in the
same session as the merge and has not yet been through a three-run pass, so no
claim should be made about how well merging works on real photographs until it
has. The merger's own unit tests use constructed inputs and prove the rules, not
the pipeline.

**Deduplication is not tested and probably not finished.** A real owner
photographs the same official receipt three times, which is what the source
images for this set actually contain. Documents sharing a type and number are
joined, so duplicates should collapse - but no case exercises it, and the
concatenation in `joinPages` would duplicate line entries if two photographs of
the same sheet both extracted them. Worth a case before anyone relies on it.


**The odometer is now picked in code, and the prompt was the wrong place for it.**

A service document prints several numbers shaped like an odometer. A Toyota
repair order prints three: `Kilometers KM 242` in the vehicle block, which is
the reading; `Warr Exp KM 100,000`, which is when the warranty ends; and
`MILEAGE 3 KM` in the history block, which is what the odometer said at a
*previous* visit. Extraction had been returning 3.

`OdometerResolver` takes the reading in two steps. Limit labels - warranty,
next service, expiry, interval - are struck out of the line, and then what
remains is searched for a genuine reading label. Striking out rather than
vetoing matters: `Warr Exp KM` and `Next Svc Km` both end in a distance word, so
a plain veto threw away the correct reading whenever a form printed both labels
side by side, which is exactly what a Mercedes repair order does with
`Km Reading 21,055` and `Next Svc Km 31,055`.

Then, among the survivors, the largest wins. That is what separates
`MILEAGE 3 KM` from `Kilometers KM 242`: both are honestly labelled mileage and
no vocabulary can tell them apart, but odometers only increase, so the current
reading is the largest of the genuine ones and a history entry is necessarily
smaller. It follows from what an odometer is rather than from what one receipt
happens to look like.

Result: odometer went from 43% to 100% across all seven image cases, including
the five-document merged case. It never invents a reading - with no labelled
candidate it returns whatever the model extracted - and it says so in a warning
when it overrides.

**The reason this is code is worth recording, because three attempts say the
same thing.** The identical rules were tried first as a prompt instruction. They
moved the odometer score by nothing and collapsed extraction on the longest
document in the set. Counting the earlier attempts at the empty picking slip,
every addition to the extraction prompt in this area has regressed cases it did
not mention, while the changes that worked were a deletion, a timeout, and code.
Mechanical rules do not need a language model, and in code they can be tested
against committed OCR text with no API calls and no run-to-run noise. Ten such
tests exist and they caught four defects before anything shipped: document
numbers offering digits (`G7NA058266` yields 058266), dates offering digits
(`03/31/2025` yields 2025), the veto bug above, and the fact that the committed
`ocr.txt` files were stale.

**The committed OCR text was refreshed and had been misleading.** Every
`ocr.txt` in the Talisay cases was captured before the row-pairing fix, when 242
was still mispaired onto the `Warr Exp KM` line. Anything reasoned from those
files between the geometry fix and this refresh was reasoning about a bug that
no longer existed. They now match what the pipeline actually produces, and the
redaction sweep was re-run over them.

**A blind spot in the image runner, now closed.** When extraction fails,
`OCRProcessingService` catches it, falls back to the raw OCR text and returns a
well-formed draft full of nulls. The golden report scored that as ordinary
zeros, so a total collapse on the longest case was indistinguishable from a
document nothing could be read off - and those want completely different fixes.
Both signals were already in the metadata, `fallbackUsed` and
`extractionErrors`; the report simply never read them. It does now, and a
fallback is recorded as a failure with its reason attached. Several runs were
misread as clean before this.

**`talisay-service-invoice` fails intermittently and is NOT diagnosed.** It
returned nothing on two separate runs and then succeeded three times in a row
under the new visibility, so there was nothing to read. The earlier claim in
these notes that raising the extraction timeout to 120s fixed it is too strong:
it plainly reduced the rate - the case had been failing 3 of 3 - but it did not
eliminate it. The next occurrence will name its own reason rather than looking
like zeros, which is the only reason to stop chasing it now.

**Where the pipeline stands.** Visit-level fields are solved: `documentType`,
`odometer` and `totalCost` are all at 100% across seven image cases, three runs,
with `serviceDate` at 86%. Line-level extraction is the entire remaining
problem: `lineKinds` 45%, `linePrices` 42% with spreads up to 21%, and
`reconciles` at 0% on every case. Reconciliation matters most of the three,
because it is the only check that can catch a wrong number without a human
looking, and while it is always red it carries no information at all.

**`relatedComponents` at 13% may be a measurement error rather than a defect.**
The model returns things like `Engine Oil` and `Oil Filter` against an expected
`Engine`. Nobody has checked those expected values against the vocabulary in
`ServiceClassificationService`, so the ground truth may simply be wrong. Check
that before treating the number as a problem to solve; it may delete itself.


**`PARTS_PURCHASE` added, and migration `019` is APPLIED to the shared database.**

A parts shop hands over a cash sales invoice for one battery: an article, a
price, a total, and no labour anywhere on the page. Before this type existed the
classifier called it `OFFICIAL_RECEIPT` - which followed the rules exactly, since
money with no work is precisely that - and discarded the battery line with it.
`SERVICE_INVOICE` would have been worse in the other direction: it tells the next
mechanic a shop fitted the battery, which nobody knows.

The discriminator is on the page rather than in the title: every line is a part
or a material and there is no operation. A small shop's sales order billing parts
AND labour together is an ordinary final bill despite the similar heading - the
JFTRUCK case proves that distinction holds, classifying as `SERVICE_INVOICE` on
the first run.

Both flags are true. Cost-authoritative because real money changed hands, and
carries-work because the goods are content worth recording - which means an empty
parts purchase blocks confirmation as a failed read rather than being waved
through the way a cost-only receipt is. The claim it must never make, that the
part was installed, lives in the wording shown to the owner rather than in a
flag.

`019` is separate from `018` because `018` was already applied. Editing an
applied migration leaves every environment disagreeing about what it contained.
Verified after applying: both tables carry eight values, and the app boots.

**Classification worked; the line still vanished, and the cause is now known.**
The battery receipt classifies as `PARTS_PURCHASE` at 100% and returns no line
entries at all, so `MOTOLITE NF4L-B 750.00` is still lost. Three documents now
show the pattern and the third one explains it:

| document | contents | services returned |
|---|---|---|
| job card | operations, no prices | yes |
| picking slip | parts only, no prices | none |
| battery receipt | one part, priced | none |
| invoices, talyer receipts | parts and operations | yes |

It is not about prices - the job card has none and works. It is about
**operations**. The model treats "services" as requiring a service performed,
which is linguistically correct, and a document listing only goods has none.
Since `lineEntries` are nested inside `services`, goods-only documents lose
everything.

That also explains why the earlier `unassignedLineEntries` attempt failed. It
offered the lines a new home while still asking the model to recognise them as
belonging somewhere; the model's actual position is that a parts document
contains no service, and it was right both times.

**The fix is the schema shape, not the prompt.** Either stop nesting line entries
inside services, or give goods-only documents a first-class place to put them.
That is a larger change than anything attempted here, it touches the response
contract, and three prompt attempts in this area have already been reverted. It
was left characterised rather than half-fixed.

**A reproducible date error worth fixing in code.** The battery receipt is dated
`10.01.25` by hand and extraction reads it as 10 January 2025. The owner has
confirmed it is 1 October 2025 - Philippine month-day-year. This is now a known
wrong answer rather than an open question, and it is the same shape of problem as
the odometer: mechanical, decidable from the document, and a candidate for the
`OdometerResolver` treatment rather than another prompt paragraph.


**The intermittent extraction failure is a generation spiral, not a timeout and
not a cap that was too small.**

`talisay-service-invoice` fell back to raw OCR on run after run, reported only as
"a response that could not be read". Two visibility fixes turned that into an
answer. The golden image runner now reads `fallbackUsed` and `extractionErrors`
out of the result metadata, because a failed extraction returns a well-formed
draft full of nulls and had been scoring as ordinary zeros. And the retry loop
now carries its cause into the message instead of dropping it - the specific
explanation had been sitting one exception down all along, printed by nothing.

The first real run said `completion 8000, cap 8000`: the model spent its entire
output budget and stopped mid-JSON, so the body was valid JSON's opening half.

`MAX_COMPLETION_TOKENS` was raised 8000 to 12000. That took the case from three
runs in three failing to two in three - better, and not a fix. The raised cap
fills too: `completion 12000, cap 12000`.

**The successful run is what identifies the cause.** It answered with six line
entries and every visit-level field correct. An invoice of that size expresses
in one or two thousand tokens, so filling twelve thousand means thousands of
duplicated array entries. The cap was never the problem; the model spirals on
this particular document. Raising the ceiling again buys more expensive failures
and no understanding, so it was left at 12000 rather than tuned further.

Worth knowing for anyone editing the extraction prompt: input is now around
6,500 tokens on a long receipt. Every addition to that prompt makes this spiral
likelier, which is plausibly part of why three separate prompt additions during
this work each broke the longest case in the set.

**Next step, if someone picks this up:** log a bounded, redacted snippet of the
spiralling completion and look at what it repeats. That was deliberately not
added - response bodies carry customer names, addresses and plate numbers, and
application logs are not a place to put those - but there is now a concrete
question that only the body can answer, which is a better reason than "so we can
see it".

## Explanations are cached; the template deliberately is not (021)

Every open of a record page was a fresh chat completion. Records do not change
after confirmation, so the second call bought a differently-worded answer to the
same question at the same price, on a key four people share. Migration `021`
adds `service_record_explanations`, one row per record.

**Only model-written text is stored.** The template, the cost-only answer and
the failure fallback are computed from the record, cost nothing, and are not
cached on purpose: storing one would freeze a stand-in in place, so a record
explained by the template on a day the API key was missing would read that way
forever. If someone later "completes" the cache by storing those too, that is
the bug they will have written.

Invalidation is a SHA-256 of the prompt itself rather than of a list of fields,
so it cannot drift from what the model actually saw — change how the facts are
assembled and every fingerprint changes with it. A corrected record regenerates
on the next view and nothing has to remember to clear a row.

The cache is read *before* the provider is asked whether it is available: an
explanation written last week is still the best thing to show an owner on a day
when a fresh call would fall to the template.

Not done, and not obviously worth doing: nothing ever deletes a row except the
record's own `on delete cascade`. A regenerated explanation overwrites in place,
so the table cannot outgrow the record count.

---

## Service category vocabulary — unified 2026-09-05, two pieces left

`service_category` had four disagreeing definitions: the constant, two copies
hardcoded inside the extraction prompts, and a keyword table inside
`ServiceItemResponse`. The prompts now interpolate
`ServiceClassificationService.CLASSIFIABLE_SERVICE_CATEGORIES`, and
`ServiceCategoryVocabularyTest` fails if a copy drifts from the constant again.

`UNCATEGORIZED` was added, distinct from `Other`. `Other` means an owner looked
and chose none of the above; `UNCATEGORIZED` means nothing has decided yet. One
is a finished answer, the other an open question, and only the open one is worth
putting in front of someone.

Three things deliberately left:

- **Per-item AI classification.** The model returns one `classification` object
  per receipt, so `OCRProcessingService.classifyItems` fans a single visit-level
  answer across every item and only the keyword text differentiates them. Real
  per-item categories mean changing the extraction schema and prompt, which puts
  it under the golden-set rule on a set where `lineKinds` scores ~53%. Out of
  scope for the unification; worth doing on its own evidence.

- **`Other` is currently unreachable.** No request DTO carries a category — not
  `ServiceItemRequest`, not the correction path — so nothing lets an owner
  choose one. `Other` is now a value only a human may set, and no human can.
  Either add a category picker to the review screen or accept that `Other`
  exists only on rows written before this change. Note those rows were
  machine-set by the old classifier and are indistinguishable from a deliberate
  choice; there is one such record in the database today.

- **The voice prompt still hardcodes the *component* list** (`Engine, Engine
  Oil, Oil Filter, ...`), the same class of duplication that this work removed
  for categories, against `ALLOWED_RELATED_COMPONENTS`. It was left alone
  because touching it is a prompt change and would have needed its own
  golden-set run. Same fix, same test, when someone is next in that file.

### Not fixed, found while unifying categories (2026-09-05)

- **No upper bound on cost input.** A record carrying PHP 123,123,122.98 sat in
  the database and was 99.7% of all recorded spend; the "Where it went" chart
  drew it without complaint, so every other category rendered as a sliver.
  `DraftPlausibilityService` bounds the odometer and the service date and says
  nothing about money. The row is deleted; the hole that let it in is not.

- **No test that a chart survives a nine-figure value.** Related and separate:
  even with an input bound, one legitimate large record should not flatten the
  rest, and nothing asserts that today.

- **`field_metadata.source` has drifted from its own vocabulary.**
  `ServiceClassificationService.normalizeSource` accepts AI, KEYWORD_FALLBACK,
  MANUAL and MIXED, but two rows written by the manual-entry path hold
  `owner_entered`, which is none of them. It reads as MANUAL to a human and as
  unrecognised to the code. Same class of bug as the category vocabulary this
  work unified — one value, two spellings, nothing comparing them.

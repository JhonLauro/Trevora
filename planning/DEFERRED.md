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

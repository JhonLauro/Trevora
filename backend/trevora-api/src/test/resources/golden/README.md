# The golden set

Real receipts with hand-checked correct answers, and a scorer that says how
close extraction gets. Nothing else in this project can tell you whether a
prompt change helped.

## Why it exists

Before this, the only extraction tests fed hand-written JSON to the parser.
They prove the parser reads JSON. They cannot tell you whether the model read
the receipt. Every prompt change was therefore unfalsifiable — which is the
reason migration `011` added line kinds to the schema, the backfill and the
frontend, and never reached the extraction prompt. Nothing would have shown it
missing.

## Two layers

The pipeline splits at OCR, and so does the set.

| Layer | Input → output | Needs |
|---|---|---|
| **text** | OCR text → extracted JSON | `ocr.txt`, no image |
| **image** | photo → OCR text | a real photo, real capture artefacts |

Most findings live in the text layer, so most cases need no image at all — a
`.txt` file and the correct answer beside it. Only layout and capture quality
need the image layer.

Both layers score the same fields with the same scorer, so they are directly
comparable, and the comparison is the point: a case that scores well from
`ocr.txt` and badly from its photograph has an OCR problem, not a prompt
problem, and no prompt change will fix it.

## A case

One directory per receipt under `golden/`:

```
golden/<case-id>/
  ocr.txt        the OCR output, verbatim except for redaction
  case.json      what this case is, what vehicle it belongs to, what it tests
  expected.json  the correct answer, read off the original receipt
```

An image-layer case adds two fields to `case.json` and no extra files:

```json
{
  "layer": "image",
  "imageFile": "tilted-20deg.jpg"
}
```

`imageFile` is a bare file name, not a path. The folder moves between machines;
the file name does not.

`expected.json` is **ground truth, not what is currently achievable.** If the
OCR text is too mangled for anyone to recover a value, the correct answer is
still the correct answer and the case should score zero on it. A set that only
records reachable answers cannot tell you what you are losing.

Where a value genuinely has not been checked against the original yet, set it
to `null` and add the field name to `pendingGroundTruth` in `case.json`. The
scorer skips those fields and reports them separately, so a half-finished case
is usable instead of misleading.

## Redaction is not optional

Real receipts carry customer names, home addresses, mobile numbers, plate
numbers, VINs and TINs. This directory is in version control and this project
is going to be submitted and archived.

Rules:

- **Redact people.** Customer names, service advisor names, signatures,
  personal addresses, mobile numbers, customer account numbers, plate numbers,
  VIN, chassis and engine numbers.
- **Keep businesses.** Shop name, shop address, shop phone, shop TIN. These are
  public business details, and the shop TIN earns its place — it is exactly the
  long number the prompt must *not* mistake for a total.
- **Preserve the shape.** Replace with something of similar length and
  character class, so line breaks and column drift stay realistic.
  `+639081916902` becomes `+639000000000`, not `[REDACTED]`.
- **Never commit the photo.** Images stay in Supabase storage. Reference them
  by `sourceImage` in `case.json`.

Redaction changes the input, so note it in `case.json` under `redacted`.

## Running it

The golden tests hit the real OpenAI API, cost money, and are slow. They are
tagged `golden` and excluded from the normal run.

```
./mvnw test                          # unit tests only, no API calls
./mvnw test -Pgolden                 # the golden set, needs OPENAI_API_KEY
./mvnw test -Pgolden -Dgolden.runs=5 # more repeats per case
```

Without `OPENAI_API_KEY` the golden tests skip rather than fail.

## Running the image layer

The image layer starts at the photograph and runs the real pipeline: Google
Vision, the layout reconstruction, the extraction prompt, the keyword fallback.

```
GOLDEN_IMAGE_DIR=/path/to/receipt-photos ./mvnw test -Pgolden-image
./mvnw test -Pgolden-image -Dgolden.imageDir=C:/receipts -Dgolden.runs=5
```

It needs `GOOGLE_CLOUD_VISION_API_KEY` as well as `OPENAI_API_KEY`, and skips
without either. Each repeat costs a Vision call on top of the OpenAI one, which
is why it is a separate profile rather than part of `-Pgolden`.

**The photographs are not in this repository and never will be.** They are
photographs of real customers' receipts, and this repository is going to be
submitted and archived. OCR text can be redacted; a photograph cannot. So they
live in a folder outside the checkout, named by `GOLDEN_IMAGE_DIR`. A case whose
file is not there is skipped and listed by name, so a run that measured nothing
says so instead of going quietly green.

Every run's OCR text is written to `target/golden-ocr/<case>-run<N>.txt`. Read
it. The score says a field is wrong; only the text says whether the value was
ever there to read.

### What the OCR table means

Above the usual scorecard, the image layer prints what Vision returned before
any model saw it:

| Row | Reads as |
|---|---|
| `chars`, `lines` | a range means two runs of the same image disagreed |
| `column breaks` | pipes the layout reconstruction emitted; **zero on a tabular receipt means it found no table** |
| `orphan amounts` | lines holding a price and nothing else — prices that came unstuck from their descriptions |
| `across runs` | identical text every run, or how many different texts came back |

`orphan amounts` is the skew number. A row spanning the page drifts vertically
further than the row tolerance allows, the row splits, and the far column — the
money — lands on a line of its own. That is what produced seventeen unattached
amounts on the Toyota invoice. It should fall as skew handling improves, and it
falls without anyone having to agree on what a receipt "should" look like.

**No floors are asserted on this layer.** The text layer's floors came from a
baseline that held across four code states; this one has no baseline yet, and a
floor invented before the first run is a number someone made up. Take one from
the first clean run and add it in the same commit that says what it came from.

## Repeat runs

Every case runs **three times by default** and the report gives the median
score and the spread.

The first baseline came back with **zero spread on every field**, which is a
useful result rather than a wasted run: given identical text, this model at
`temperature: 0` is stable, so text-layer scores can be trusted from few runs.

The instability is one layer down. Two production extractions of the same
Toyota image returned totals of ₱12,046.04 and ₱12,446.04, and the cause was
not the model — Google Vision returned 3,502 characters on one run and 3,511 on
the other **for the same image**. Different text, different answer. That is why
the image layer needs repeats even though the text layer may not.

The spread stays in the report either way. A change that narrows it is a real
win even when the median does not move.

## Scoring

| Field | Rule |
|---|---|
| `serviceDate` | exact |
| `odometer` | exact |
| `totalCost` | numeric, compared by value not scale (`12046.0` = `12046.00`) |
| `shopName` | normalised similarity ≥ 0.85 — OCR turns `Auto` into `Auio` |
| `location` | normalised similarity ≥ 0.70 |
| `relatedComponents` | set F1 |
| `lineKinds` | lines matched by description, then F1 over `(description, kind)` |
| `linePrices` | of the matched lines, the share whose `lineTotal` is right |
| `reconciles` | do the extracted line totals sum to the extracted total cost |

`lineKinds` is the number that matters most. It was **0%** when this set was
built — the prompt never asked for line entries, so migration `011` was
unreachable from OCR — and reaching 100% on `gta-toledo-cooling` took three
measured iterations. The middle one was a regression the set caught: an
anti-hallucination rule that also made the model drop real part lines, taking
`lineKinds` from 100% to 36%. Without the set that would have shipped looking
like an improvement.

## Synthetic cases

One case, `scooter-cvt-service`, is written by hand rather than captured. It
exists because no real motorcycle receipt was available and a vehicle class
with zero coverage was worse than one covered by a clean example — motorcycles
were the class the pipeline was demonstrably worst at, and nothing was watching
it.

Mark such a case with `"synthetic": true`. Treat its scores as an **upper
bound**: written text has no character errors, no dropped glyphs and no column
drift, so it proves the vocabulary and the vehicle context work and proves
nothing about whether they survive bad OCR. Replace it with a real receipt when
one can be photographed.

Never let the whole set be synthetic. Text you wrote yourself is text the model
finds easy.

## Adding a case

1. Get the OCR text. From a new photo, or out of an existing draft:
   `select field_metadata->>'rawOcrText' from service_drafts where draft_id = '…'`
2. Redact it. Note what you changed.
3. Write `case.json` — vehicle context matters, because a receipt only means
   something against a vehicle.
4. Write `expected.json` **from the original receipt**, not from the OCR text.
5. Run `./mvnw test -Pgolden` and read the report.

## Coverage

What the set needs, and what it has. The gaps are where extraction is
currently wrong and untested.

Since the document-type split, a case also has to say **which kind of document**
it is. `expected.json` carries `documentType`, and it is scored first, because a
run that reads the money perfectly off a repair order is not a good run — the
Talisay repair order prints ₱5,534.01 for work the invoice billed at ₱3,106.49.

All three current cases are `SERVICE_INVOICE`, which makes them a guard against
over-classification but proves nothing about detection: there is no case in the
set that *should* come back `ESTIMATE`. Until one exists, the classifier is
half-measured.

| Format | Case | Status |
|---|---|---|
| Dealership repair order (ESTIMATE, priced, superseded) | — | **missing** |
| Dealership official receipt (money, zero work) | — | **missing** |
| Picking slip (parts, no prices) | — | missing |
| Handwritten job card (work, no prices) | — | missing |
| Same receipt, flat, square on | — | **missing** (skew baseline) |
| Same receipt, tilted ~5-10 degrees | — | **missing** |
| Same receipt, tilted ~20 degrees or more | — | **missing** |
| Same receipt, perspective skew | — | **missing** |
| Dealership invoice, body & paint, long materials list | `toyota-talisay-body-paint` | present, lines pending |
| Independent shop, parts + labour, reconciles exactly | `gta-toledo-cooling` | present |
| Scooter CVT / drive service | `scooter-cvt-service` | present, **synthetic** |
| Motorcycle service, real capture | — | **missing** |
| Handwritten talyer receipt | — | **missing** |
| Thermal POS slip | — | missing |
| Tyre shop, repeated identical lines | — | missing |
| Parts-only, no labour | — | missing |
| Part-Tagalog | — | missing |
| Unreadable photo, correct answer is all-null | — | missing |

The first four are one receipt from one shop photographed four ways, and they
are deliberately the same receipt: they isolate the angle from everything else.
Four different receipts at four different angles cannot tell you whether the
angle or the shop was the problem.

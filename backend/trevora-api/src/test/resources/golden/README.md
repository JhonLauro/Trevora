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

## A case

One directory per receipt under `golden/`:

```
golden/<case-id>/
  ocr.txt        the OCR output, verbatim except for redaction
  case.json      what this case is, what vehicle it belongs to, what it tests
  expected.json  the correct answer, read off the original receipt
```

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

| Format | Case | Status |
|---|---|---|
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

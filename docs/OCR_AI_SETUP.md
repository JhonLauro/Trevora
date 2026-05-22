# OCR + AI Receipt Setup

Trevora receipt input creates a `ServiceDraft` through the OCR + AI pipeline. It never writes a final `ServiceRecord` directly; Module 2 review/correction still controls confirmation.

## Upload vs Scan

Receipt input has two frontend modes:

- Upload Receipt: the owner selects one or more existing receipt images from the device.
- Scan Receipt: the owner captures one receipt page at a time with the device camera. The MVP uses browser file capture with `capture="environment"` for better device compatibility.

Both modes submit one multipart request and create one `ServiceDraft`.

## Multi-page Support

One service transaction can include multiple pages, such as casa invoices, job orders, official receipts, and card slips.

The backend accepts:

- Legacy `receiptImage` for old single-image uploads.
- New repeated `receiptImages` multipart files for multi-page upload or scan.
- `receiptInputMode=UPLOAD` or `receiptInputMode=SCAN`.

OCR runs separately per page. `ServiceDraft.fieldMetadata.pages` stores:

- `pageNumber`
- `originalFilename`
- `inputMode`
- `ocrProvider`
- `rawText`
- `textLength`
- `ocrStatus`: `SUCCESS`, `EMPTY`, or `FAILED`
- `errorMessage` when OCR fails or returns empty text

If one page fails OCR, the backend continues with the remaining pages. Page order follows upload/capture order.

## Page-aware AI Input

Successful page OCR text is combined before AI extraction in this format:

```text
[PAGE 1 - UPLOAD - receipt-a.jpg]
OCR text...

[PAGE 2 - UPLOAD - receipt-b.jpg]
OCR text...
```

Long combined OCR text is truncated before OpenAI extraction for token safety. Metadata includes a warning when truncation may have happened.

## OpenAI Extraction Rules

The OpenAI prompt acts as a vehicle service record extraction specialist:

- Use only OCR text and page/source metadata.
- Do not invent values.
- Return strict JSON only.
- Missing or uncertain fields must be `null`.
- Dates should be `yyyy-MM-dd` when possible.
- `totalCost` should be numeric when possible.
- `odometer` should be numeric when possible.
- If pages conflict, choose the clearest value and add a confidence note.
- Include `confidenceNotes` and `fieldSources` when possible.

Expected JSON keys:

```text
serviceDate
serviceType
odometer
totalCost
shopName
location
partsReplaced
laborPerformed
remarks
confidenceNotes
fieldSources
```

## Draft Metadata

`ServiceDraft.fieldMetadata` includes:

- `inputType: receipt`
- `receiptInputMode`
- `pageCount`
- `ocrProvider`
- `aiProvider`
- `aiModel`
- `fallbackUsed`
- `pages`
- `confidenceNotes`
- `fieldSources`
- `warnings`
- `extractionErrors`
- `rawOcrText` for successful OCR fallback/debug review

Uploaded Supabase Storage references for all pages are stored in `storedReceiptPages`. The existing top-level receipt storage columns keep the first page as the primary display image.

## Environment Variables

Set these in `.env`, your shell, or deployment environment:

```properties
OCR_PROVIDER=tesseract
TESSERACT_PATH=tesseract
TESSDATA_PATH=
AI_EXTRACTION_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

`TESSERACT_PATH` is optional when `tesseract` is already on `PATH`. `TESSDATA_PATH` is optional unless your local Tesseract install needs an explicit tessdata directory.

Do not commit `.env`, API keys, Supabase secrets, receipt images, or real customer receipt text.

## Installing Tesseract Locally

Windows:

1. Install Tesseract OCR from the UB Mannheim Windows builds or another trusted package source.
2. Add the install directory, for example `C:\Program Files\Tesseract-OCR`, to `PATH`.
3. Or set `TESSERACT_PATH=C:\Program Files\Tesseract-OCR\tesseract.exe`.
4. If language data is not found, set `TESSDATA_PATH=C:\Program Files\Tesseract-OCR\tessdata`.

macOS:

```bash
brew install tesseract
```

Linux:

```bash
sudo apt-get update
sudo apt-get install tesseract-ocr
```

Verify:

```bash
tesseract --version
```

## Fallback Behavior

Fallback is intentionally kept for demo reliability:

- If `OCR_PROVIDER` is not `tesseract`, mock receipt extraction is used.
- If every page fails OCR or returns empty text, mock receipt extraction is used.
- If some pages fail OCR, successful page text still proceeds to AI extraction.
- If OpenAI is unavailable, not configured, or returns invalid JSON after successful OCR, a draft is still created with combined raw OCR text in `remarks`.
- Metadata records page-level OCR failures and AI failures in `extractionErrors`.

## MVP Limitations

- OCR quality depends on image lighting, angle, focus, and receipt print quality.
- Scan mode uses browser camera capture through file input; fully live camera scanning/cropping is not implemented yet.
- Page reordering is not implemented in the MVP; page order follows selection/capture order.
- The executable wrapper currently uses English OCR (`eng`).
- AI confidence is advisory and Module 2 review remains required.
- Raw OCR text is stored in draft metadata for review/debugging, so avoid uploading sensitive receipts outside trusted environments.

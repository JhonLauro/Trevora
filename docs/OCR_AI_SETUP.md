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

## Noise Filtering

Receipts come from many different shops with no fixed layout, so two layers work together to keep irrelevant content out of the extracted fields:

- **OCR-level block filtering** (`GoogleVisionOCRProvider`): Google Cloud Vision classifies each detected text region into a block type. Blocks typed `BARCODE`, `PICTURE`, or `RULER`, and any block Vision itself is under 35% confident about, are dropped before the text ever reaches AI extraction. This removes barcodes, logos, and stray marks structurally instead of relying on the AI to recognize them as noise.
- **Extraction-prompt filtering** (`OpenAIServiceDraftExtractionProvider`): the system prompt explicitly instructs the model to ignore marketing/promotional text, loyalty program blurbs, generic greetings, legal/warranty boilerplate, and unrelated registration numbers, rather than copying anything present in the OCR text into a field.

If a shop's receipt still leaks unwanted text into a field, check which layer let it through: block-level noise (visual artifacts) belongs in `GoogleVisionOCRProvider`'s filtering; textual boilerplate (that OCR correctly read but shouldn't have been extracted) belongs in the prompt's ignore-list.

## Environment Variables

Set these in `.env`, your shell, or deployment environment:

```properties
OCR_PROVIDER=google-vision
GOOGLE_CLOUD_VISION_API_KEY=AIza...
AI_EXTRACTION_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Do not commit `.env`, API keys, Supabase secrets, receipt images, or real customer receipt text.

## Setting up Google Cloud Vision

1. In the Google Cloud Console, create or select a project and enable the **Cloud Vision API**.
2. Create an API key (APIs & Services > Credentials > Create Credentials > API key).
3. Optionally restrict the key to the Cloud Vision API for security.
4. Set `GOOGLE_CLOUD_VISION_API_KEY` in `.env` to that key.

No local binary or system install is required — OCR requests go to the Cloud Vision REST API (`images:annotate` with `DOCUMENT_TEXT_DETECTION`) over HTTPS using the API key as a query parameter.

## Fallback Behavior

Fallback is intentionally kept for demo reliability:

- If `OCR_PROVIDER` is not `google-vision`, mock receipt extraction is used.
- If every page fails OCR or returns empty text, mock receipt extraction is used.
- If some pages fail OCR, successful page text still proceeds to AI extraction.
- If OpenAI is unavailable, not configured, or returns invalid JSON after successful OCR, a draft is still created with combined raw OCR text in `remarks`.
- Metadata records page-level OCR failures and AI failures in `extractionErrors`.

## MVP Limitations

- OCR quality depends on image lighting, angle, focus, and receipt print quality.
- Scan mode uses browser camera capture through file input; fully live camera scanning/cropping is not implemented yet.
- Page reordering is not implemented in the MVP; page order follows selection/capture order.
- Google Cloud Vision's document text detection auto-detects language, which is broader than the prior English-only OCR but is not tuned per-locale.
- AI confidence is advisory and Module 2 review remains required.
- Raw OCR text is stored in draft metadata for review/debugging, so avoid uploading sensitive receipts outside trusted environments.
- Cloud Vision usage is billed by Google beyond its free tier; monitor API usage/quotas in the Google Cloud Console.

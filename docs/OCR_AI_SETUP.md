# OCR + AI Receipt Setup

Trevora receipt upload now creates a `ServiceDraft` through an OCR + AI pipeline:

1. The existing receipt upload endpoint receives the image.
2. `TesseractOCRProvider` runs the local Tesseract executable and extracts raw text.
3. `OpenAIServiceDraftExtractionProvider` sends only that raw OCR text to OpenAI and asks for strict JSON.
4. `OCRProcessingService` maps the JSON into draft fields and stores metadata in `ServiceDraft.fieldMetadata`.
5. Module 2 review/correction still validates the draft before a final `ServiceRecord` can be saved.

The AI/OCR pipeline never writes a final service record directly.

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

## OpenAI Extraction

Set:

```properties
AI_EXTRACTION_PROVIDER=openai
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4o-mini
```

The extraction prompt requires JSON only and tells the model:

- Use only the OCR text.
- Do not invent values.
- Return missing fields as `null`.
- Normalize dates to `yyyy-MM-dd` when possible.
- Return numeric `totalCost` and `odometer` when possible.

Expected JSON keys are `serviceDate`, `serviceType`, `odometer`, `totalCost`, `shopName`, `location`, `partsReplaced`, `laborPerformed`, `remarks`, and `confidenceNotes`.

## Fallback Behavior

Fallback is intentionally kept for demo reliability:

- If `OCR_PROVIDER` is not `tesseract`, the existing mock receipt extraction is used.
- If Tesseract is unavailable, fails, or returns empty text, the existing mock receipt extraction is used.
- If OpenAI is unavailable, not configured, or returns invalid JSON after successful OCR, a draft is still created with raw OCR text in `remarks`.
- Extraction metadata includes `ocrProvider`, `aiProvider`, `aiModel`, `fallbackUsed`, `rawOcrText`, `confidenceNotes`, and `extractionErrors` when present.

## MVP Limitations

- OCR quality depends heavily on image lighting, angle, focus, and receipt print quality.
- The executable wrapper currently uses English OCR (`eng`).
- AI extraction confidence is advisory and Module 2 review remains required.
- PDF OCR depends on the local Tesseract installation and supporting system libraries.
- Raw OCR text is stored in draft metadata for review/debugging, so avoid uploading sensitive receipts outside trusted environments.

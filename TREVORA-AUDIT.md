# Trevora — Implementation Audit

**Audited:** 2026-08-24 · **Branch:** `main` @ `f4b2072` · **Method:** read the source, traced request paths from HTTP handler → service → repository. No builds, migrations, or installs were run.

Every claim below was verified by reading the file cited. Where the code contradicts a `CONTEXT.md`, a README, or a commit message, the code wins.

**Bottom line:** this is a genuinely built application, not a scaffold. All four modules exist end to end with live third-party integrations (Google Cloud Vision, OpenAI chat + audio transcription, Supabase Auth + Storage). Ownership scoping is applied consistently and correctly on every owner-facing query. The two real problems are (1) the mechanic read-only session is authenticated by a database primary key that is handed out over a permanently-valid public endpoint, and (2) four columns the app maps and requires are missing from `database/migrations`, so the migration folder cannot rebuild a working database.

---

## Step 0 — Recent activity

The primary working directory `C:\Users\Administrator\Trevora Development` is **not** the repository. The git root there is `C:\Users\Administrator` (the Windows home directory), which has zero commits and reports the entire user profile as untracked. The actual project repo is one level down at `Trevora Development/Trevora`. All findings below refer to that repo.

```
f4b2072  2026-08-23  Record the extraction audit and what is left
50c8df7  2026-08-23  Check whether an extracted value is possible, not just present
298dfdd  2026-08-23  Make receipt extraction read receipts
8579f62  2026-08-23  Add a golden set so extraction changes can be measured
412aba4  2026-08-23  Draw the mechanic's shared vehicle as the vehicle it is
0968fd9  2026-08-23  Show components first, and before any records exist
4fd3276  2026-08-23  Split motorcycles into scooter, underbone and big bike
e497412  2026-08-23  Split receipt lines by kind so attribution reads operations
1fa9e3a  2026-08-23  Redraw the parts map as nine drawings across two views
1fdaada  2026-08-23  Add the parts map, service coverage, and optional model year
ef35aa4  2026-08-22  Clean up DEFERRED after this session's work
82ff718  2026-08-22  Record whether a human validated each service record
```

- **`git status`: clean.** Nothing uncommitted, nothing stashed. Working tree matches `origin/main`.
- **Active development:** receipt OCR extraction accuracy (last 4 commits), the parts-map / vehicle-taxonomy UI, and record provenance (`validation_status`). Sole author on recent history: `Brentaru`.
- **Long untouched:** the QR/mechanic-access feature. Its last substantive commits (`f1de1a9`, `7703766`) predate the ~3-month pause described in `CLAUDE.md`. This is also where every security finding in Step 4 lives.
- **Stale branches:** 12 remote branches exist for module work that is already merged (`MechanicReadOnlyAccess`, `ServiceValidationModule`, `SpeechtoText`, `module4-*`, …). Housekeeping only.

Commit messages are unusually accurate here — but they are not the evidence for anything below.

---

## Step 1 — Stack inventory

### Frameworks and tooling

| Layer | Choice | Evidence |
|---|---|---|
| Backend | Spring Boot 3.3.5, Java 21, modular monolith | `backend/trevora-api/pom.xml:11-27` |
| Backend build | Maven (wrapper `mvnw`/`mvnw.cmd`) | `backend/trevora-api/mvnw.cmd` |
| Frontend | React 18.3 + Vite 5.4, React Router 6.28, plain JavaScript (no TypeScript) | `frontend/trevora-web/package.json:11-19` |
| Frontend build | npm | `package-lock.json` present, no yarn/pnpm lockfile |
| DB access | Spring Data JPA / Hibernate, PostgreSQL driver 42.7.11 | `pom.xml:24-26,41-45` |
| QR rendering | `qrcode.react` 4.2.0 | `package.json:14` |
| Icons | `lucide-react` 1.16.0 | `package.json:13` |

**There is no `spring-boot-starter-security` and no `oauth2-resource-server` dependency.** Authentication and authorization are entirely hand-rolled inside service methods. There is no servlet filter, no interceptor, and no URL-based access rule — `shared/config/WebConfig.java` configures CORS and nothing else. Consequence: **every endpoint is publicly routable, and the only thing protecting it is whether the service method it calls happens to invoke `currentUserService.requireVehicleOwner()`.** I traced all 33 handlers; the coverage is complete (see Step 2), but it is coverage by convention, not by construction.

### Database and schema

PostgreSQL via Supabase. Schema lives in `database/migrations/*.sql` (12 files, applied by hand to Supabase — there is no Flyway/Liquibase). Hibernate runs `ddl-auto=validate` (`application.properties:9`), so the app refuses to start if an entity column is missing.

| Table | Columns | Migration |
|---|---|---|
| `users` | `user_id` (PK, = Supabase auth uid), `full_name`, `first_name`, `last_name`, `email` (unique), `role`, `password_hash`, `created_at`, `updated_at` | `001`, `003`, `005` |
| `vehicle_profiles` | `vehicle_id` (PK), `owner_id` → users, `make`, `model`, `model_year`, `nickname`, `plate_number`, `vin_chassis_number`, `odometer`, `body_type`, `created_at`, `updated_at` | `001`, `008`, `012` |
| `service_drafts` | `draft_id` (PK), `vehicle_id`, `owner_id`, `input_method` (MANUAL/RECEIPT/VOICE), `service_date`, `odometer`, `total_cost`, `amount_covered`, `shop_name`, `location`, `remarks`, `status` (DRAFT/READY_FOR_REVIEW/CONFIRMED), `field_metadata` (jsonb), `created_at`, `updated_at` **+ 4 undeclared receipt columns (see below)** | `001`, `002`, `007`, `010` |
| `service_draft_items` | `item_id` (PK), `draft_id` (cascade), `service_type`, `service_category`, `parts_replaced`, `labor_performed`, `line_cost`, `sort_order`, `field_metadata` | `007` |
| `service_draft_line_entries` | `entry_id` (PK), `item_id` (cascade), `kind` (OPERATION/PART/MATERIAL/FEE), `description`, `part_code`, `quantity`, `unit_price`, `line_total`, `sort_order`, `field_metadata` | `011` |
| `service_records` | `record_id` (PK), `draft_id` (unique), `vehicle_id`, `owner_id`, `source_input_method`, `validation_status` (VALIDATED/NEEDS_REVIEW), `service_date` (NOT NULL), `odometer`, `total_cost` (NOT NULL), `amount_covered`, `shop_name`, `location`, `remarks`, `field_metadata`, `created_at`, `updated_at` **+ 4 undeclared receipt columns** | `002`, `007`, `009`, `010` |
| `service_record_items` | mirror of `service_draft_items`, keyed on `record_id` | `007` |
| `service_record_line_entries` | mirror of `service_draft_line_entries` | `011` |
| `qr_access_requests` | `qr_access_request_id` (PK), `vehicle_id`, `owner_id`, `access_token` (unique), `status` (ACTIVE/REQUESTED/APPROVED/DENIED/EXPIRED), `expires_at`, `used_at`, timestamps | `004` |
| `mechanic_access_requests` | `mechanic_access_request_id` (PK), `qr_access_request_id`, `vehicle_id`, `owner_id`, `mechanic_id` (always null), `mechanic_name`, `shop_name`, `contact_info`, `reason`, `status` (PENDING/APPROVED/DENIED), `requested_at`, `decided_at`, timestamps | `004` |
| `mechanic_access_sessions` | `mechanic_access_session_id` (PK), `mechanic_access_request_id`, `vehicle_id`, `owner_id`, `mechanic_id`, `session_token` (unique), `permission` (= READ_ONLY), `status` (APPROVED/EXPIRED/REVOKED), `approved_at`, `expires_at`, timestamps | `004` |

**Schema drift — the migrations folder is incomplete.** `receipt_storage_bucket`, `receipt_storage_path`, `receipt_original_filename`, and `receipt_content_type` are mapped on both `ServiceDraft` and `ServiceRecord` entities and are read on live code paths, but `grep -ri receipt database/migrations/` finds no DDL that creates them. Combined with `ddl-auto=validate`, a database built purely from `database/migrations/` **will not boot the backend.** Those columns were applied out-of-band to the live Supabase project.

RLS: enabled with **no policies** on all eight data tables (`006`, `007:96-97`, `011`). That is fail-closed and correct for this design — the backend connects as `postgres` over JDBC and bypasses RLS, while the browser's anon key can reach nothing.

### Auth mechanism

Supabase Auth (GoTrue), bearer token only. `SupabaseAuthService.fetchUser` (`features/auth/SupabaseAuthService.java:60-84`) makes a live `GET {SUPABASE_URL}/auth/v1/user` call with the caller's token on every request, caching the result per-request. No local JWT verification, no signing key. A request without a valid token gets `"Sign in is required for this action."` (`CurrentUserService.java:57-59`).

The legacy `X-User-Id`/`X-User-Role` demo headers and the `00000000-…-0001` mock owner are genuinely gone — the frontend no longer sends them and no backend code reads them.

**One structural weakness:** the caller's *role* is parsed from `user_metadata.role` in the Supabase user response (`SupabaseAuthService.java:106,110-119`). `user_metadata` is writable by the account holder with the public anon key (`supabase.auth.updateUser`). So the value `requireVehicleOwner()` gates on is client-controlled. Today this is not an escalation path — `ADMIN` is the only other role and it has *no* privileged endpoint, so setting it locks you out of everything rather than granting anything. But the trust boundary is wrong and will bite the moment an admin capability is added.

### Third-party services

| Service | Real or stub | Evidence |
|---|---|---|
| **Google Cloud Vision** (receipt OCR) | **Real.** Live POST to `https://vision.googleapis.com/v1/images:annotate` with `?key=` | `serviceinput/GoogleVisionOCRProvider.java:22,70` |
| **OpenAI chat** (receipt/voice field extraction) | **Real.** Live POST to `https://api.openai.com/v1/chat/completions`, `gpt-4o-mini` default, JSON-mode | `serviceinput/OpenAIServiceDraftExtractionProvider.java:23,101` |
| **OpenAI audio** (speech-to-text) | **Real.** Live multipart POST to `https://api.openai.com/v1/audio/transcriptions`, `gpt-4o-mini-transcribe` | `serviceinput/VoiceTranscriptionService.java:24,103-122` |
| **OpenAI chat** (mechanic AI search) | **Real.** Separate call, `gpt-4o` default, with a keyword fallback if the key is absent or the call fails | `mechanicaccess/MechanicSearchService.java:30,104-116,152-160` |
| **Supabase Auth** | **Real.** Email+password, email OTP verification, Google OAuth, password reset | `frontend/src/api/auth.js:8-20,45-58,61-72,214-296` |
| **Supabase Storage** (receipt images) | **Real.** Uploads to `service-receipts` bucket under `{userId}/{vehicleId}/…`, reads back via signed URLs | `frontend/src/api/receiptStorage.js:33-56,58` |
| **QR code generation** | **Real, client-side.** `QRCodeSVG` renders the server-issued `accessUrl` | `frontend/src/pages/QRSharingPage.jsx:2,271-273` |
| **AI service explanation** | **Not AI.** Deterministic string templates with keyword matching — no model call anywhere. Returns `source: "template"`. | `ai/AIExplanationService.java:28,64-120,136-155` |

Both OCR and extraction providers default to `mock` (`application.properties:21,23`). **The `mock` path fabricates nothing** — it returns a blank draft plus an explicit error string. A prior version invented a date, a PHP 1,500 total and a "Mock OCR Auto Shop"; that was deliberately removed and documented at `OCRProcessingService.java:239-253`. Good call, and worth knowing: **if `OCR_PROVIDER` and `AI_EXTRACTION_PROVIDER` are not set to `google-vision`/`openai`, receipt scanning silently produces empty drafts.**

### Environment variables referenced in code

Backend: `SUPABASE_DB_URL`, `SUPABASE_DB_USERNAME`, `SUPABASE_DB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PORT`, `OCR_PROVIDER`, `GOOGLE_CLOUD_VISION_API_KEY`, `AI_EXTRACTION_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_MECHANIC_SEARCH_MODEL`, `OPENAI_RAW_TRANSCRIPTION_MODEL`, `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_TEXT_TRANSLATION_MODEL`.

Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`, `VITE_SUPABASE_RECEIPT_BUCKET`.

Undocumented: `trevora.frontend-base-url` (env `TREVORA_FRONTEND_BASE_URL`) is read at `sharing/QRAccessService.java:62` and defaults to `http://localhost:5173`. It is absent from both `.env.example` and `application.properties`. **Left unset in any deployment, every QR code encodes a `localhost` URL and is unscannable from a mechanic's phone.**

No credential values were read or reproduced. (`backend/trevora-api/.env` exists on disk and is gitignored.)

---

## Step 2 — Route and endpoint map

### API endpoints (33)

Auth column: **Owner** = requires bearer token + `VEHICLE_OWNER` role; **Token** = bearer token only; **Public** = no authentication at all.

| Method | Path | Auth | What it does |
|---|---|---|---|
| POST | `/api/auth/register` | **Public** | Legacy local signup; writes a `users` row with a PBKDF2 hash. Dead — no caller. |
| POST | `/api/auth/login` | **Public** | Legacy local password check. Returns a profile, **no token**. Dead — no caller. |
| POST | `/api/auth/sync` | Token | Upserts the `users` row from the verified Supabase identity |
| GET | `/api/auth/me` | Token | Current user profile |
| GET | `/api/vehicles` | Owner | List the caller's vehicles |
| POST | `/api/vehicles` | Owner | Create a vehicle profile |
| GET | `/api/vehicles/{id}` | Owner | One vehicle, owner-scoped query |
| PUT | `/api/vehicles/{id}` | Owner | Update a vehicle |
| DELETE | `/api/vehicles/{id}` | Owner | Hard-delete vehicle + all sessions, requests, records, drafts under it |
| POST | `/api/service-drafts/manual` | Owner | Manual-entry draft |
| POST | `/api/service-drafts/receipt` | Owner | Multipart receipt upload → Vision OCR → OpenAI extraction → draft |
| POST | `/api/service-drafts/voice` | Owner | Transcript → OpenAI extraction → draft |
| POST | `/api/service-drafts/voice/transcribe` | Owner | Audio file → OpenAI transcription |
| POST | `/api/service-drafts/voice/translate` | Owner | Transcript → English via OpenAI |
| GET | `/api/service-drafts/{id}` | Token | One draft, owner-scoped query |
| PATCH | `/api/service-drafts/{id}/corrections` | Owner | Save owner edits; sets status `READY_FOR_REVIEW`, `ownerCorrected: true` |
| POST | `/api/service-drafts/{id}/confirm` | Owner | Re-validates, then promotes draft → `service_records` |
| GET | `/api/service-drafts/{id}/review` | Owner | Draft + full validation result |
| POST | `/api/service-drafts/{id}/validate` | Owner | Validation result only |
| GET | `/api/vehicles/{vid}/history` | Owner | Confirmed records; `sort`, `serviceType`, `keyword` params |
| GET | `/api/vehicles/{vid}/history/{rid}` | Owner | Record detail with items and line entries |
| DELETE | `/api/vehicles/{vid}/history/{rid}` | Owner | Hard-delete one record |
| POST | `/api/vehicles/{vid}/history/{rid}/reviewed` | Owner | One-way `NEEDS_REVIEW` → `VALIDATED` |
| GET | `/api/service-records/{rid}/ai-explanation` | Owner | Template explanation (no model call) |
| POST | `/api/qr-access/requests` | Owner | Mint a 192-bit share token, 24 h expiry, return `accessUrl` |
| GET | `/api/qr-access/requests?vehicleProfileId=` | Owner | This vehicle's share links |
| GET | `/api/qr-access/requests/{token}` | **Public** | Pre-approval landing data: vehicle label, **plate number**, expiry, record count |
| POST | `/api/qr-access/requests/{token}/mechanic-request` | **Public** | Mechanic submits name/shop/contact/reason; QR → `REQUESTED` |
| GET | `/api/qr-access/requests/{token}/mechanic-request/status` | **Public** | Poll for the owner's decision. **Returns the approved session object, including `mechanicAccessSessionId` and `sessionToken`.** |
| GET | `/api/mechanic-access/requests/pending` | Owner | Pending requests for the owner |
| GET | `/api/mechanic-access/requests?status=` | Owner | All requests for the owner |
| POST | `/api/mechanic-access/requests/{rid}/approve` | Owner | Approve → create a 4 h READ_ONLY session |
| POST | `/api/mechanic-access/requests/{rid}/deny` | Owner | Deny → QR marked `DENIED` |
| GET | `/api/mechanic-access/owner/sessions?status=` | Owner | Owner's view of live sessions |
| POST | `/api/mechanic-access/owner/sessions/{sid}/revoke` | Owner | Revoke a session |
| GET | `/api/mechanic-access/sessions/{sid}/history` | **Session id in URL** | Full shared vehicle history, read-only |
| GET | `/api/mechanic-access/sessions/{sid}/history/search?query=` | **Session id in URL** | AI/keyword search over the shared history |
| GET | `/api/mechanic-access/sessions/{sid}/history/{rid}` | **Session id in URL** | One shared record |

### Pages (30 routed + 3 orphaned)

**Public:** `/` (landing when signed out), `/login`, `/register`, `/register/vehicle`, `/forgot-password`, `/auth/reset-password`, `/auth/callback`.

**Mechanic (no login):** `/access/request/:token` — request form + approval polling; `/mechanic/access/:sessionId` — the read-only workspace (parts map / timeline / table + AI search); `/mechanic/access/:sessionId/history/:recordId` — shared record detail with receipt preview.

**Owner (gated on `isLoggedIn()`):** `/` Garage · `/records` all records · `/account-settings` · `/notifications` · `/access/requests` approve/deny queue · `/vehicles/new` · `/vehicles/:id` vehicle page (absorbed the old history screen) · `/vehicles/:id/share` QR sharing · `/vehicles/:id/history/:rid` record detail · `/service-input[/:vid]` method picker · `/service-input/:vid/manual|receipt|voice` · `/service-drafts/:id` structured draft · `/service-drafts/:id/review|correct|confirm|saved`.

**Orphaned — never imported, never routed (1,860 lines):** `pages/DashboardPage.jsx` (336), `pages/VehicleServiceHistoryPage.jsx` (1,085), `pages/VehicleProfileSelectionPage.jsx` (439).

---

## Step 3 — Requirements audit

| Requirement | Status | Evidence |
|---|---|---|
| **FR-EXT-01** Create/select vehicle before submitting | **DONE** | `pages/ServiceInputMethodPage.jsx:42-113` gates on a selected vehicle; every draft endpoint calls `vehicleService.verifyVehicleBelongsToMockOwner(vehicleId)` before building a draft — `serviceinput/ServiceInputService.java:65,122,171` |
| **FR-EXT-02** OCR extract date/type/parts/shop/cost/remarks | **DONE** | `GoogleVisionOCRProvider.java:22,43-80` (live Vision call) → `OpenAIServiceDraftExtractionProvider.java:85-111` (live extraction) → `OCRProcessingService.java:107-158`. All six fields plus per-line items and parts/operations. Requires `OCR_PROVIDER=google-vision` + `AI_EXTRACTION_PROVIDER=openai`; otherwise returns a blank, honestly-labelled draft (`:254-270`) |
| **FR-EXT-03** Speech-to-text | **DONE** | `VoiceTranscriptionService.java:53-65` (transcribe) and `:66-89` (translate to English), both live OpenAI audio/chat calls; UI at `pages/VoiceInputPage.jsx` |
| **FR-EXT-04** Manual entry fallback | **DONE** | `ServiceInputService.java:62-86`, `ManualServiceDraftRequest.java`, `pages/ManualEntryPage.jsx` |
| **FR-EXT-05** Normalize to one structured draft, tagging source + confidence | **DONE** | All three methods converge on `ServiceDraft` + `service_draft_items` + `service_draft_line_entries`. `field_metadata` carries `source`, `fieldSources`, `fieldConfidence`, `confidenceNotes`, `aiSuggestedFields` — `OCRProcessingService.java:136-158`, `VoiceProcessingService.java:63-90`, manual tagged `source: owner_entered` at `ServiceInputService.java:78-81` |
| **FR-VAL-01** Editable review form pre-save | **DONE** | `GET /api/service-drafts/{id}/review` → `ServiceDraftValidationService.java:54-59`; UI `pages/ServiceDraftReviewPage.jsx` (read/flag) + `pages/ServiceDraftCorrectionPage.jsx` (editable, saves) |
| **FR-VAL-02** Detect missing required; flag low-confidence/not-found | **DONE** | Required rules for vehicle/date/cost at `ServiceDraftValidationService.java:31-35` plus a "≥1 service" rule at `:137-150`. Confidence/not-found flagging at `:174-294`, skipped for MANUAL drafts at `:73-75`. Plus plausibility checks (future date blocks; odometer regression; duplicate detection) at `DraftPlausibilityService.java:102-235` |
| **FR-VAL-03** Owner corrects flagged/missing details | **DONE** | `PATCH /{id}/corrections` → `ServiceDraftCorrectionService.java:40-64`; replaces line items, stamps `ownerCorrected`, re-runs validation and returns it |
| **FR-VAL-04** Explicit confirmation before storing | **DONE** | UI requires an authorization checkbox before enabling save — `pages/ServiceRecordConfirmationPage.jsx:179,187`; server-side gate at `servicerecord/ServiceRecordService.java:56-66` |
| **FR-HIS-01** Store under the correct vehicle | **DONE** | `ServiceRecordService.java:164-175` copies `vehicleId`/`ownerId` from the owner-scoped draft; FK `service_records.vehicle_id` → `vehicle_profiles` (`002:4`) |
| **FR-HIS-02** Chronological by service date | **DONE** | `ServiceHistoryService.java:158-168` — DB-level `Sort` on `serviceDate, createdAt` plus an in-memory comparator, both directions |
| **FR-HIS-03** Categorize by type / parts / cost / shop | **DONE** | Per-item `service_type` + `service_category` (`007:16-28`) resolved by `ServiceClassificationService.java` (422 lines, AI hint + keyword fallback); line entries typed OPERATION/PART/MATERIAL/FEE (`011:98`); distinct service-type facet returned at `ServiceHistoryService.java:79-85` |
| **FR-HIS-04** Centralized history with search/filter/sort/detail | **DONE** | `GET /api/vehicles/{vid}/history` with `sort`+`serviceType`+`keyword` → `ServiceHistoryService.java:47-96`; detail at `:98-107`; UI `pages/VehiclePage.jsx` + `pages/ServiceRecordDetailPage.jsx` |
| **FR-HAN-01** AI-assisted, template-based explanation | **DONE (no AI involved)** | `ai/AIExplanationService.java:64-120` produces "what was done / why it matters / what to watch for" from string templates + keyword matching (`:136-155`, `:227-249`). Response `source` is literally `"template"` (`:28`). No LLM call, and nothing is persisted — it is recomputed on every request. Meets the requirement *as worded in this audit*; does not meet the SRS's "AI-generated". |
| **FR-HAN-02** One-time QR: token, URL, expiry, scannable code | **DONE** | Token: 24 `SecureRandom` bytes, base64url, uniqueness-checked — `sharing/QRAccessService.java:236-244`. 24 h expiry `:42,87`. `accessUrl` `:246-248`. QR rendered from that URL at `pages/QRSharingPage.jsx:271-273`. One-time-ness enforced at `:123-128,197-211` |
| **FR-HAN-03** Notify owner access is temporary/expiring | **DONE** | `pages/QRSharingPage.jsx:187` ("Mechanic access requires your approval and is temporary read-only"), expiry shown at `:322-323,352`, live per-session countdown at `:394` |
| **FR-HAN-04** Mechanic requests via public link; owner must approve | **DONE** | Public submit `QRAccessService.java:120-150`; owner-scoped approve `AccessApprovalService.java:75-114` — verifies request ownership (`:138-142`), QR ownership (`:83-86`), QR not expired (`:87-90`), and vehicle ownership (`:92`) before minting a session |
| **FR-HAN-05** Temporary read-only session, auto-expiring, no writes | **DONE (weak authentication — see Step 4)** | `MechanicAccessService.requireActiveReadOnlySession:122-138` checks status `APPROVED`, permission `READ_ONLY`, and `expiresAt`, flipping the row to `EXPIRED` on the spot. 4 h TTL at `AccessApprovalService.java:36`. All three mechanic endpoints are `@GetMapping`; no create/update/delete exists for a mechanic anywhere |
| **FR-HAN-06** AI search scoped to the approved vehicle only | **DONE** | `MechanicSearchService.searchSharedRecords:56-88` — the candidate set comes only from `getSessionRecords(session)`, scoped by `vehicleId` **and** `ownerId` (`MechanicAccessService.java:140-150`), and any record id the model returns is intersected against `allowedIds` before use (`:127-141`). A hallucinated or injected id cannot pull a record into the result |
| **NFR-SEC-01/02** Auth required; server-side role checks | **DONE, with a caveat** | 30 of 33 handlers reach `currentUserService.requireVehicleOwner()` or an owner-scoped query in the *service* layer, not the controller — verified across `VehicleService:69,74,90,104,110,140`, `ServiceInputService:64,119,170`, `ServiceDraftValidationService:55,62`, `ServiceDraftCorrectionService:42`, `ServiceRecordService:58`, `ServiceHistoryService:53,99,123,146`, `AIExplanationService:50`, `QRAccessService:76,95`, `AccessApprovalService:67,77,118`, `MechanicAccessService:66,79`. Caveat: the role itself comes from client-writable `user_metadata` (`SupabaseAuthService.java:106`) |
| **NFR-SEC-03** Owner approval enforced server-side | **DONE** | A session row only ever comes into existence inside `AccessApprovalService.approveRequest` (`:101-112`), which is owner-scoped and rejects any non-`PENDING` request (`:79-81`). `requireActiveReadOnlySession` refuses anything but `APPROVED` (`:126-128`) |
| **NFR-SEC-04** Mechanic writes blocked server-side | **DONE** | No write handler exists under `/api/mechanic-access/sessions/**` (`MechanicAccessController.java:68-87`, all `@GetMapping`). `permission` is DB-constrained to `READ_ONLY` (`004:55`) and re-checked at `MechanicAccessService.java:129-131`. Every owner mutation endpoint requires a bearer token a mechanic never has |
| **NFR-SEC-05** Expiry enforced server-side on every request | **DONE** | `requireActiveReadOnlySession:132-136` is called at the top of all three mechanic reads and re-checks `expiresAt` against `Instant.now()` each time, persisting the `EXPIRED` transition. Not UI-only |
| **NFR-REL-02** Save blocked when required fields missing, server-side | **DONE** | `ServiceRecordService.confirmDraft:61-66` re-runs the full validator and throws `InvalidServiceRecordConfirmationException` before touching `service_records`. Belt-and-braces: `service_records.service_date` and `total_cost` are `NOT NULL` (`002:7,10`) |
| **NFR-REL-04** Vehicle ownership verified before storing | **DONE** | Draft creation verifies ownership (`ServiceInputService.java:65,122,171`); the draft is re-fetched owner-scoped at confirm time (`ServiceInputService.java:196-199`); and the validator independently re-verifies vehicle ownership as a blocking `ERROR` (`ServiceDraftValidationService.java:152-169`) |

**Nothing in the requirement list is MISSING, PARTIAL, or STUB.** That is an unusual result and I checked it twice — the one place I expected a stub, `MechanicAccessSessionPlaceholderPage.jsx`, is a 478-line fully-built workspace whose filename is vestigial.

---

## Step 4 — Findings

### Security

**S1 — The mechanic session is authenticated by its database primary key, and the generated session token is never checked.** *(highest severity)*

`GET /api/mechanic-access/sessions/{sessionId}/history` resolves the caller with `mechanicAccessSessionRepository.findById(sessionId)` and nothing else (`mechanicaccess/MechanicAccessService.java:123-125`). There is no `Authorization` header, no cookie, no token comparison — and the frontend confirms this is intentional, sending `skipAuthHeaders: true` on all three mechanic calls (`frontend/src/api/mechanicAccess.js:3-20`).

A 192-bit `session_token` **is** generated and stored (`sharing/AccessApprovalService.java:154-162`), and the column is unique-indexed (`004:54,66-67`). It is never verified. `grep -rn "findBySessionToken"` across `src/main` returns exactly one hit — the uniqueness loop inside the generator itself. The security control was built and then not wired up.

The effective bearer credential is therefore a Postgres `gen_random_uuid()` value that travels in a URL path — so it lands in browser history, `Referer` headers, proxy logs, and server access logs, and it is shown to the user in the address bar of a page a shop's shared computer may keep open.

**S2 — Any holder of the QR image can read the session id, indefinitely, and get the same access as the mechanic.**

`GET /api/qr-access/requests/{token}/mechanic-request/status` is fully public and returns a `MechanicAccessSessionResponse`, which includes both `mechanicAccessSessionId` and `sessionToken` (`sharing/MechanicAccessSessionResponse.java:12,24` → `PublicMechanicRequestStatusResponse.java:37`). Unlike the sibling endpoints, it does **not** call `getValidTokenRequest` — it only does `findByAccessToken` + `expireIfNeeded` (`QRAccessService.java:152-172`), so it keeps answering after the QR is `REQUESTED`, `APPROVED`, `DENIED`, or `EXPIRED`.

Chained with S1: anyone who photographs the QR code over the mechanic's shoulder, or later finds it in a phone gallery or a chat thread, can poll that endpoint and — for the 4-hour life of the session — read the vehicle's complete service history. The owner approved *one* named mechanic; the token grants the same thing to every holder, and the owner has no way to tell.

**S3 — Pre-approval information disclosure on the public landing endpoint.**

`GET /api/qr-access/requests/{token}` returns the vehicle label, **plate number**, and confirmed-record count *before* the owner has approved anything (`QRAccessService.java:105-118`). Anyone with the link learns the plate of a specific vehicle with no owner decision involved.

**S4 — Token entropy and one-time-use are fine.** Stated for completeness since it was asked. Both tokens are 24 `SecureRandom` bytes (192 bits) base64url-encoded, with a collision retry loop — `QRAccessService.java:236-244`, `AccessApprovalService.java:154-162`. Brute force is not a concern. One-time-use is enforced: `getValidTokenRequest` rejects `EXPIRED`/`DENIED`/`APPROVED` (`:197-211`), and a second mechanic request is refused while one is `PENDING` or `APPROVED` (`:123-128`). The only gap is a benign TOCTOU race between two simultaneous submissions on the same token.

**S5 — Expired and unapproved tokens correctly cannot read records.** Verified: `requireActiveReadOnlySession` re-checks status and expiry on every call and persists the expiry transition (`MechanicAccessService.java:122-138`). Revocation works the same way (`:77-85`). The mechanic endpoints **cannot** leak other vehicles' or other owners' records — every query is scoped by `session.getVehicleId()` **and** `session.getOwnerId()` (`:108-110`, `:140-150`), and the AI search intersects model output against that allow-list (`MechanicSearchService.java:127-141`). This part is genuinely well built.

**S6 — Two dead but live public auth endpoints.** `POST /api/auth/register` and `POST /api/auth/login` (`auth/AuthController.java:20-28`) have no caller — the frontend uses Supabase Auth exclusively (`frontend/src/api/auth.js`). They remain routable and unauthenticated. `register` lets an anonymous caller insert arbitrary rows into `public.users` with no verification and no rate limit; `login` is an unthrottled credential-checking oracle. `login` returns no token, so it grants no access — but neither endpoint should be reachable.

**S7 — Server-side role derives from client-writable metadata.** `SupabaseAuthService.parseRole` reads `user_metadata.role` (`:106,110-119`), which an account holder can rewrite via `supabase.auth.updateUser` with the anon key. Not exploitable today (`ADMIN` has no privileged endpoint and would only fail `requireVehicleOwner`), but NFR-SEC-02's "server-side access checks" is currently satisfied by a claim the client controls.

**S8 — No rate limiting anywhere,** on any endpoint, public or authenticated. Combined with S6 that means unbounded row creation in `users`.

**S9 — Mechanic responses pass `field_metadata` through verbatim** (`MechanicSharedServiceRecordResponse.java:26,49-66`), which carries `rawOcrText` and `storedReceiptPages` paths that embed the owner's user UUID. `amount_covered` is correctly excluded as designed (`010:68`). Low severity, but the metadata blob was never curated for the mechanic audience the way the top-level fields were.

### Built but not in the requirements (scope beyond spec)

The project's own `planning/DEFERRED.md:536-545` already flags most of this as "paper / implementation drift", which is the right instinct:

- **Interactive parts map** — nine SVG vehicle drawings across two views, per body type (`components/ink/PartsView.jsx`, `vehicleDrawings.jsx`, `PartsMap.jsx`), plus component status grading (`utils/componentStatus.js`).
- **Vehicle body-type taxonomy and make/model catalogue** — `data/vehicleCatalog.js`, migrations `008` and `012` (sedan/hatchback/suv/mpv/pickup/van/scooter/underbone/motorcycle).
- **Insurance/warranty coverage** — `amount_covered` on drafts and records, with DB check constraints (`010`).
- **`validation_status` provenance** — VALIDATED vs NEEDS_REVIEW, plus a "mark reviewed" endpoint (`009`, `ServiceHistoryService.java:144-156`). Not in the SRS, but it is the single most defensible addition here: it replaced a UI that rendered "Validated" on every row unconditionally.
- **Multi-line receipt structure** — per-visit service items and typed line entries (`007`, `011`). The SRS models a service record as one flat row.
- **Spend analytics** — monthly bars and spend aggregation (`utils/spend.js`, `monthlySeries.js`, `components/ink/MonthBars.jsx`).
- **Notifications page** with localStorage-backed read state (`pages/NotificationsPage.jsx`) — derived from real access requests, but the SRS has no notification centre.
- **Delete flows** — vehicle and record hard-deletes (`VehicleService.java:138-150`, `ServiceHistoryService.java:121-130`). NFR-REL-01 anticipates a "permitted delete action", so this is arguably in-scope, but neither is a stated requirement.
- **Google OAuth sign-in and password reset** — `auth.js:61-72,214-296`.
- **Voice translation to English** — `POST /voice/translate`; FR-EXT-03 asks only for speech-to-text.

### Dead code and duplication

- **1,860 lines of orphaned pages.** `DashboardPage.jsx` (336), `VehicleServiceHistoryPage.jsx` (1,085), `VehicleProfileSelectionPage.jsx` (439) — zero imports anywhere in `src/`. `App.jsx:71-73` says the history page is kept "unrouted, for comparison"; that comparison is over.
- **`getMechanicSessionHistory` is defined twice**, identically, in `api/mechanicAccess.js:3-7` and `api/qrAccess.js:86-90`. Only the `mechanicAccess` copy is imported.
- **Two competing auth stacks.** Supabase Auth (live) alongside the legacy `PasswordHashingService` + `users.password_hash` + `/api/auth/register|login` (dead). The PBKDF2 implementation is well written — 120k iterations, per-password salt, constant-time compare (`PasswordHashingService.java:15-46`) — which makes it more tempting to leave in place than it deserves.
- **`…ForMockOwner` naming survives the mock owner.** `verifyVehicleBelongsToMockOwner`, `getDraftForMockOwner`, `getVehiclesForMockOwner`, `validateDraftForMockOwner` are thin aliases that delegate to the correctly-named `…ForCurrentUser` methods (`VehicleService.java:48-66`, `ServiceInputService.java:192-194`). Behaviour is correct; the names actively mislead anyone auditing whether ownership is enforced. 12 call sites.
- **Both `.claude/skills/` and `.agents/skills/` contain byte-identical copies** of the two Supabase skill packs (~40 files duplicated).
- **`AIExplanationService.operationText` and `buildWhyItMatters`** duplicate the same keyword ladder (oil/brake/tire/battery) with different inputs (`:136-155` vs `:227-249`), and `MechanicSearchService.semanticMatch:188-211` implements a third copy of the same taxonomy. Three places to update when a category changes.
- **`RegisterPage.jsx:156`** routes `ADMIN` users to `/dashboard`, which `App.jsx:68` redirects straight to `/`. Dead branch on a role no account can usefully hold.
- **Testing is thin and lopsided.** Six backend test classes, all clustered on extraction/classification/plausibility (`ServiceClassificationServiceTest`, `DraftPlausibilityServiceTest`, `GoldenExtractionTest` + golden fixtures, two OCR provider tests, `ServiceRecordServiceTest`). **Zero tests touch the sharing, mechanic-access, auth, history, or vehicle features** — i.e. every finding in this section is in untested code. No frontend tests exist at all.

---

## Highest-priority gaps

1. **Verify `session_token` on the mechanic endpoints.** The token is already generated, stored, and unique-indexed — it is simply never compared. Move it out of the URL path into a header or a cookie set at approval time, and stop returning the session id and token from the public status endpoint. This is the single highest-value change in the codebase and it closes S1, S2, and most of S3. *(`MechanicAccessService.java:123-125`, `MechanicAccessSessionResponse.java:24`, `QRAccessService.java:152-172`)*
2. **Add the missing receipt-column migration.** `receipt_storage_bucket`, `receipt_storage_path`, `receipt_original_filename`, `receipt_content_type` on both `service_drafts` and `service_records` exist in Supabase but in no migration file. With `ddl-auto=validate`, a rebuild from `database/migrations/` will not start. A defence panel that clones this repo cannot run it.
3. **Set `trevora.frontend-base-url` and document it.** Every QR code currently encodes `http://localhost:5173`, which no mechanic's phone can open. The share feature is undemonstrable off the dev machine until this is set, and CORS (`WebConfig.java:11-16`) only allows localhost origins, so it needs the same treatment for any real deployment.
4. **Delete `/api/auth/register` and `/api/auth/login`.** Unauthenticated, unthrottled, uncalled, and one of them writes to the users table.
5. **Stop trusting `user_metadata.role`.** Read the role from the `public.users` row the backend controls (it is already synced at `/api/auth/sync`) rather than from the token's client-writable metadata. Harmless today; a real hole the first time `ADMIN` means anything.
6. **Decide what FR-HAN-01 is.** The explanation feature is a keyword-matched template that reports `source: "template"`. If the paper says "AI-generated", either wire it to the OpenAI client already in the codebase or amend the SRS. Do not let a demo call it AI.
7. **Delete the 1,860 lines of orphaned pages and the duplicate API function** before anyone reads them as live code.
8. **Add tests to the sharing and mechanic-access features.** Every security finding above sits in code with no test coverage, while the well-tested part of the codebase (extraction) has no security surface at all.

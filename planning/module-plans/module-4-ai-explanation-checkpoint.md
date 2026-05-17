# Module 4 AI Explanation Checkpoint

Last updated: May 17, 2026

## 1. AI Explanation Status Summary

Module 4 Person B transaction 4.1 is implemented as an MVP. A vehicle owner can open a confirmed service record and view a template-generated explanation that helps them understand the saved service work.

The implementation uses confirmed `service_records` only. It does not read incomplete `service_drafts`, does not implement real AI provider integration, and does not implement QR sharing, owner approval, mechanic access, mechanic search, or authentication changes.

For MVP, explanations are generated on request and are not persisted. The generation logic is isolated in `AIExplanationService` so a real AI provider can replace the template generator later.

## 2. Completed Module 4 Person B Features

- Backend AI explanation controller.
- Backend AI explanation service boundary.
- Owner-role requirement before explanation access.
- Current-owner scoping for service record lookup.
- Vehicle ownership verification for the record's vehicle.
- Confirmed-record-only explanation generation using `service_records`.
- Template explanation generated from saved record fields.
- Fallback explanation behavior if generation fails.
- Frontend API helper for the explanation endpoint.
- Frontend `AIExplanationPanel` component.
- AI explanation panel added to the confirmed service record detail page.
- Original saved record details remain visible beside the explanation.
- Loading, error, retry, fallback, and regenerate UI states.

## 3. Transaction-by-Transaction Implementation Status

### 4.1 Show AI-Generated Service Explanation

Status: Complete for MVP.

Implemented by:

- Backend: `GET /api/service-records/{recordId}/ai-explanation`
- Controller: `AIController`
- Service: `AIExplanationService`
- DTO: `AIExplanationResponse`
- Repository support: `ServiceRecordRepository#findByRecordIdAndOwnerId`
- Frontend API: `api/aiExplanations.js`
- Frontend component: `AIExplanationPanel`
- Frontend page integration: `ServiceRecordDetailPage`

The owner opens an existing confirmed service record detail route from Module 3. The frontend requests an explanation for that `recordId`, the backend verifies owner access, loads the confirmed `ServiceRecord`, and returns a structured explanation.

## 4. Current Frontend Routes and Pages

Module 4 Person B uses the existing Module 3 detail route:

| Route | Page | Purpose |
|---|---|---|
| `/vehicles/:vehicleId/history/:recordId` | `ServiceRecordDetailPage` | Show original confirmed record details and the AI/template explanation. |

No new frontend route was added for Person B. This keeps the explanation attached to the confirmed service record detail view.

## 5. Current Frontend Components

New frontend pieces:

- `AIExplanationPanel`
- `api/aiExplanations.js`

Updated existing page/style files:

- `ServiceRecordDetailPage`
- `styles.css`

The detail layout now keeps the original saved record details on the left and shows the explanation panel plus source reference on the right, following the Module 4 design reference direction.

## 6. Current Backend Endpoint

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/service-records/{recordId}/ai-explanation` | Generate and return an owner-facing explanation for one confirmed service record. |

Response shape:

- `recordId`
- `vehicleId`
- `source`
- `fallback`
- `whatWasDone`
- `whyItMatters`
- `watchFor`
- `disclaimer`
- `generatedAt`

## 7. Current Backend Controllers, Services, Repositories, Entities, DTOs, and Enums

New controller:

- `AIController`

New service:

- `AIExplanationService`

New DTO:

- `AIExplanationResponse`

Updated repository:

- `ServiceRecordRepository`
  - Added `findByRecordIdAndOwnerId`

Existing entities used:

- `ServiceRecord`
- `VehicleProfile`
- `User`

Existing services used:

- `CurrentUserService`
- `VehicleService`

No new entity or repository was added because explanation persistence is not needed for this MVP slice.

## 8. Current Database Tables/Fields Used by Person B

Primary source table:

- `service_records`

Fields used for explanation generation:

- `record_id`
- `vehicle_id`
- `owner_id`
- `source_input_method`
- `service_date`
- `service_type`
- `odometer`
- `total_cost`
- `shop_name`
- `location`
- `parts_replaced`
- `labor_performed`
- `remarks`
- `field_metadata`
- `created_at`
- `updated_at`

Relationship/access tables:

- `vehicle_profiles`
- `users`

Traceability only:

- `service_drafts` through `service_records.draft_id`

No Module 4 Person B database migration was added.

## 9. Explanation Generation Behavior

The MVP generator creates three owner-facing sections:

- What was done
- Why it matters
- What to watch for

The template uses saved `ServiceRecord` fields such as:

- `serviceType`
- `partsReplaced`
- `laborPerformed`
- `remarks`
- `odometer`
- `totalCost`
- `shopName`
- `serviceDate`

The service contains simple maintenance-aware wording for common terms such as oil/filter, brakes, tires/wheels, battery/electrical, and inspection/diagnostic work. If no specific pattern is recognized, it returns a general explanation that still helps the owner understand the saved record.

## 10. Fallback Behavior

If template generation throws a runtime exception, `AIExplanationService` returns a fallback response instead of failing the whole page.

Fallback response behavior:

- Keeps the same `recordId` and `vehicleId`.
- Sets `source` to `template_fallback`.
- Sets `fallback` to `true`.
- Explains that the detailed explanation could not be generated.
- Directs the owner back to the original saved record details.
- Keeps the mechanic-judgment disclaimer.

Frontend fallback/error behavior:

- Shows loading while the request is in progress.
- Shows a retryable unavailable state if the request fails.
- Shows a fallback notice if the backend returned a fallback explanation.
- Keeps the original service record visible regardless of explanation state.

## 11. Access and Confirmed-Record Rules

Person B access behavior:

- Requires current user role `VEHICLE_OWNER`.
- Uses `CurrentUserService` for current owner context.
- Finds the record by `recordId` and current `ownerId`.
- Verifies the record's `vehicleId` belongs to the current owner.

Confirmed-record behavior:

- The endpoint reads from `service_records`.
- The endpoint does not read from `service_drafts`.
- The implementation relies on the Module 2 invariant that rows in `service_records` are validated and confirmed records.

## 12. How Person B Receives Data from Modules 2 and 3

Module 2 creates `service_records` when the owner confirms a valid draft.

Module 3 exposes confirmed records through:

- `/vehicles/:vehicleId/history`
- `/vehicles/:vehicleId/history/:recordId`

Person B attaches to the Module 3 detail page and requests the explanation by `recordId`. The original record details remain visible so the owner can compare the generated explanation with the saved facts.

## 13. Known MVP Limitations

- Real AI provider integration is not implemented.
- Explanations are not stored or cached.
- Regenerate currently requests a fresh template response, not a new AI model variation.
- No backend unit/integration tests specifically cover `AIExplanationService`.
- No frontend automated tests cover `AIExplanationPanel`.
- The template explanation is intentionally conservative and may be generic for uncommon service types.
- The `service_records` table has no explicit confirmed status column; the implementation depends on the Module 2 confirmation invariant.

## 14. Remaining Risks/Technical Debt

- If future code writes unvalidated rows directly into `service_records`, the explanation endpoint would treat them as confirmed.
- Real AI integration will need provider error handling, prompt/version tracking, and probably persistence or caching.
- The template generator is keyword-based and should not be treated as a diagnostic engine.
- The owner-facing disclaimer should remain visible when a real AI provider is added.

## 15. What Person C and Person D Should Not Break

Person C:

- Do not move AI explanation to `service_drafts`.
- Do not make QR/share access bypass current owner scoping.
- Do not remove `GET /api/service-records/{recordId}/ai-explanation`.
- Do not hide the original saved record details when adding QR/share approval UI.

Person D:

- Do not use owner history APIs directly for mechanic access.
- Do not expose AI explanations for unapproved records to mechanics.
- Do not replace deterministic Module 3 history/detail behavior with AI search.
- Do not query incomplete drafts for mechanic-facing explanations or search results.

Both:

- Keep using confirmed `service_records` as the source of truth.
- Preserve `recordId`, `vehicleId`, and owner/access scoping.
- Keep `AIExplanationService` as the boundary for future real AI provider integration.

## 16. Verification

Backend command:

```powershell
cd C:\Users\Julius Cesar Gamallo\Documents\Trevora Development\Trevora\backend\trevora-api
$env:JAVA_HOME="C:\Users\Julius Cesar Gamallo\.jdks\openjdk-25.0.2"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
$env:SUPABASE_DB_URL="jdbc:postgresql://aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres"
$env:SUPABASE_DB_USERNAME="postgres.bqardmkvbrfpbfmvmbgf"
$env:SUPABASE_DB_PASSWORD="<local password>"
.\mvnw.cmd test
```

Backend result:

- Passed.
- Maven compiled 60 source files with release 21.
- No test sources were present.

Frontend command:

```powershell
cd C:\Users\Julius Cesar Gamallo\Documents\Trevora Development\Trevora\frontend\trevora-web
npm run build
```

Frontend result:

- Passed.
- Vite production build completed successfully.

Runtime API smoke test:

- Confirmed vehicle: `bf11a399-94f8-4588-8295-04003c7b2cf7`
- Confirmed record: `959bcec1-4f82-4439-bc7c-ad10260a1e3a`
- Endpoint verified: `GET /api/service-records/959bcec1-4f82-4439-bc7c-ad10260a1e3a/ai-explanation`
- Response source: `template`
- Fallback: `false`
- Watch-for item count: `3`

Browser smoke test:

- Route verified: `/vehicles/bf11a399-94f8-4588-8295-04003c7b2cf7/history/959bcec1-4f82-4439-bc7c-ad10260a1e3a`
- Confirmed visible content:
  - `Record Details`
  - `AI Explanation`
  - `What was done`
  - `Why it matters`
  - `What to watch for`
  - `Source Reference`

## 17. Final Verdict

Module 4 Person B transaction 4.1 is complete for MVP.

Ready to commit with the implementation files and this checkpoint document after reviewing the working tree. The untracked design-reference screenshot can remain uncommitted unless the team wants to preserve it as a design artifact.

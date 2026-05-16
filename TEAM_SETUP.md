# Trevora Team Setup

This guide helps teammates run the current Module 1 MVP locally.

## Prerequisites

- Java 21
- Node.js 18 or newer
- npm
- Access to the shared Supabase project, or a local PostgreSQL database with the Module 1 migration applied

## Project Structure

- `frontend/trevora-web` - React + Vite frontend
- `backend/trevora-api` - Spring Boot API
- `database/migrations` - Supabase/Postgres SQL migrations
- `planning` - SDD context, module plans, and implementation checkpoints
- `frontend/design-reference` - design screenshots and route reference

## Database Setup

Apply the Module 1 migration to Supabase:

```sql
database/migrations/001_module_1_service_record_input.sql
```

The migration creates:

- `users`
- `vehicle_profiles`
- `service_drafts`

It also inserts the temporary Module 1 mock owner:

```text
00000000-0000-0000-0000-000000000001
```

## Backend Environment

Do not commit real database credentials. Set these values in your terminal before running the backend:

PowerShell:

```powershell
$env:SUPABASE_DB_URL='jdbc:postgresql://<host>:<port>/<database>?sslmode=require'
$env:SUPABASE_DB_USERNAME='<database-user>'
$env:SUPABASE_DB_PASSWORD='<database-password>'
```

Bash:

```bash
export SUPABASE_DB_URL='jdbc:postgresql://<host>:<port>/<database>?sslmode=require'
export SUPABASE_DB_USERNAME='<database-user>'
export SUPABASE_DB_PASSWORD='<database-password>'
```

The backend reads these variables from:

```text
backend/trevora-api/src/main/resources/application.properties
```

## Run Backend

From `backend/trevora-api`:

Windows:

```powershell
.\mvnw.cmd spring-boot:run
```

macOS/Linux:

```bash
./mvnw spring-boot:run
```

The API runs on:

```text
http://localhost:8080
```

## Run Frontend

From `frontend/trevora-web`:

```bash
npm install
npm run dev
```

The frontend runs on:

```text
http://localhost:5173
```

## Verify Builds

Backend:

```bash
cd backend/trevora-api
./mvnw test
```

Windows backend:

```powershell
cd backend/trevora-api
.\mvnw.cmd test
```

Frontend:

```bash
cd frontend/trevora-web
npm run build
```

## Module 1 Routes

- `/vehicles`
- `/service-input/:vehicleId`
- `/service-input/:vehicleId/manual`
- `/service-input/:vehicleId/receipt`
- `/service-input/:vehicleId/voice`
- `/service-drafts/:draftId`

Compatibility redirects are also preserved:

- `/`
- `/manual/:vehicleId`
- `/receipt/:vehicleId`
- `/voice/:vehicleId`
- `/drafts/:draftId`

## Current MVP Scope

Module 1 supports:

- Vehicle create/select
- Add Service Record method selection
- Manual draft creation
- Receipt upload draft creation with mocked OCR
- Voice transcript draft creation with mocked voice processing
- Structured ServiceDraft display

Module 1 intentionally does not implement:

- Real authentication
- Real OCR
- Real speech-to-text
- Receipt file storage in Supabase Storage
- Module 2 validation/correction/confirmation
- Module 3 service history consolidation
- Module 4 mechanic handoff

## Git Hygiene

Do not commit:

- `.env`
- `.env.*`
- `application-local.properties`
- `.tools/`
- `node_modules/`
- `dist/`
- `target/`
- `*.log`
- real Supabase credentials, API keys, or local machine paths

# Trevora

Trevora is a web-based vehicle service history system for service understanding and mechanic handoff.

## Tech Stack

- Frontend: React + JavaScript
- Backend: Spring Boot
- Database/Storage: Supabase
- Architecture: Client-server with layered backend design
- Backend pattern: Controller → Service → Repository → Domain Model/Entity

## Workspaces

- /planning — SRS, SDD, module plans, architecture decisions
- /backend — Spring Boot API, controllers, services, repositories, entities
- /frontend — React pages, components, routes, UI logic
- /database — schema, migrations, Supabase table design
- /docs — API contracts, implementation notes, developer documentation

## Routing

| Task | Go to | Read |
|---|---|---|
| Understand requirements or plan a feature | /planning | CONTEXT.md, relevant module plan |
| Build backend code | /backend | CONTEXT.md, /planning/module-plans |
| Build frontend code | /frontend | CONTEXT.md, /planning/module-plans |
| Design database tables | /database | CONTEXT.md, schema.md |
| Write API docs or update implementation docs | /docs | CONTEXT.md |

## Current Priority

Build Module 1: Service Record Input.

## Rules

- Follow the approved SDD structure.
- Keep implementation aligned with Controller → Service → Repository → Entity.
- Build MVP functionality first before UI polish.
- Do not implement Module 2, 3, or 4 unless explicitly asked.
- Manual entry must work even if OCR, speech-to-text, or AI services are unavailable.
- Receipt and voice input may use mocked processing for MVP, but the structure must allow real services later.

## Current Priority

Module 1 MVP is complete and pushed.

Module 2 MVP is complete and pushed.

Module 3 MVP is complete and verified.

Next priority:
Build Module 4: AI-Assisted Service Understanding and Mechanic Handoff.

## Module Ownership

Module 3 may be split as follows:

- Person A: 3.1 Link Validated Record to Vehicle Profile and 3.2 Organize Records Chronologically
- Person B: 3.3 Categorize Service Records and 3.4 View Unified Vehicle Service History

## Module 3 Important Rule

Module 3 must use confirmed `ServiceRecord` data created by Module 2. It must not display incomplete `ServiceDraft` records as vehicle history.

## Module 4 Starting Point

Module 4 may build on the verified Module 3 service history list and detail routes. Keep using confirmed `service_records`, preserve vehicle/owner scoping, and do not regress Module 1 input, Module 2 validation/confirmation, or Module 3 history behavior.

| Work on Module 3 service history | /planning | CONTEXT.md, module-plans/module-3-unified-vehicle-service-history.md |
| Build Module 3 backend | /backend | CONTEXT.md, module-plans/module-3-unified-vehicle-service-history.md |
| Build Module 3 frontend | /frontend | CONTEXT.md, module-plans/module-3-unified-vehicle-service-history.md |
| Update Module 3 database docs | /database | CONTEXT.md, module-plans/module-3-unified-vehicle-service-history.md |

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

Next priority:
Build Module 2: Service Data Validation and Correction.

## Module Ownership

- Module 2 Person A: Review Service Draft and Identify Missing/Flagged Fields
- Module 2 Person B: Correct Flagged/Incomplete Details and Confirm/Save Validated Record
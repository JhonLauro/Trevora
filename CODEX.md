# Trevora

Trevora is a web-based vehicle service history system for service understanding and mechanic handoff.

## Tech Stack

- Frontend: React + JavaScript
- Backend: Spring Boot modular monolith
- Database/Storage: Supabase
- Architecture: Client-server with feature-based backend packaging
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

## Backend Package Structure

The backend is organized as a modular monolith under `com.trevora.api`.
Each feature package owns its controller, service, repository, entity, DTO, and enum classes where practical, while shared cross-cutting code stays under `shared`.

| Package | Responsibility |
|---|---|
| `features.auth` | Supabase Auth profile sync, login/register fallback, current user resolution, users, roles, password hashing |
| `features.vehicle` | Vehicle profile ownership, creation, listing, retrieval |
| `features.serviceinput` | Module 1 service draft creation from manual, receipt, and voice input |
| `features.validation` | Module 2 draft review, validation, and correction |
| `features.servicerecord` | Confirming validated drafts into confirmed service records |
| `features.history` | Module 3 confirmed vehicle service history APIs |
| `features.ai` | Module 4 AI/template explanation for confirmed records |
| `features.sharing` | QR/share access request creation, owner approval, denial, expiration |
| `features.mechanicaccess` | Mechanic temporary read-only history and mechanic search |
| `shared.config` | Cross-feature Spring configuration |
| `shared.exception` | Global exception handling and shared exception types |
| `shared.security` | Reserved for future shared security filters/JWT helpers |
| `shared.util` | Reserved for future generic utilities/constants |

Keep the internal responsibility split intact: controllers handle HTTP, services hold business rules, repositories handle persistence, and entities preserve table/column mappings. Do not change endpoint URLs or database migrations as part of package-only refactors.

| Work on Module 4 planning | /planning | CONTEXT.md, module-plans/module-4-ai-service-understanding-mechanic-handoff.md |
| Work on authentication/access foundation | /backend and /frontend | CONTEXT.md, module-plans/module-4-ai-service-understanding-mechanic-handoff.md |
| Work on AI explanation | /backend and /frontend | CONTEXT.md, module-plans/module-4-ai-service-understanding-mechanic-handoff.md |
| Work on QR/access approval | /backend and /frontend | CONTEXT.md, module-plans/module-4-ai-service-understanding-mechanic-handoff.md |
| Work on mechanic read-only access/search | /backend and /frontend | CONTEXT.md, module-plans/module-4-ai-service-understanding-mechanic-handoff.md |


## Module 4 Starting Point

Module 4 may build on the verified Module 3 service history list and detail routes. Keep using confirmed `service_records`, preserve vehicle/owner scoping, and do not regress Module 1 input, Module 2 validation/confirmation, or Module 3 history behavior.

| Work on Module 3 service history | /planning | CONTEXT.md, module-plans/module-3-unified-vehicle-service-history.md |
| Build Module 3 backend | /backend | CONTEXT.md, module-plans/module-3-unified-vehicle-service-history.md |
| Build Module 3 frontend | /frontend | CONTEXT.md, module-plans/module-3-unified-vehicle-service-history.md |
| Update Module 3 database docs | /database | CONTEXT.md, module-plans/module-3-unified-vehicle-service-history.md |

## Current Development Status

Module 1 MVP is complete and pushed.
Module 2 MVP is complete and pushed.
Module 3 MVP is complete and pushed.

## Current Priority

Build Module 4: AI-Assisted Service Understanding and Mechanic Handoff.

Authentication/access foundation is part of Module 4 Person A because Module 4 requires owner/mechanic role separation. The MVP foundation now includes Supabase Auth signup/sign-in, backend profile sync, and legacy login/register fallback, while preserving the existing mock owner fallback for development safety.

## Module 4 Ownership

| Person | Scope | Main Responsibility |
|---|---|---|
| Person A | Authentication / Access Foundation | Supabase Auth signup/sign-in, profile sync, current user context, roles, mock owner compatibility |
| Person B | 4.1 AI Explanation | AI/template explanation for confirmed service records |
| Person C | 4.2, 4.3, 4.4 | QR/share access request, expiration, owner approval |
| Person D | 4.5, 4.6 | Mechanic read-only access and mechanic search |

## Module 4 Rules

- Use confirmed `service_records`.
- Do not expose incomplete `service_drafts`.
- Supabase Auth signup/sign-in and profile sync belong to Module 4 Person A for the MVP auth foundation.
- Supported MVP account roles are `VEHICLE_OWNER` and `ADMIN`. Mechanics do not register or sign in; they use owner-approved temporary QR/share links as guests.
- Vehicle owners use Modules 1-4 owner features.
- Mechanics use Module 4 mechanic access features only after owner approval.
- Keep mock owner fallback unless a real Supabase bearer token user or demo header user is active.
- Do not allow mechanics to edit records.
- Do not allow mechanic access before owner approval.
- Shared access must be temporary and scoped to one selected vehicle.
- AI may be mocked or template-generated for MVP if isolated behind service classes.
- QR may be implemented as a share link/token for MVP.

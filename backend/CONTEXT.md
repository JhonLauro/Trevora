# Backend Context

## Purpose

This workspace contains the Spring Boot backend for Trevora.

## Architecture

Use a layered backend design:

Controller → Service → Repository → Domain Model/Entity

## Backend Rules

- Controllers only handle HTTP requests and responses.
- Services contain business logic.
- Repositories handle database access.
- Domain models/entities represent system data.
- Do not put business rules directly inside controllers.
- Verify vehicle ownership before creating service drafts.
- All input methods must produce a ServiceDraft.
- Manual entry must work even if OCR, speech-to-text, or AI services are unavailable.

## Module 1 Backend Scope

Build only the backend needed for Module 1:

- Vehicle profile creation and selection
- Manual service draft creation
- Receipt-based service draft creation
- Voice-based service draft creation
- Structured service draft retrieval

## Suggested Packages

- controller
- service
- repository
- model
- dto
- enums
- config
- exception
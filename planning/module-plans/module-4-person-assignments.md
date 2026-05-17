# Module 4 Person Assignments

## Overview

Module 4 is split among four people:

| Person | Assignment | SDD Transactions |
|---|---|---|
| Person A | Authentication / Access Foundation | Supports Module 4 |
| Person B | AI Explanation | 4.1 |
| Person C | QR Access + Approval | 4.2, 4.3, 4.4 |
| Person D | Mechanic Read-Only Access + Search | 4.5, 4.6 |

---

## Person A — Authentication / Access Foundation

### Goal

Prepare the system to distinguish between vehicle owners and mechanics while preserving current mock owner compatibility.

### Main Responsibilities

- Current user context
- Role handling
- Owner/mechanic demo users
- Mock owner fallback
- Compatibility with Modules 1–3

### Should Not Do

- Do not implement AI explanation.
- Do not implement QR access.
- Do not implement mechanic history/search.

---

## Person B — AI Explanation

### Goal

Show an AI-generated or template-generated explanation for a confirmed service record.

### Main Responsibilities

- AI explanation backend service
- AI explanation endpoint
- AI explanation frontend panel
- Explanation fallback states

### Should Not Do

- Do not implement QR/share access.
- Do not implement mechanic approval.
- Do not implement mechanic read-only history/search.

---

## Person C — QR Access Request and Owner Approval

### Goal

Allow the owner to generate a share/QR access request and approve or deny mechanic access.

### Main Responsibilities

- Generate share token/access request
- Access expiration
- Mechanic request submission
- Owner approval/denial
- Create approved mechanic access session

### Should Not Do

- Do not implement mechanic read-only history display unless needed for integration.
- Do not implement mechanic search.
- Do not implement AI explanation.

---

## Person D — Mechanic Read-Only Access and Search

### Goal

Allow an approved mechanic to view temporary read-only service history and search approved records.

### Main Responsibilities

- Mechanic read-only history page
- Session validation
- Expiration handling
- Search within approved records only
- Mock/keyword AI-assisted search

### Should Not Do

- Do not allow mechanic editing.
- Do not bypass owner approval.
- Do not expose records from other vehicles.
- Do not expose service_drafts.
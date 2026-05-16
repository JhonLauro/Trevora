# Planning Context

## Project

Trevora is a web-based vehicle service history system for vehicle owners and mechanics/service personnel. The system helps vehicle owners capture, validate, consolidate, understand, and share maintenance and repair records.

## Approved Modules

1. Service Record Input
2. Service Data Validation and Correction
3. Unified Vehicle Service History Consolidation
4. AI-Assisted Service Understanding and Mechanic Handoff

## Current Focus

We are currently building Module 1: Service Record Input.

## Module 1 Goal

The vehicle owner must be able to create or select a vehicle profile before submitting a service record through one of three input methods:

1. Receipt image upload
2. Voice input
3. Manual entry

Regardless of input method, the system must create one structured ServiceDraft.

## Module 1 Transactions

1.1 Create or Select Registered Vehicle Profile  
1.2 Upload Receipt and Extract Details  
1.3 Record Voice Service Information  
1.4 Enter Service Details Manually  
1.5 Convert Input to Structured Service Entry  

## MVP Standard

The MVP should prove the end-to-end flow works. It does not need perfect UI, perfect OCR, or perfect speech-to-text.

The minimum working flow is:

Vehicle owner creates/selects vehicle  
→ chooses input method  
→ submits service information  
→ system creates ServiceDraft  
→ user can view structured ServiceDraft  

## What to Avoid

- Do not build advanced Module 2 validation yet.
- Do not build Module 3 history yet.
- Do not build Module 4 mechanic handoff yet.
- Do not over-polish UI before the flow works.
- Do not make receipt and voice flows completely separate from manual flow; all must create the same ServiceDraft structure.
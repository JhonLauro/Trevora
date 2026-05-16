# Database Context

## Purpose

This workspace contains Supabase database and storage design for Trevora.

## Current Focus

Module 1 database support.

## Required Tables for Module 1 MVP

- users
- vehicle_profiles
- service_drafts
- field_confidences

Optional for MVP:
- receipt_inputs
- voice_inputs
- manual_inputs

## Rules

- Each vehicle profile belongs to one user.
- Each service draft belongs to one vehicle profile.
- Each service draft must have an input method.
- Receipt, voice, and manual input must all map to service_drafts.
- Uploaded receipt images and audio files may be stored in Supabase storage, with file references saved in the database.
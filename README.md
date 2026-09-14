# KRYVELL ONE

**KRYVELL ONE — KRYV3LL-0N3 SYSTEM**  
by ACStudio · REDLINE NEXUS

Source-controlled baseline for the KRYVELL ONE application.

## Current modules

- REDLINE NEXUS — Nexus Control
- NEXARCANA — Tarot iPad français
- ACStudio — Character Forge
- NYXCORE AI
- KRYVELL LIVE CORE

## Security

Secrets are **not** stored in this repository. Runtime values such as `ACSTUDIO_AIRTABLE_PAT`, `ACSTUDIO_AIRTABLE_BASE_ID`, and `KRYVELL_OWNER_KEY` must be configured as server-side environment variables in the deployment platform. Secret values must never be committed to GitHub or returned to the browser.

## Deployment status

- Vercel project connected to this GitHub repository.
- Airtable runtime variable names configured in Vercel; secret values are not stored in GitHub.
- Owner-write authentication is implemented server-side and remains restricted to whitelisted draft actions; canon LOCK records are not exposed to unrestricted writes.
- This commit triggers a fresh Vercel deployment so the current serverless runtime can load the latest configured environment variables.

## Status

This repository starts the GitHub-managed source baseline for KRYVELL ONE. The original ChatGPT Sites deployment remains separate until the application is migrated and tested feature-by-feature.

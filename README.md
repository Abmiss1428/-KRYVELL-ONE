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

Secrets are **not** stored in this repository. Runtime values such as `ACSTUDIO_AIRTABLE_PAT` and `ACSTUDIO_AIRTABLE_BASE_ID` must be configured as server-side environment variables in the deployment platform.

## Deployment status

- Vercel project connected to this GitHub repository.
- Airtable runtime variable names configured in Vercel; secret values are not stored in GitHub.
- This commit triggers a fresh Vercel deployment so the current serverless runtime can load the configured environment variables.

## Status

This repository starts the GitHub-managed source baseline for KRYVELL ONE. The original ChatGPT Sites deployment remains separate until the application is migrated and tested feature-by-feature.

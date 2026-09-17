# KRYVELL × Vercel — Resilient Living PWA Proposal

Status: PREPARED — not sent externally.

## Objective
KRYVELL ONE / NYXCORE is a mobile-first artificial-life and AI workspace that combines a persistent local ecosystem, cloud AI, local PocketPal fallback, Supabase synchronization, Airtable control-plane data and Vercel-hosted production APIs.

We want to explore a technical collaboration with Vercel around resilient AI PWAs: an application that can remain usable on iPhone/iPad even when a deployment, network path or AI provider is unavailable.

## Proposed collaboration
1. **Recovery-first deployment architecture** — Preview deployments are validated before production, with a documented production rollback path.
2. **NYXCORE Safe Mode** — an explicit user-controlled emergency mode that saves the local state and suspends simulation, camera, voice, AI requests, synchronization and accelerated evolution without deleting the population.
3. **Observability** — use Vercel deployment/runtime observability to identify regressions that trigger a recovery recommendation.
4. **AI fallback architecture** — evaluate Vercel AI Gateway as an optional cloud routing layer while keeping PocketPal as the private on-device fallback.
5. **Mobile PWA case study** — KRYVELL can provide feedback on Safari/iPad performance, lazy loading, offline persistence and recovery UX.

## What ACStudio would ask from Vercel
- Technical architecture review for KRYVELL ONE / NYXCORE.
- Guidance on production rollback, preview-to-production promotion, observability and safe deployment patterns.
- If a partnership program is appropriate, discussion of infrastructure credits or support while the project moves from prototype to public beta.
- No requirement for Vercel to access private Airtable canon data or user camera/audio.

## What ACStudio can provide
- A real mobile-first test bed for resilient AI/PWA workflows.
- Detailed performance and recovery feedback from iPhone/iPad.
- A documented case study if both parties approve it.
- Reproducible examples of local-first + cloud-fallback architecture.

## Safety / privacy principle
Safe Mode is user-controlled. When activated it freezes the NYXCORE simulation, stops camera capture, voice activity, cloud/local AI requests, sync polling and accelerated evolution while preserving the last local snapshot.

## Current production baseline
- Hosting/runtime: Vercel
- Source: GitHub
- Control plane: Airtable
- Data/sync: Supabase
- Local AI fallback: PocketPal
- Cloud narrative AI: Gemini bridge
- Client persistence: IndexedDB

This document is a proposal draft only. It does not represent an agreement with Vercel.

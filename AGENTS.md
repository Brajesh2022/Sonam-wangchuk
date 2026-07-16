---
# AGENTS.md — Project Deployment Context

## How This Project Is Deployed

This project uses a split deployment architecture managed by FireVlyx.

## Frontend — Firebase Hosting
- Platform: Firebase Hosting
- URL: https://standwithsonam.web.app
- Deployed via: GitHub Actions (auto-triggers on push to main)
- Workflow file: .github/workflows/firebase-hosting-standwithsonam.yml
- Build command: none — static files
- Build output: .
- Config generated at deploy time (firebase.json + .firebaserc
  are NOT committed — the workflow creates them fresh each deploy)

## Backend API — Cloudflare Pages Functions
- No Cloudflare Functions detected in this project
- If you add functions/ later, re-run deployment in FireVlyx

## Project Type
- Detected: vanilla
- Framework: vanilla
- Node version: 20

## API URL Strategy
- No external API URL configured
- Add Cloudflare Functions and re-deploy via FireVlyx to configure

## Rules For AI Assistants Working On This Project
- NEVER add /api/** rewrites to firebase.json
- NEVER commit firebase.json or .firebaserc — workflow generates them
- NEVER commit dist/ or build output
- All API calls must use apiFetch() or relative /api/... paths
- To update the Cloudflare URL: re-deploy via FireVlyx
- functions/ folder is Cloudflare only — do not reference in Firebase config
- Push to main triggers BOTH deployments automatically

## Secrets & Environment
| Name | Where | Purpose |
|---|---|---|
| FIREBASE_SERVICE_ACCOUNT | GitHub Secret | Firebase deploy auth |
| VITE_API_URL | Baked at build time by workflow | Cloudflare Pages URL |

## Re-Deploying
- Code changes: just push to main — both platforms auto-deploy
- New Firebase site: use FireVlyx dashboard
- New Cloudflare URL: re-run deployment in FireVlyx
---
# Vercel Deployment Guide

## What this app needs on Vercel
InterviewGuru is not a plain static site. It needs:
- a React frontend build
- a serverless backend entrypoint for `/api/*`
- production environment variables in Vercel
- same-origin API calls from the frontend

Important: this repository is React/Vite, not Next.js App Router. Do not add `proxy.ts`, `app/layout.tsx`, or `@clerk/nextjs` here.

If any of those are missing, the app may work locally but fail on Vercel.

## Current deployment shape
The repo is set up as a single Vercel project with:
- frontend output in `build/`
- API routes served from `api/[...path].ts`
- backend logic reused from `backend/api/server.ts`
- frontend API calls using same-origin `/api/...`

This avoids cross-origin calls and avoids depending on a second Vercel deployment.

## Why local works but Vercel fails
Local works because your machine has:
- `.env` values loaded directly
- local dev proxy for `/api`
- your current backend process running on localhost

Vercel fails when:
- production env vars are missing
- the frontend points to the wrong API base URL
- the backend is still expected to live on another Vercel project
- the API route is not handled by a real serverless function

## Required files
These are the files that control deployment behavior:
- [vercel.json](../vercel.json)
- [api/[...path].ts](../api/%5B...path%5D.ts)
- [backend/api/server.ts](../backend/api/server.ts)
- [shared/utils/config.ts](../shared/utils/config.ts)
- [vite.config.ts](../vite.config.ts)
- [package.json](../package.json)
- [backend/migrations/](../backend/migrations/) (Postgres schema versions)

## Vercel settings
Use these project settings:
- Framework Preset: Other
- Build Command: `npm run build` (or `npm run db:migrate && npm run build` if you want schema applied on every deploy — requires `DATABASE_URL` in the Vercel **build** environment)
- Output Directory: `build`
- Install Command: default

### Database migrations on deploy
Schema is managed with **node-pg-migrate** (`npm run db:migrate`). The API **does not** auto-create tables anymore.

- **Option A — migrate during Vercel build:** set `DATABASE_URL` for builds and use  
  `npm run db:migrate && npm run build`  
  so each production deploy applies pending migrations once.
- **Option B — migrate manually:** run `npm run db:migrate` locally (or in CI) against your Neon database whenever you add a migration under `backend/migrations/`.

Do not add a custom `functions` block unless you are sure the function path matches a real file in `api/`.

## Vercel env vars
Set these in the Vercel project dashboard:

| Variable | Required | Example | Notes |
|---|---|---|---|
| `GROQ_API_KEY` | Yes | `gsk_...` | Used for transcription and analysis |
| `GEMINI_API_KEY` | Yes | `AIza...` | Used for TTS |
| `CLERK_SECRET_KEY` | Yes (prod) | `sk_live_...` / `sk_test_...` | Server verifies JWTs; ties usage to real users |
| `DATABASE_URL` | Yes (prod) | Neon pooler URL (recommended) or Supabase pooler `:6543` | Single Postgres for quotas and sessions |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes (prod UI build) | `pk_live_...` | Set at **build** time for the frontend project |
| `ABUSE_MAX_SIGNUPS_PER_IP_PER_DAY` | Optional | e.g. `3` | Limits new `ig_users` rows per IP / 24h |
| `VITE_API_URL` | Optional | empty or same-origin | Only set if you really need a custom backend URL |

### Copy-paste env block
Use this as the Vercel import template. Replace the placeholder values with your real production secrets.

```env
GROQ_API_KEY=gsk_your_groq_key
GEMINI_API_KEY=AIza_your_gemini_key
CLERK_SECRET_KEY=sk_test_or_live_...
DATABASE_URL=postgresql://...@ep-xxx.neon.tech/neondb?sslmode=require
VITE_CLERK_PUBLISHABLE_KEY=pk_test_or_live_...
ABUSE_MAX_SIGNUPS_PER_IP_PER_DAY=3
VITE_API_URL=
```

Notes:
- Keep `VITE_API_URL` empty for same-origin `/api` routing.
- Do not paste local `.env` values into Vercel unless they are production secrets.
- If you want a single-site deploy, this is the minimum set you need for the app to work.

### Custom domain note
If you are using a custom Vercel domain, the main thing to verify is that the domain is attached to the same Vercel project that serves the frontend and the `/api` routes.

Important:
- Do not rely on local `.env` for Vercel.
- Do not point the frontend at a separate backend deployment.

## Minimal Vercel flow
1. Push the repo to GitHub.
2. Import the repo into Vercel.
3. Set the env vars above.
4. Deploy.
5. Open the deployed frontend URL.
6. Test `/api/usage`, `/api/transcribe`, and `/api/analyze`.

## What the API path does
The frontend should call `/api/...` on the same domain.

Example:
- Frontend URL: `https://your-app.vercel.app`
- API URL: `https://your-app.vercel.app/api/usage`

That same-origin setup is what avoids CORS problems.

## Common failures and fixes

### 1. `DEPLOYMENT_NOT_FOUND`
Cause:
- the frontend is trying to proxy to an old Vercel project
- or the backend deployment URL is wrong

Fix:
- use the same Vercel project with `api/[...path].ts`
- remove any rewrite to a dead external project

### 2. `405 Method Not Allowed`
Cause:
- `/api/*` is being handled by the SPA fallback instead of a serverless function

Fix:
- make sure `/api/:path*` routes to `api/[...path].ts`
- keep the SPA fallback only for non-API paths

### 3. `500 Authentication failed`
Cause:
- stale deployment using an older build
- mismatched frontend/backend code
- missing `GROQ_API_KEY` or `GEMINI_API_KEY`

Fix:
- set Vercel env vars
- redeploy
- check backend logs

### 4. CORS error
Cause:
- frontend is calling a different domain directly

Fix:
- use same-origin `/api` calls
- let Vercel rewrite/proxy handle it

## Local vs Vercel behavior

### Local
- `npm run electron:dev` or `npm start`
- backend runs on localhost
- dev proxy handles `/api`
- `.env` is read directly

### Vercel
- frontend build is static
- backend must come from `api/[...path].ts`
- env vars must be configured in Vercel dashboard
- same-origin `/api` must be used

## Deployment checklist
- [ ] `vercel.json` points `/api` to the local serverless entrypoint
- [ ] `api/[...path].ts` exists
- [ ] `build/` is the output directory
- [ ] `GROQ_API_KEY` is set
- [ ] `GEMINI_API_KEY` is set
- [ ] frontend uses same-origin `/api`
- [ ] redeploy completed after env changes

## Recommended final setup
If you want the simplest stable deployment:
- keep frontend and backend in the same Vercel project
- use `api/[...path].ts` for serverless backend
- use same-origin `/api` calls from the frontend
- set all secrets in Vercel env vars
- do not keep a second backend Vercel project unless absolutely necessary

## Short answer
Local works because your local env and proxy are already correct.
Vercel fails when the production env vars or routing are wrong.
The fix is to keep the app in one Vercel project with the serverless API entrypoint and the correct production env vars.

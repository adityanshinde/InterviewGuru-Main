# InterviewGuru Project Knowledge (Codebase-Derived)

This document is a consolidated, engineering-focused map of how InterviewGuru works end-to-end: what it does, how the runtime pieces connect, what features exist in the shipped UI/API, what technologies are used, and how to build/deploy/package it.

It is derived primarily from the actual source code (not just marketing copy), and it links to existing deep-dive docs already in `docs/`.

## 1. What InterviewGuru Is

InterviewGuru is a stealth “AI copilot” intended for live technical interviews and meetings.

It has two main user-facing modes:

1. Voice mode: capture audio -> speech-to-text -> detect questions -> generate short, interview-ready bullets + a spoken 1–2 sentence answer.
2. Chat mode: user types a question -> structured multi-section answer (and code when appropriate), optionally streamed as a “preview” then a final structured payload.

It ships as:

1. Web app (Vercel): `build/` static output + `/api/*` serverless handler.
2. Desktop app (Electron on Windows/macOS): transparent always-on-top overlay + global hotkeys + system audio loopback capture (WASAPI loopback on Windows).

Primary entrypoints:

1. Frontend: [index.html](/index.html) -> `frontend/routes/main.tsx` -> `frontend/routes/App.tsx`.
2. Backend API: [backend/api/server.ts](/backend/api/server.ts) (Express + Vite middleware in dev; static in prod).
3. Desktop shell: [desktop/main/main.cjs](/desktop/main/main.cjs) (BrowserWindow config, IPC, capture, hotkeys, packaged env loading).

## 2. Repo Layout (What Lives Where)

Top-level directories (high signal):

- `frontend/`: React 19 UI (routes, overlay widget, hooks, providers, utils, styles).
- `backend/`: Express API, auth middleware, Postgres integration, usage/session tracking, migrations.
- `shared/`: Types, constants (plans), prompt builders, config helpers shared by frontend/backend.
- `desktop/`: Electron main/preload + packaging stubs for Windows builds.
- `api/`: Vercel serverless function entrypoint that forwards all `/api/*` traffic into the bundled Express app.
- `docs/`: Existing long-form guides and runbooks (deployment, desktop release, troubleshooting, security plans).

## 3. Tech Stack (As Implemented)

Frontend:

- React 19 + React DOM 19 (`react`, `react-dom`)
- React Router v7 (`react-router-dom`)
- Tailwind via `@tailwindcss/vite` and `@import "tailwindcss"` in CSS
- Motion library (`motion`)
- Icons (`lucide-react`)

Backend:

- Node.js (TypeScript) running via `tsx` in dev and bundled via `tsup` for production (`backend/api/server.cjs`)
- Express (`express`)
- Rate limiting (`express-rate-limit`)
- Postgres (`pg`) with migrations via `node-pg-migrate`

Auth:

- Clerk on both browser and server
  - Browser: `@clerk/clerk-react`
  - Server: `@clerk/express` (JWT/session middleware) + `@clerk/backend` (user lookups)

AI providers:

- Groq
  - STT: Groq Whisper (default `whisper-large-v3-turbo`) via `groq-sdk`
  - LLM: `llama-3.1-8b-instant` and `llama-3.3-70b-versatile` (configurable by request header)
- Google Gemini TTS: `@google/genai` (frontend calls for audio synthesis when enabled)

Caching / embeddings:

- Local embedding generation via `@xenova/transformers` (`Xenova/all-MiniLM-L6-v2`)
- In-memory vector cache + persistence to temp file: `os.tmpdir()/interviewguru_cache.json`

Desktop:

- Electron + electron-builder + NSIS installer
- Auto-updates: `electron-updater` (Windows Setup build; portable build does not auto-update)

Hosting / Deploy:

- Vercel: serves SPA build and forwards `/api/*` to serverless handler (`api/[...path].ts`)

## 4. Runtime Surfaces and How They Connect

### 4.1 Web (Vercel)

- The built SPA is output to `build/` (`vite.config.ts` sets `outDir: 'build'`).
- Vercel rewrites:
  - `/api/:path*` -> `api/[...path]`
  - everything else -> `/index.html` (SPA routing)
  See: [vercel.json](/vercel.json)

Serverless entrypoint:

- [api/[...path].ts](/api/[...path].ts) loads `backend/api/server.cjs` (built by `tsup`) and forwards each request to the Express app.

### 4.2 Local Development (Web + API)

Development is “Express-first” (not Vite-first):

- `npm run dev` -> `tsx watch backend/api/server.ts`
- Express creates a Vite dev server in `middlewareMode` and mounts it into the same HTTP server.
- HMR is attached to the same `httpServer` so it does not require port `24678`.
  See: `createServer({ server: { middlewareMode: true, hmr: { server: httpServer }}})` in [backend/api/server.ts](/backend/api/server.ts).

### 4.3 Desktop Development (Electron Overlay)

- `npm run electron:dev` runs [desktop/main/dev-launcher.cjs](/desktop/main/dev-launcher.cjs):
  1. Starts the backend (`npx tsx backend/api/server.ts`) with `NODE_ENV=development`
  2. Waits for `.interviewguru-dev-port` written by the server after binding (3000, 3001, …)
  3. Launches Electron pointed at `http://127.0.0.1:<port>/app`

### 4.4 Packaged Desktop (Electron)

Electron window loads one of two production strategies (see [desktop/main/main.cjs](/desktop/main/main.cjs)):

1. Remote web mode (recommended when you want Clerk “live” flows on a real domain):
   - Set `INTERVIEWGURU_WEB_APP_URL` in the packaged `.env`
   - Electron loads `https://<your-domain>/app`
   - Uses `contextIsolation: true` + preload bridge ([desktop/main/preload.cjs](/desktop/main/preload.cjs))
2. Embedded local server mode:
   - Electron requires `backend/api/server.cjs` and bootstraps it inside the app
   - Loads `http://127.0.0.1:<port>/app`
   - Sets `INTERVIEWGURU_USAGE_STORE` to a file under Electron `userData` so quotas/sessions persist without Postgres

Packaged env embedding:

- `npm run predist` runs [scripts/prepare-packaged-env.mjs](/scripts/prepare-packaged-env.mjs)
- Copies an env file into `desktop/packaging/.env`
- electron-builder bundles that `.env` into `resources/.env` (see `"extraResources"` in `package.json`)

## 5. Frontend Architecture (React)

### 5.1 Routes

Routes are defined in [frontend/routes/App.tsx](/frontend/routes/App.tsx):

- `/`: Landing page ([frontend/pages/LandingPage.tsx](/frontend/pages/LandingPage.tsx))
- Footer pages: `/docs`, `/api-reference`, `/blog`, `/faq`, `/privacy`, `/terms`, `/security`, `/contact`
- Auth routes (only when Clerk keys exist):
  - `/sign-in/*`
  - `/sign-up/*`
- `/app`: the actual product UI (the overlay widget)
  - When Clerk is configured: `SignedIn -> <OverlayWidget />`, else a sign-in gate
  - When Clerk is not configured at all: shows config-missing UI

### 5.2 Auth + API Headers

Frontend auth headers are injected via [frontend/providers/ApiAuthContext.tsx](/frontend/providers/ApiAuthContext.tsx):

- When Clerk is enabled and the user is signed in, API calls include `Authorization: Bearer <clerk-jwt>`.
- When Clerk is disabled (no key configured), the provider can run in “disabled” guest mode (no Authorization header).

### 5.3 Core UI: OverlayWidget

The product UI is the overlay widget:

- [frontend/components/OverlayWidget.tsx](/frontend/components/OverlayWidget.tsx)
- It coordinates:
  - Voice capture and transcription (STT)
  - Question detection and answer generation
  - Chat input and streamed answer rendering
  - Plan/quota display, settings, session tracking, and UI stealth controls (Electron)

The heavy logic is factored into hooks:

- [frontend/hooks/useTabAudioCapture.ts](/frontend/hooks/useTabAudioCapture.ts): capture + chunk audio, send to `/api/transcribe`.
- [frontend/hooks/useAIAssistant.ts](/frontend/hooks/useAIAssistant.ts): send transcripts to `/api/analyze` or `/api/analyze/stream`, debounce, manage “speaking” guard, optional Gemini TTS playback.
- [frontend/hooks/usePlanStatus.ts](/frontend/hooks/usePlanStatus.ts): poll `/api/usage` to show remaining quotas/features.
- [frontend/hooks/useSessionTracking.ts](/frontend/hooks/useSessionTracking.ts): `/api/sessions/*` start/update/close.

### 5.4 API Endpoint Construction

Same-origin by default:

- `shared/utils/config.ts` defines `API_ENDPOINT(path)` and uses `VITE_API_URL || ''`.
- On Vercel, this means browser calls hit the same domain: `/api/...`.

### 5.5 “BYOK” (Bring Your Own Key) on the Client

The UI may send an `x-api-key` header when allowed:

- [frontend/utils/optionalGroqApiKeyHeaders.ts](/frontend/utils/optionalGroqApiKeyHeaders.ts)
- In dev: allowed
- In prod: only allowed when `VITE_BYOK=true` at build time

This interacts with server-side enforcement (see §6.6).

## 6. Backend Architecture (Express API)

### 6.1 Server Entry and Environment Loading

Backend entry:

- [backend/api/server.ts](/backend/api/server.ts)

Env loading order:

- [backend/api/loadEnvFirst.ts](/backend/api/loadEnvFirst.ts) is imported first by `server.ts`
- Loads:
  1. root `.env`
  2. `frontend/.env` (non-overriding)
  3. `backend/.env` (overrides)

### 6.2 Dev vs Prod Serving

- Development: mounts Vite middleware (SPA served by Vite, with HMR on the same server)
- Production: serves `build/` as static assets and uses an SPA fallback `app.get('*', ...)` to `build/index.html`

### 6.3 Auth Model (Clerk + Guest Dev Mode)

Auth middleware is in [backend/middleware/authMiddleware.ts](/backend/middleware/authMiddleware.ts):

- `clerkAuthMiddleware` is global (must run before rate limiter key generation / getAuth).
- `/api/*` is protected by `authMiddleware`:
  - If Clerk is configured:
    - Requires a valid Clerk session (JWT)
    - Loads/syncs user data via [backend/services/clerkUserSync.ts](/backend/services/clerkUserSync.ts)
  - If Clerk is not configured:
    - In production: returns `503 auth_misconfigured` (sign-in required)
    - In non-production: creates a “guest_<hash>” identity derived from IP + user-agent

### 6.4 Rate Limiting

Burst limiter:

- [backend/middleware/rateLimiter.ts](/backend/middleware/rateLimiter.ts)
- Per-minute cap defaults to `API_RATE_LIMIT_PER_MINUTE` (clamped 20–500, default 180)
- Keys by:
  - `user:<clerkUserId>` when Clerk is available and user is signed in
  - else `ip:<hashed-ip>` for unauthenticated flows

### 6.5 Database Layer (Postgres + Fallback)

Postgres:

- Connection pool: [backend/services/database.ts](/backend/services/database.ts)
- Reads `DATABASE_URL` via [backend/config/database.config.ts](/backend/config/database.config.ts)
- Uses TLS by default (unless `DATABASE_SSL=false`)
- Handles Neon-specific URL quirks (removes `channel_binding`)
- Connection is initialized once via `waitForDatabase()` and then reused

Schema + migrations:

- Migrations live in `backend/migrations/` and are applied via `node-pg-migrate`
- Helper script: `npm run db:migrate` -> [scripts/run-db-migrate.mjs](/scripts/run-db-migrate.mjs)
- Baseline tables:
  - `ig_users`: plan, usage, billing period, Clerk environment, signup IP
  - `ig_sessions`: per-session records linked to `ig_users`
  See: [backend/migrations/1700000000000_baseline-ig-tables.js](/backend/migrations/1700000000000_baseline-ig-tables.js)

Fallback store (no DB configured or DB unavailable):

- [backend/storage/usageStorage.ts](/backend/storage/usageStorage.ts) keeps in-memory Maps
- In production desktop builds it also persists to disk:
  - Windows: `%APPDATA%/InterviewGuru/usage-store.json` (or Electron `userData` when embedded mode sets `INTERVIEWGURU_USAGE_STORE`)
  - Serverless (Vercel/Lambda): stays purely in-memory; real quotas require Postgres

### 6.6 Groq Key Handling (Server vs Client Key)

Server always supports `GROQ_API_KEY` (server-owned key).

Client “BYOK” is controlled by server settings in [backend/api/server.ts](/backend/api/server.ts):

- `BYOK_MODE=true`: accept user `x-api-key` in production (server key optional fallback)
- `ALLOW_CLIENT_GROQ_KEY=true`: accept user `x-api-key` in production even if BYOK_MODE is off
- Otherwise: in production, the server ignores `x-api-key` and requires `GROQ_API_KEY` on the server

### 6.7 Plans, Quotas, and Features

Plans and feature flags are defined in:

- [shared/constants/planLimits.ts](/shared/constants/planLimits.ts)

Quota enforcement happens on the server:

- `quotaMiddleware('voice'|'chat'|'session')` checks remaining quota and returns `402` when exceeded.
- `/api/transcribe`: consumes voice minutes
- `/api/analyze` and `/api/analyze/stream`: consume chat messages
- `/api/sessions/start`: consumes session quota

Frontend reads quotas/features from:

- `GET /api/usage` (see §7.5)

### 6.8 Vector Cache (Latency Reduction)

The server can pre-generate and locally embed likely interview questions:

- `POST /api/generate-cache`: gated by plan feature `cacheGeneration` and requires at least 8 chat messages remaining
- Uses:
  1. Groq to generate a list of questions from JD
  2. Groq to generate answer JSON + paraphrase variants for each question
  3. Xenova MiniLM embeddings for the main question and variants
- `POST /api/analyze` consults the in-memory `vectorCache` and returns a cache hit for similarity > ~0.82 (before calling the LLM pipeline)

Cache persistence:

- Stored to a temp file `interviewguru_cache.json` under `os.tmpdir()`

## 7. API Surface (Endpoints + Contracts)

All API endpoints are implemented in [backend/api/server.ts](/backend/api/server.ts) under `/api/*`.

Headers used by the frontend:

- `Authorization: Bearer <clerk-jwt>` (when Clerk enabled)
- `x-api-key: <groq_key>` (optional BYOK)
- `x-model: <groq chat model>` (chat model override)
- `x-voice-model: <groq whisper model>`
- `x-persona: <persona name>`
- `x-mode: voice|chat` (for analyze quota bucket selection)
- `x-answer-style: short|balanced|detailed`

### 7.1 GET /api/health

Shallow health returns `{ status: 'ok' }`.

Deep health (`?deep=1` or `HEALTH_CHECK_DB=true`) checks DB connectivity.

### 7.2 GET /api/cron/keep-warm

Intended as a scheduled “keep warm” ping.

- Secured via `CRON_SECRET`:
  - `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`

### 7.3 POST /api/transcribe

Speech-to-text (voice mode):

Request JSON:

```json
{
  "audioBase64": "...",
  "mimeType": "audio/webm",
  "audioChunkDuration": 5
}
```

Behavior:

- Writes chunk to a temp file, calls Groq Whisper transcription
- Filters common hallucination outputs (silence/background)
- Applies technical term corrections (e.g. “virtual dome” -> “virtual DOM”)
- Records voice usage minutes (ceil of chunk duration / 60)

Response JSON:

```json
{
  "text": "transcribed text (possibly empty)",
  "usage": {
    "voiceMinutesUsed": 1,
    "remainingMinutes": 12
  }
}
```

### 7.4 POST /api/analyze (Voice + Chat)

This endpoint serves both:

- Voice-mode question detection + bullet answer
- Chat-mode structured multi-section answers

High-level behavior:

1. Optional vector cache lookup (if enabled + cache populated)
2. If chat:
   - Classify question type + difficulty (unless in fast mode)
   - Build a strict JSON-only system prompt (sections + code fields)
   - Generate answer JSON with Groq
   - Optionally self-verify for hard/system-design (second model pass) and return corrected sections
3. If voice:
   - Run a voice-specific system prompt that returns bullets + a “spoken” field
   - Apply confidence guards to reduce false question detections

### 7.5 POST /api/analyze/stream (Chat SSE)

Streaming variant for chat UX:

- Uses Server-Sent Events (`text/event-stream`)
- Sends:
  - many `{ "type": "preview", "text": "..." }` payloads (best-effort extraction from partial JSON stream)
  - one `{ "type": "final", "data": { ...structuredAnswer } }` payload

Frontend consumer: `useAIAssistant.askQuestion()` in [frontend/hooks/useAIAssistant.ts](/frontend/hooks/useAIAssistant.ts).

### 7.6 POST /api/generate-cache

Precomputes a local answer cache from JD (plan-gated).

See §6.8.

### 7.7 GET /api/usage

Returns:

- current user’s plan tier
- computed quotas (used/limit/remaining/percent)
- feature flags from the plan
- trial days remaining (when applicable)

Frontend consumer: [frontend/hooks/usePlanStatus.ts](/frontend/hooks/usePlanStatus.ts).

### 7.8 POST /api/upgrade

Upgrades user plan.

Important guardrails:

- In production, requires `ALLOW_CLIENT_PLAN_UPGRADE=true` (prevents random plan escalation from the browser in a real billing setup).

### 7.9 Sessions

- `POST /api/sessions/start`: start a new session (quota enforced)
- `PUT /api/sessions/:sessionId`: update session counters
- `PUT /api/sessions/:sessionId/close`: close session
- `GET /api/sessions/active`: list active sessions
- `GET /api/sessions/history`: session history

Frontend consumer: [frontend/hooks/useSessionTracking.ts](/frontend/hooks/useSessionTracking.ts).

## 8. Desktop Overlay (Electron) Details

### 8.1 Window Model

In [desktop/main/main.cjs](/desktop/main/main.cjs), the overlay window is configured as:

- `frame: false`
- `transparent: true`
- `alwaysOnTop: true` (screen-saver level)
- `backgroundThrottling: false` (so audio/processing doesn’t stall)
- `setVisibleOnAllWorkspaces(true)`

Stealth features:

- Click-through mode via `setIgnoreMouseEvents(true, { forward: true })`
- “Screen share invisibility” via `setContentProtection(true)` (toggled by IPC)
- Hide from taskbar via `setSkipTaskbar(true)` (toggled by IPC)

### 8.2 System Audio Capture

Electron registers:

- `win.webContents.session.setDisplayMediaRequestHandler(...)`
  - selects the primary screen source
  - enables audio: `'loopback'`

The renderer uses `getUserMedia` / `getDisplayMedia` patterns and can request the screen source id via IPC (`invoke('get-source-id')`).

### 8.3 IPC Channels (Selected)

Exposed in preload (remote web mode) via [desktop/main/preload.cjs](/desktop/main/preload.cjs) and used by frontend via [frontend/utils/electronIpc.ts](/frontend/utils/electronIpc.ts):

- `resize-window`
- `window-minimize`
- `window-maximize-toggle`
- `set-stealth-mode`
- `set-skip-taskbar`
- `set-always-on-top`
- `update-hotkeys`
- `get-source-id` (invoke)
- `chat-input-focused` / `chat-input-blurred`
- `close-app` / `QUIT_NOW`

### 8.4 Global Shortcuts

Built-in defaults (main process):

- `Ctrl+Shift+Space`: focus chat input (stealth keyboard-only)
- `Ctrl+Shift+X`: toggle click-through
- `Ctrl+Shift+H`: hide/show overlay
- `Ctrl+Q`: emergency quit

## 9. Build, Packaging, and Deployment

### 9.1 NPM Scripts (Root)

See [package.json](/package.json):

- `npm run dev`: dev server (Express + Vite middleware)
- `npm run electron:dev`: dev desktop app (dev launcher)
- `npm run build`: build UI + bundle server
  - `build:ui`: `vite build` -> `build/`
  - `build:server`: `tsup` -> `backend/api/server.cjs`
- `npm run dist`: package Windows app (electron-builder)

### 9.2 Vercel

- `buildCommand`: `npm run build`
- `outputDirectory`: `build`
- `/api/*` is handled by `api/[...path].ts` which requires `backend/api/server.cjs`
  See: [vercel.json](/vercel.json)

### 9.3 Database Migrations

- Run: `npm run db:migrate` (requires `DATABASE_URL`)
- Files: `backend/migrations/*.js`

## 10. Configuration and Environment Variables (Practical Set)

This is a pragmatic list of env vars that show up in real code paths:

Core:

- `NODE_ENV`: controls dev/prod server behavior
- `PORT`: Express listen port for non-serverless runs

Auth (Clerk):

- `VITE_CLERK_PUBLISHABLE_KEY` and/or `VITE_CLERK_PUBLISHABLE_KEY_DEV` (frontend build/runtime)
- `CLERK_SECRET_KEY` and/or `CLERK_SECRET_KEY_DEV` (backend)
- `CLERK_PUBLISHABLE_KEY` (optional alternative to VITE_ key on server side)

Database:

- `DATABASE_URL`
- `DATABASE_SSL` (set to `false` to disable TLS)

Groq:

- `GROQ_API_KEY` (server key)
- `BYOK_MODE` (accept client `x-api-key` in prod)
- `ALLOW_CLIENT_GROQ_KEY` (accept client `x-api-key` in prod even if BYOK_MODE is off)

Analyze behavior:

- `ANALYZE_FAST_MODE` / `ANALYZE_FULL_PIPELINE`
- `ANALYZE_VECTOR_CACHE` (enable cache lookup in dev)
- `ANALYZE_CACHE` behavior is implicit in prod (vector cache enabled by default)

Plan upgrade:

- `ALLOW_CLIENT_PLAN_UPGRADE` (required in prod for `/api/upgrade`)

CORS / infra:

- `ALLOWED_ORIGINS` (comma-separated)
- `VERCEL_URL` (auto-provided on Vercel; used for allowlist)
- `CRON_SECRET` (protect `/api/cron/keep-warm`)
- `JSON_BODY_LIMIT` (default `25mb`)
- `API_RATE_LIMIT_PER_MINUTE`

Client build-time BYOK gate:

- `VITE_BYOK` (when true, the frontend may send stored `groq_api_key` as `x-api-key` in prod builds)

TTS:

- `GEMINI_API_KEY` (used client-side by `@google/genai` for TTS)

## 11. Existing Deep-Dive Docs Worth Reading

This repo already includes substantial docs. The ones that most directly complement this file:

- [docs/Interview-Guru.md](/docs/Interview-Guru.md): full formal spec-style document (behavior + UI + content inventory).
- [docs/FRONTEND_FEATURES_GUIDE.md](/docs/FRONTEND_FEATURES_GUIDE.md): route-by-route feature map of the UI.
- [docs/VERCEL_DEPLOYMENT_GUIDE.md](/docs/VERCEL_DEPLOYMENT_GUIDE.md): production deployment specifics.
- [docs/DESKTOP_BUILD_AND_RELEASE.md](/docs/DESKTOP_BUILD_AND_RELEASE.md): electron-builder/NSIS release process.
- [docs/DEV_TROUBLESHOOTING_RUNBOOK.md](/docs/DEV_TROUBLESHOOTING_RUNBOOK.md): known dev/Electron/Vite/Clerk failure modes and fixes.

## 12. Known Gaps (As of This Scan)

- No first-party automated test suite was found in the repo (only dependency tests under `node_modules/`).
- Most behavior verification is via manual runbooks and runtime smoke testing.

# InterviewGuru — Complete Codebase Analysis & Improvement Blueprint

_Last updated: 2026-04-29_

## 1) Executive Summary

InterviewGuru is a cross-surface AI interview assistant with:
- **Web app** (React + Vite)
- **Backend API** (Express + TypeScript)
- **Desktop overlay app** (Electron)

Its core workflow captures interview audio, transcribes it, analyzes question intent/difficulty, generates interview-quality answers, and returns UI-ready guidance in near real-time.

The architecture is practical and production-oriented: Clerk auth, plan/usage limits, optional BYOK for Groq, Postgres persistence with in-memory fallback, and Vercel-compatible serverless wrapping.

### Current maturity snapshot
- **Strengths:** complete end-to-end path, multi-platform delivery, auth + quotas, robust env-driven config.
- **Primary debt:** large multi-responsibility files (`backend/api/server.ts`, `frontend/components/OverlayWidget.tsx`), limited automated tests, and docs drift in a few places.

---

## 2) Product Purpose (What this app is)

InterviewGuru helps users during mock/live interviews by:
1. Listening to tab/system audio
2. Converting speech to text
3. Detecting if a meaningful question was asked
4. Generating concise or deep answers (voice/chat modes)
5. Tracking sessions, quota usage, and plan limits

It supports both browser and desktop overlay modes for stealth and convenience.

---

## 3) Repository Structure (Top-level)

```text
InterviewGuru/
├─ frontend/               # React app (UI routes, hooks, components)
├─ backend/                # Express API, middleware, services, storage
├─ desktop/                # Electron main process + preload + dev launcher
├─ shared/                 # Shared constants, types, config helpers
├─ api/[...path].ts        # Vercel serverless adapter to backend app
├─ docs/                   # Project documentation and runbooks
├─ package.json            # Scripts + dependencies + electron-builder config
└─ vercel.json             # Routing/build config for Vercel deployment
```

---

## 4) Runtime Surfaces & Entrypoints

## Web Runtime
- **Frontend entry:** `frontend/routes/main.tsx`
- **Route graph root:** `frontend/routes/App.tsx`
- **Backend API base:** same-origin `/api` by default, configurable via `VITE_API_URL`

## Backend Runtime
- **Primary app:** `backend/api/server.ts`
- Loads env, sets middleware, auth, quota checks, API handlers, static serving behavior.

## Vercel Runtime
- **Serverless bridge:** `api/[...path].ts`
- Forwards API calls into bundled backend server handler.

## Desktop Runtime
- **Main process:** `desktop/main/main.cjs`
- **Dev launcher:** `desktop/main/dev-launcher.cjs`
- **Renderer bridge:** `desktop/main/preload.cjs`
- Launches transparent always-on-top overlay window and manages IPC + shortcuts.

---

## 5) Frontend Architecture

## Core routing
`frontend/routes/App.tsx` handles:
- public pages (landing/footer content)
- auth pages (sign-in/up)
- protected app route (`/app`) containing `OverlayWidget`

## Core UI and state modules

### `frontend/components/OverlayWidget.tsx`
Primary orchestration layer for:
- mode switching (voice/chat)
- transcript + answer display
- settings toggles
- session controls
- Electron overlay controls

### `frontend/hooks/useTabAudioCapture.ts`
- Captures audio via browser media APIs or Electron IPC path
- Chunks and base64-encodes audio
- Calls `POST /api/transcribe`
- Handles silence skipping + rate-limit errors

### `frontend/hooks/useAIAssistant.ts`
- Debounces transcript/manual input
- Calls `POST /api/analyze` or `POST /api/analyze/stream`
- Handles stream previews + final answer hydration
- Optional Gemini TTS playback support

### `frontend/hooks/usePlanStatus.ts`
- Polls `GET /api/usage`
- Maintains plan, limits, feature flags, trial info in UI state

### `frontend/hooks/useSessionTracking.ts`
- Session lifecycle:
  - `POST /api/sessions/start`
  - `PUT /api/sessions/:id`
  - `PUT /api/sessions/:id/close`

### Utilities
- `frontend/utils/optionalGroqApiKeyHeaders.ts`: BYOK headers
- `frontend/utils/electronIpc.ts`: renderer-safe bridge for Electron APIs

---

## 6) Backend Architecture

## Main app file
`backend/api/server.ts` currently contains:
- middleware setup
- route definitions
- AI pipeline integration
- cache-related logic
- streaming response handling
- plan/usage interaction

This file is functional but too broad in responsibility.

## Middleware layer

### `backend/middleware/authMiddleware.ts`
- Clerk session auth
- user hydration/sync integration
- dev guest fallback behavior when Clerk not configured
- quota middleware by request type

### `backend/middleware/rateLimiter.ts`
- Express rate limiting
- keying by authenticated user ID or IP fallback

## Services layer

### `backend/services/clerkUserSync.ts`
- sync Clerk user profile to local persistence
- local email cache optimization
- signup abuse limiting

### `backend/services/database.ts`
- Postgres pooling/retries
- connection URL sanity checks
- schema readiness checks

## Storage layer

### `backend/storage/usageStorage.ts`
- usage counters + reset windows
- session persistence and updates
- DB-backed mode when available
- in-memory fallback mode
- optional local persistence path for desktop contexts

---

## 7) API Inventory (Implemented)

## Health / ops
- `GET /api/health`
- `GET /api/cron/keep-warm` (secret protected)

## AI
- `POST /api/transcribe`
- `POST /api/analyze`
- `POST /api/analyze/stream`
- `POST /api/generate-cache`

## Plan & usage
- `GET /api/usage`
- `POST /api/upgrade`

## Session lifecycle
- `POST /api/sessions/start`
- `PUT /api/sessions/:sessionId`
- `PUT /api/sessions/:sessionId/close`
- `GET /api/sessions/active`
- `GET /api/sessions/history`

---

## 8) End-to-End Data Flow

## Voice Interview Assistant flow
1. User starts listening in `OverlayWidget`
2. `useTabAudioCapture` captures + chunks audio
3. Frontend sends chunk to `POST /api/transcribe`
4. Backend writes temporary file, calls Groq Whisper, applies filtering/corrections
5. Transcript returns to frontend
6. `useAIAssistant` decides if question-worthy and triggers analyze endpoint
7. Backend runs analyze logic (cache lookup -> classification/prompting -> LLM generation)
8. Frontend renders answer and optionally plays TTS output
9. Usage quotas are updated server-side

## Session flow
1. Start session endpoint called
2. Question count/metadata updates during usage
3. Session close endpoint finalizes counts and state
4. History/active fetched for dashboarding

---

## 9) AI System Design

## STT
- Groq Whisper for transcript extraction
- Post-processing includes hallucination filtering and terminology correction

## Answer generation
- Groq Llama models used for response generation
- Chat mode includes question classification, adaptive prompts, and hard-question verification path
- Voice mode returns concise, speakable guidance format

## Streaming
- `POST /api/analyze/stream` returns progressive answer content + final structured payload

## BYOK
- Optional `x-api-key` header path from frontend local storage when enabled

---

## 10) Authentication, Authorization, and Quotas

## Authentication
- Clerk integrated on frontend and backend
- Backend validates Clerk session and resolves app user context
- Development fallback mode allows guest behavior if explicitly misconfigured/non-prod

## Authorization/limits
- Per-plan limits enforced server-side for:
  - voice usage
  - chat/analyze usage
  - session quotas

## Plan source
- Static config in `shared/constants/planLimits.ts`
- Runtime usage snapshots via `/api/usage`

---

## 11) Database & Migrations

## Database
- PostgreSQL via `pg`
- Core tables:
  - `ig_users`
  - `ig_sessions`

## Migrations
- Implemented with `node-pg-migrate`
- Migration scripts under `backend/migrations`

## Fallback behavior
- If DB not available, usage/session logic uses in-memory structures
- Suitable for local/dev resilience but not ideal for production consistency

---

## 12) Electron/Desktop Architecture

`desktop/main/main.cjs` responsibilities:
- Create transparent frameless always-on-top window
- Apply stealth-related toggles (click-through, skip taskbar, content protection)
- Register global shortcuts (focus/toggle/hide)
- IPC handlers for window/feature controls
- Launch app URL (remote or local embedded server target)

`desktop/main/preload.cjs` exposes minimal safe API to renderer.

`desktop/main/dev-launcher.cjs` automates local backend + Electron startup sequence.

---

## 13) Configuration & Environment Model

## Backend env (`backend/.env.example`)
Key categories:
- AI providers (`GROQ_API_KEY`)
- Clerk (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`)
- DB (`DATABASE_URL`)
- rate limit + upgrade guards
- BYOK and CORS controls

## Frontend env (`frontend/.env.example`)
Key categories:
- Clerk publishable key
- Gemini API key for TTS
- API base URL (`VITE_API_URL`)
- BYOK enablement flag

## Deployment
- `vercel.json` controls SPA + API routing
- docs include Vercel troubleshooting and setup sequence

---

## 14) Build, Scripts, and Packaging

From `package.json`:
- Dev scripts for frontend/backend and desktop runtime
- Build scripts compile frontend + backend
- DB migration scripts available
- Electron build config supports desktop packaging/distribution

---

## 15) Observed Risks / Gaps

## Code maintainability

1. `backend/api/server.ts` is too large and mixes concerns.
2. `frontend/components/OverlayWidget.tsx` is orchestration-heavy and hard to test.

## Testing gap

3. No strong automated test safety net detected (unit/integration/e2e).

## Docs drift
4. Some content pages/docs appear to mention routes/features not matching current implementation.

## Operational resilience
5. Fallback persistence strategy is useful, but production should strongly prefer durable DB path with clear fail behavior.

---

## 16) How to Make It Better (Priority Roadmap)

## Phase 1 — High ROI, Low Risk (do first)
1. **Split backend route modules**
   - Move AI, usage, sessions, health, and upgrade routes into isolated files.
   - Keep `server.ts` as composition/bootstrap only.
2. **Extract overlay state slices**
   - Break `OverlayWidget` into container + presentational sections + dedicated hooks.
3. **Create API contract doc from source of truth**
   - Generate/maintain endpoint table from actual handlers to prevent docs drift.
4. **Standardize error envelope**
   - Introduce uniform backend error response shape and frontend parser.

## Phase 2 — Quality & Confidence
5. **Add targeted tests**
   - Backend: auth middleware, quota checks, session lifecycle endpoints.
   - Frontend: hook tests for `useAIAssistant` and `useTabAudioCapture` behavior boundaries.
6. **Add request validation layer**
   - Validate payload schema for analyze/transcribe/session endpoints.
7. **Improve observability**
   - Add structured request IDs, latency logs, and per-endpoint error rates.

## Phase 3 — Scale/Platform hardening
8. **Formal storage strategy**
   - Gate fallback modes by environment and make production DB failure explicit.
9. **Cache strategy upgrade**
   - Define TTL and invalidation semantics for vector cache output quality.
10. **Desktop hardening**
   - Document security posture for IPC channels and preload exposure contracts.

---

## 17) Suggested Refactor Target Structure

```text
backend/
  api/
    server.ts
    routes/
      ai.routes.ts
      usage.routes.ts
      session.routes.ts
      health.routes.ts
      plan.routes.ts
    controllers/
      analyze.controller.ts
      transcribe.controller.ts
      session.controller.ts
    validators/
      analyze.schema.ts
      transcribe.schema.ts
```

```text
frontend/
  components/
    overlay/
      OverlayWidgetContainer.tsx
      OverlayHeader.tsx
      OverlayAnswerPanel.tsx
      OverlayControls.tsx
  hooks/
    assistant/
      useAIAssistant.ts
      useAnalyzeStream.ts
    audio/
      useTabAudioCapture.ts
```

---

## 18) Developer Runbook (Quick)

1. Configure `backend/.env` and `frontend/.env` from examples.
2. Install deps: `npm install`.
3. Run web+api dev flow via project scripts.
4. For desktop dev, use Electron launcher flow.
5. For DB-backed usage/session behavior, ensure `DATABASE_URL` is valid and migrations run.

---

## 19) Definition of “Better” for this codebase

A pragmatic target state in 2-3 iterations:
- Smaller, focused modules with clear ownership
- Reproducible API contracts and reduced docs drift
- Basic automated test coverage around critical flows
- Consistent, diagnosable runtime behavior in web and desktop
- Strict production posture around auth, quotas, and persistence

---

## 20) Appendix: Key Files Referenced

- `README.md`
- `package.json`
- `backend/api/server.ts`
- `backend/middleware/authMiddleware.ts`
- `backend/middleware/rateLimiter.ts`
- `backend/services/clerkUserSync.ts`
- `backend/services/database.ts`
- `backend/storage/usageStorage.ts`
- `backend/migrations/*`
- `frontend/routes/App.tsx`
- `frontend/components/OverlayWidget.tsx`
- `frontend/hooks/useAIAssistant.ts`
- `frontend/hooks/useTabAudioCapture.ts`
- `frontend/hooks/usePlanStatus.ts`
- `frontend/hooks/useSessionTracking.ts`
- `frontend/utils/optionalGroqApiKeyHeaders.ts`
- `frontend/utils/electronIpc.ts`
- `desktop/main/main.cjs`
- `desktop/main/dev-launcher.cjs`
- `desktop/main/preload.cjs`
- `api/[...path].ts`
- `shared/constants/planLimits.ts`
- `shared/types/index.ts`
- `shared/utils/config.ts`
- `docs/PROJECT_KNOWLEDGE.md`
- `docs/VERCEL_DEPLOYMENT_GUIDE.md`

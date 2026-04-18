# InterviewGuru Workspace Instructions

## Purpose
Use these instructions for all work in this repository. The codebase is a desktop AI assistant with a React frontend, an Express backend, and an Electron shell. When docs and code conflict, trust the current code layout and link to the authoritative docs instead of duplicating them.

## Canonical Layout
The current source of truth is:
- `frontend/` for the React app, routes, components, hooks, providers, pages, utilities, and styles.
- `backend/` for the Express API, auth, rate limiting, storage, database, services, and migrations.
- `desktop/` for Electron main-process code, preload, dev launcher, and packaging.
- `shared/` for code shared across frontend and backend, including constants, prompts, types, and utilities.
- `docs/` for longer setup, deployment, release, and troubleshooting guides.

Avoid reviving older paths such as `src/`, `server/`, or `electron/` unless you are working with compatibility wrappers that still exist on purpose.

## Start Here
If you need to understand a change end to end, inspect these files first:
- `frontend/routes/main.tsx` for React bootstrap and app providers.
- `frontend/routes/App.tsx` for routing and top-level app composition.
- `frontend/components/OverlayWidget.tsx` for the main interview UI and user flow.
- `frontend/hooks/useAIAssistant.ts` for question detection, analysis, and response generation.
- `frontend/hooks/useTabAudioCapture.ts` for audio capture and transcription.
- `backend/api/server.ts` for the Express API surface and request flow.
- `backend/middleware/authMiddleware.ts` for Clerk auth and quota enforcement.
- `backend/storage/usageStorage.ts` for usage/session persistence.
- `desktop/main/dev-launcher.cjs` for development startup orchestration.
- `desktop/main/main.cjs` for Electron window creation, IPC, and shortcuts.
- `shared/constants/planLimits.ts`, `shared/prompts/index.ts`, and `shared/types/index.ts` for shared business rules.

## Execution Flow
### Development
- `npm run electron:dev` is the main local workflow. It launches the backend and Electron together.
- `npm run dev` runs the backend only in watch mode.
- `npm run lint` runs TypeScript type-checking with no emit.

### Build and Release
- `npm run build` builds the frontend and bundles the backend.
- `npm run dist` prepares the packaged environment, builds everything, and runs Electron Builder.
- `npm run start:prod` and `npm run start:prod:win` are the production server entry points.
- `npm run db:migrate` and the related migration scripts are for database schema changes and should be treated as stateful operations.

## Runtime Flow
- React boots from `frontend/routes/main.tsx` and renders the app shell defined in `frontend/routes/App.tsx`.
- The primary user experience lives in `frontend/components/OverlayWidget.tsx`.
- Audio capture and transcript handling flow through `frontend/hooks/useTabAudioCapture.ts` into the backend transcription endpoint.
- Question detection, classification, generation, verification, and TTS orchestration live in `frontend/hooks/useAIAssistant.ts` and the backend API.
- The backend loads env first, then auth, rate limiting, storage, optional database access, and AI services.
- Electron handles the overlay window, click-through behavior, content protection, IPC, and global shortcuts.

## API and Auth Expectations
- Backend requests are Clerk-authenticated when auth is enabled. Respect the existing auth middleware and API auth context.
- API requests should use the existing helper patterns for Groq and optional auth headers instead of inventing new ad hoc request shapes.
- Keep quota and session accounting consistent with the shared plan limits and storage layer.
- Treat the backend as the source of truth for safety checks, rate limits, and persistence.

## Conventions
- Use the existing path aliases and shared modules instead of long relative imports.
- Keep components focused and prefer hooks for cross-cutting logic.
- Keep styling aligned with the existing Tailwind-first approach, and use co-located CSS only for complex motion or layout details.
- Preserve the current desktop overlay behavior: always-on-top, click-through by default, and content-protected during screen sharing.
- Prefer small, targeted edits over rewrites unless the task clearly requires a structural change.
- Do not introduce Redux or other global state libraries unless the user explicitly asks for them.

## Project-Specific Pitfalls
- System audio capture is Electron-focused; browser-only testing does not cover the main runtime.
- Dev startup depends on port coordination between the backend and Electron launcher.
- Clerk test and live credentials must match across browser and Node context.
- Vector cache behavior and quota resets are stateful; confirm persistence assumptions before changing them.
- The packaged backend has bundling exclusions, so avoid adding runtime imports that only exist in dev dependencies unless the build config supports them.
- If you touch database or migration code, treat it as stateful and validate carefully before running it.

## Documentation To Link, Not Duplicate
Use the docs below for detailed guidance instead of copying their content into instructions:
- `docs/Interview-Guru.md` for the authoritative product and architecture spec.
- `docs/DEPLOY_FROM_SCRATCH.md` for setup and environment bootstrap.
- `docs/DESKTOP_BUILD_AND_RELEASE.md` for packaging and release flow.
- `docs/CLERK_GOOGLE_AUTH_SETUP.md` for auth setup.
- `docs/DEV_TROUBLESHOOTING_RUNBOOK.md` for local debugging and environment issues.
- `docs/SECURITY_HARDENING_PLAN.md` for security-focused follow-up work.
- `docs/VERCEL_DEPLOYMENT_GUIDE.md` and `docs/VERCEL_FRONTEND_BACKEND_STEPS.md` for serverless deployment details.
- `docs/GROQ_PROMPT_CACHING_REFERENCE.md` for cache-related background and experimentation.

## Validation
Before finishing code changes, run the smallest useful validation set:
- `npm run lint` for TypeScript validation.
- The relevant build or dev command for the area you changed.
- Database migrations only when the task explicitly requires them.

## When In Doubt
- Inspect the current source of truth in code before making assumptions.
- Prefer linking to an existing document over restating it.
- Ask the user before making changes that affect persistent data, release packaging, or deployment state.

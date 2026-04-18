---
description: "Backend auth, quota, storage, and migration conventions for InterviewGuru."
applyTo: "backend/**"
---

# Backend Conventions

## Start Here
- `backend/api/server.ts`
- `backend/api/loadEnvFirst.ts`
- `backend/middleware/authMiddleware.ts`
- `backend/middleware/rateLimiter.ts`
- `backend/storage/usageStorage.ts`
- `backend/services/database.ts`
- `backend/services/clerkUserSync.ts`
- `backend/config/clerkKeys.ts`
- `backend/config/database.config.ts`
- `backend/migrations/*.js`
- `shared/constants/planLimits.ts`
- `shared/types/index.ts`

## Rules
- Load env first in any entry point that reads `process.env` during module initialization.
- Keep Clerk auth and guest fallback aligned across server, middleware, and storage.
- Enforce quotas through the existing middleware and shared plan limits, not ad hoc checks.
- Treat usage and session tracking as stateful; update persistence and reset logic together.
- Keep the database optional at runtime and preserve in-memory fallback behavior.
- Initialize database connectivity before serving routes that depend on it.
- Keep rate limiting identity-aware so authenticated users and guests are handled consistently.
- Run migrations explicitly and keep schema changes forward and backward compatible.
- Use shared types and constants instead of duplicating plan or session shapes.
- Preserve lazy-loading and startup performance in the API server.
- Keep config resolution in the dedicated config modules instead of scattering env logic.
- Prefer targeted changes to server routes and middleware over broad refactors.

## Common Pitfalls
- Skipping `loadEnvFirst` causes env-dependent modules to read undefined values.
- Clerk test/live key mismatches break auth and can look like random 401s.
- Database access is not guaranteed; code must keep working when persistence falls back to memory.
- Migrations are stateful; do not treat them like normal code edits.
- Quota recording and quota enforcement are different steps; both must remain in place.
- Avoid introducing new runtime dependencies that the packaged server cannot bundle.
- Do not assume the current server is always running inside Electron or always behind Vercel.

## Link Rather Than Repeat
- `docs/Interview-Guru.md`
- `docs/DEPLOY_FROM_SCRATCH.md`
- `docs/DEV_TROUBLESHOOTING_RUNBOOK.md`
- `docs/VERCEL_DEPLOYMENT_GUIDE.md`
- `docs/SECURITY_HARDENING_PLAN.md`

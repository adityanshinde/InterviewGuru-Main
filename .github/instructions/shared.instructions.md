---
description: "Shared constants, prompts, types, and cross-layer contracts for InterviewGuru."
applyTo: "shared/**"
---

# Shared Conventions

## Start Here
- `shared/constants/planLimits.ts`
- `shared/prompts/index.ts`
- `shared/types/index.ts`
- `shared/utils/`
- `frontend/hooks/useAIAssistant.ts`
- `backend/api/server.ts`
- `backend/storage/usageStorage.ts`

## Rules
- Treat shared code as the contract layer between frontend and backend.
- Keep plan limits, tier names, and quota-related constants in shared code instead of duplicating them elsewhere.
- Keep prompt builders pure and side-effect free; they should only shape model input strings or objects.
- Keep shared types stable and backward compatible because both runtime layers depend on them.
- Normalize data at the boundary before it reaches prompt builders or storage code.
- Avoid circular dependencies between shared modules.
- Keep utility helpers generic and environment-neutral.
- Prefer explicit unions and named types over magic strings and loose objects.
- Update consumers in frontend and backend when a shared contract changes.
- Treat shared changes as cross-layer changes that may require coordinated validation.
- Keep shared code free of Electron- or DOM-specific assumptions.
- Preserve the current prompt and quota schema shape unless the feature explicitly requires a contract change.

## Common Pitfalls
- Hardcoding plan limits in feature code instead of using shared constants creates drift.
- Changing prompt shapes without updating the backend validator breaks response parsing.
- Importing backend-only or frontend-only runtime dependencies into shared code creates bundle problems.
- Treating shared helpers as places for side effects makes cross-layer behavior harder to reason about.
- Introducing incompatible type changes without updating both consumers causes compile-time or runtime regressions.

## Link Rather Than Repeat
- `docs/Interview-Guru.md`
- `docs/DEPLOY_FROM_SCRATCH.md`

---
description: "Frontend React, Tailwind, and overlay UI conventions for InterviewGuru."
applyTo: "frontend/**"
---

# Frontend Conventions

## Start Here
- `frontend/routes/main.tsx`
- `frontend/routes/App.tsx`
- `frontend/components/OverlayWidget.tsx`
- `frontend/hooks/useAIAssistant.ts`
- `frontend/hooks/useTabAudioCapture.ts`
- `frontend/providers/ApiAuthContext.tsx`
- `frontend/styles/index.css`
- `frontend/pages/LandingPage.tsx`
- `frontend/pages/LandingPage.css`

## Rules
- Keep the `main.tsx -> App.tsx -> OverlayWidget` chain as the core bootstrap and runtime path.
- Prefer hooks for cross-cutting state and side effects; keep components focused.
- Use `ApiAuthContext` and its helpers for authenticated requests instead of ad hoc token plumbing.
- Keep Tailwind as the default styling tool; use co-located CSS only when motion or layout needs it.
- Preserve overlay behavior: always-on-top, click-through by default, keyboard-first interaction, and content-protection support.
- Treat Electron-only APIs as optional; guard them so browser preview still works.
- Use shared types and prompt builders when frontend logic depends on backend contracts.
- Keep audio capture and AI flows resilient to unmounts, rerenders, and stale refs.
- Read settings from localStorage carefully; when values are not reactive, refresh them explicitly.
- Do not introduce Redux or another global state system.
- Avoid mixing overlay and landing-page styling tokens.
- Keep copy, shortcuts, and empty/error states aligned with the current overlay UX.

## Common Pitfalls
- Browser testing does not cover Electron audio capture or IPC.
- Clerk config can disable auth in dev; do not assume auth is always enabled.
- TTS or audio playback can feed back into transcript capture if the speaking guard is removed.
- Custom CSS variables for the overlay do not automatically apply to landing-page styles.
- LocalStorage changes are not reactive unless the UI explicitly re-reads them.
- Do not import backend-only code into the frontend bundle.

## Link Rather Than Repeat
- `docs/Interview-Guru.md`
- `docs/DEV_TROUBLESHOOTING_RUNBOOK.md`

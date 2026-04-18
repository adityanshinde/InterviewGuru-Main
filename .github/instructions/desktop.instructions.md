---
description: "Desktop Electron main-process, preload, IPC, and packaging conventions for InterviewGuru."
applyTo: "desktop/**"
---

# Desktop Conventions

## Start Here
- `desktop/main/main.cjs`
- `desktop/main/dev-launcher.cjs`
- `desktop/main/preload.cjs`
- `package.json`
- `frontend/components/OverlayWidget.tsx`
- `frontend/hooks/useTabAudioCapture.ts`

## Rules
- Keep desktop code in CommonJS and preserve the current Electron main-process layout.
- Treat `desktop/main/main.cjs` as the source of truth for window creation, overlay behavior, IPC, and shortcuts.
- Keep the window frameless, transparent, always-on-top, and click-through by default.
- Preserve content protection behavior for screen sharing and the keyboard-first overlay workflow.
- Keep dev startup coordinated through `desktop/main/dev-launcher.cjs` and the backend port handoff.
- Use `preload.cjs` as the IPC boundary when the renderer needs a safe bridge.
- Keep IPC channels narrow and explicit; do not expose unrestricted renderer access.
- Preserve single-instance behavior, shortcut registration, and cleanup logic.
- Keep packaged environment loading and auto-update behavior aligned with the existing build config.
- Treat packaging changes as release-sensitive and validate them carefully.
- Preserve Electron-specific audio capture assumptions and fallback paths.
- Prefer small changes over desktop-wide rewrites unless the task requires a structural update.

## Common Pitfalls
- Browser assumptions do not hold for Electron windowing, IPC, or audio capture.
- Stale dev-port coordination can break `electron:dev` startup.
- Removing click-through or content protection breaks the overlay contract.
- Broad IPC exposure can create security and packaging problems.
- Desktop packaging depends on the existing `package.json` build config; do not invent a separate release path.
- System audio capture should be tested in the real Electron runtime, not only in the browser.

## Link Rather Than Repeat
- `docs/DESKTOP_BUILD_AND_RELEASE.md`
- `docs/DEV_TROUBLESHOOTING_RUNBOOK.md`
- `docs/Interview-Guru.md`

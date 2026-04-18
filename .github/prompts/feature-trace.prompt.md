---
description: "Trace a feature end to end before editing any InterviewGuru code."
---

# Feature Trace Before Editing

Trace the requested feature end to end before making changes.

## Required Inputs
- Feature name: {{FEATURE_NAME}}
- User request: {{USER_REQUEST}}

## Read Only Trace
1. Frontend entry points and UI state.
2. Backend route, middleware, storage, and migration flow.
3. Shared types, constants, and prompt builders.
4. Desktop IPC or Electron behavior if the feature touches the overlay.
5. Relevant docs to link instead of rewriting.

## Report Back First
- Files involved.
- Current data flow.
- Key dependencies and assumptions.
- Risks or side effects.
- Unknowns or blockers.

## Then Edit
Do not change files until the trace is complete and the impact is clear.

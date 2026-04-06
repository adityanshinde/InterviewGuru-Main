# InterviewGuru — Dev & Electron troubleshooting runbook

This document records **symptoms**, **root causes**, and **fixes** applied for local development, Electron (`npm run electron:dev`), Vite middleware mode, Clerk auth, and API latency. Use it when the same issues show up again.

---

## Table of contents

1. [Vite HMR WebSocket `ws://127.0.0.1:24678` — 400 / blank UI](#1-vite-hmr-websocket-ws12700124678--400--blank-ui)
2. [Vite config crash: `stripViteHmrClientPlugin is not defined`](#2-vite-config-crash-stripvitehmrclientplugin-is-not-defined)
3. [Clerk: `/api/*` returns `401` while the UI looks signed in](#3-clerk-api-returns-401-while-the-ui-looks-signed-in)
4. [Slow `/api/analyze` and repeated `/api/usage`](#4-slow-apianalyze-and-repeated-apiusage)
5. [Environment loading order (why `backend/.env` wins)](#5-environment-loading-order-why-backendenv-wins)
6. [Quick reference: env vars](#6-quick-reference-env-vars)
6a. [Vercel: `ENOENT` on `mkdir ~/.interviewguru`](#6a-vercel--serverless-enoent-on-mkdir-interviewguru)
7. [Files changed (reference)](#7-files-changed-reference)
8. [Desktop SEE-THROUGH slider does nothing (window stays opaque)](#8-desktop-see-through-slider-does-nothing-window-stays-opaque)

---

## 1. Vite HMR WebSocket `ws://127.0.0.1:24678` — 400 / blank UI

### Symptoms

- Console: `WebSocket connection to 'ws://127.0.0.1:24678/...' failed` / `Unexpected response code: 400`
- `[vite] failed to connect to websocket` / `WebSocket closed without opened`
- Electron or browser shows a **dark/empty** main area (assets or HMR client misbehaving)

### Root cause

Express runs Vite in **`middlewareMode`**. With misconfigured HMR, the client still tried to open a **separate** HMR port (often **24678**) while the real app is served on **3000–3010**. Nothing valid listens on that socket → **400** and broken dev experience.

Disabling HMR with `hmr: false` plus stripping `/@vite/client` was inconsistent and could break module resolution.

### Fix

1. In **`backend/api/server.ts`**, when creating the Vite dev server, attach HMR to the **same** `http.Server` as Express:

   ```ts
   server: {
     middlewareMode: true,
     hmr: { server: httpServer },
   },
   ```

2. In **`vite.config.ts`**, remove the custom “strip HMR client” plugin and **do not** set `server.hmr: false` for this workaround.

### If it happens again

- Confirm `server.ts` still passes **`hmr: { server: httpServer }`** (and that `httpServer` is the one that calls `.listen()`).
- Restart the dev server after edits.

---

## 2. Vite config crash: `stripViteHmrClientPlugin is not defined`

### Symptoms

- `failed to load config from .../vite.config.ts`
- `ReferenceError: stripViteHmrClientPlugin is not defined`
- `electron:dev` **hangs** waiting for the server (never writes `.interviewguru-dev-port`)

### Root cause

The helper **`stripViteHmrClientPlugin`** was removed from `vite.config.ts` but **`plugins`** still called **`stripViteHmrClientPlugin()`**, so Vite failed to load config.

### Fix

Ensure **`vite.config.ts`** `plugins` is only:

```ts
plugins: [react(), tailwindcss()],
```

### If it happens again

- Search the repo: `stripViteHmrClientPlugin` should have **zero** references.

---

## 3. Clerk: `/api/*` returns `401` while the UI looks signed in

### Symptoms

- `GET /api/usage` → **401**
- `POST /api/analyze` → **401** / “Sign in required”
- Clerk in the browser may show **development keys** and a valid session

### Root cause

- The **browser** uses **`VITE_CLERK_PUBLISHABLE_KEY_DEV`** (`pk_test_*`) on localhost.
- **`loadEnvFirst`** loads **`backend/.env` last with `override: true`**, so **`CLERK_SECRET_KEY`** often becomes **`sk_live_*`** (production).
- Session JWTs are issued by the **dev** Clerk instance but the API tried to verify or call Clerk with the **live** secret → **no `userId`** → **401**.

A second issue: **`@clerk/backend` `createClerkClient`** in **`clerkUserSync`** originally read only **`CLERK_SECRET_KEY`**, not the dev override, so **`users.getUser`** could target the wrong instance.

### Fix

1. **`backend/.env`** (local): set **`CLERK_SECRET_KEY_DEV=sk_test_...`** from the **same** Clerk **Development** application as **`VITE_CLERK_PUBLISHABLE_KEY_DEV`**. Keep **`CLERK_SECRET_KEY=sk_live_...`** for deploy if you want.

2. **Shared key resolution** lives in **`backend/config/clerkKeys.ts`**:

   - **`clerkSecretKeyForNode()`** — in non-production, prefers **`CLERK_SECRET_KEY_DEV`** when set.
   - **`clerkPublishableKeyForNode()`** — mirrors frontend dev/live publishable behavior.

3. **`authMiddleware`** passes **`publishableKey`** and **`secretKey`** into **`clerkMiddleware({ ... })`**.

4. **`clerkUserSync`** uses **`clerkSecretKeyForNode()`** for **`createClerkClient`**.

### If it happens again

- Verify **pairing**: `pk_test` + `sk_test` from the **same** Clerk app; `pk_live` + `sk_live` from the **same** app.
- Check **`backend/.env`** does not **strip** dev vars you need; remember **override** order (see [§5](#5-environment-loading-order-why-backendenv-wins)).
- Look for console warning about **`pk_test_*`** with **`sk_live_*`** mismatch.

---

## 4. Slow `/api/analyze` and repeated `/api/usage`

### Symptoms

- Network: **`analyze`** often **1–12s**; **`usage`** many times or multi-second.

### Causes and fixes

| Cause | What we did |
|--------|-------------|
| **Full chat pipeline** (70B + classifier + extra LLM rounds) | **`analyzeFastMode()`** returns **`true`** when **`NODE_ENV !== 'production'`** unless **`ANALYZE_FULL_PIPELINE=true`**. Production still uses fast mode when **`BYOK_MODE`** is on (unchanged intent). |
| **Global `NODE_ENV=production`** while developing | **`desktop/main/dev-launcher.cjs`** sets **`NODE_ENV: 'development'`** for the spawned **`tsx backend/api/server.ts`** process so Electron dev always hits the fast path + dev vector behavior. |
| **Vector cache embedding** loads **Xenova/transformers** (first hit very slow) | In **dev**, skip embedding lookup unless **`ANALYZE_VECTOR_CACHE=true`**. **Production** keeps cache lookup on. Helper: **`vectorCacheLookupEnabled()`** in **`server.ts`**. |
| **Parallel `/api/usage` + `/api/analyze`** each calling **`loadClerkUserForRequest`** | **In-flight dedupe** per **`clerkUserId`** in **`clerkUserSync`** so concurrent requests share one sync. |
| **Unstable `getToken`** reference → **`usePlanStatus`** refetch churn | **`ApiAuthContext`**: call **`getTokenRef.current()`** so **`getAuthHeaders`** does not depend on a changing **`getToken`** reference. |
| **`/api/usage` on every transcript change** | **`OverlayWidget`**: refetch quotas when **`answer`** updates (debounced), not on every **`transcript`** tick. |
| **Large Groq completions** | In fast mode, **`max_tokens`**: chat **1536**, voice **768** on **`/api/analyze`**. |

### Realistic expectations

- **`/api/analyze`** is still bound by **Groq latency**; **sub-second** every time is not guaranteed. **~1–4s** in fast mode is typical; spikes can be model/API load or **very long** resume/JD in prompts.
- **`/api/usage`** can still spike if **Postgres (e.g. Neon)** is **cold**.

### If it happens again

- Confirm Electron was started with **`npm run electron:dev`** (launcher forces **`NODE_ENV=development`**).
- Set **`ANALYZE_FAST_MODE=true`** on the API to force fast behavior in production-like envs.
- Set **`ANALYZE_FULL_PIPELINE=true`** only when you **want** the slow, richer pipeline.
- Set **`ANALYZE_VECTOR_CACHE=true`** in dev only if you **need** local cache embedding (accept slower first requests).

---

## 5. Environment loading order (why `backend/.env` wins)

**`backend/api/loadEnvFirst.ts`** (must stay imported first in **`server.ts`**):

1. Root **`.env`**
2. **`frontend/.env`** with **`override: false`** (does not overwrite existing keys)
3. **`backend/.env`** with **`override: true`** (**overwrites** keys present in that file)

Implications:

- **`CLERK_SECRET_KEY`** in **`backend/.env`** overrides a test secret loaded earlier from **`frontend/.env`**.
- **`VITE_CLERK_PUBLISHABLE_KEY_DEV`** survives if **`backend/.env`** does **not** redefine it — that’s why dev publishable can still be correct while secret was wrong until **`CLERK_SECRET_KEY_DEV`** was added.

---

## 6a. Vercel / serverless: `ENOENT` on `mkdir ~/.interviewguru`

### Symptoms

- Logs: `[usageStorage] Failed to persist usage store: ENOENT ... mkdir '/home/sbx_user1051/.interviewguru'`

### Cause

If **`DATABASE_URL`** is missing or the DB never connects, the API falls back to **file-backed** usage storage. On Vercel, the serverless filesystem **cannot** create directories under the sandbox home like a desktop app.

### Fix (code)

**`usageStorage`**: when **`VERCEL`** or **`AWS_LAMBDA_FUNCTION_NAME`** is set, **`memoryStorePath()`** returns **`null`** (no disk persist; in-memory only per instance) unless **`INTERVIEWGURU_USAGE_STORE`** is set explicitly.

### Fix (deployment)

Set **`DATABASE_URL`** on the Vercel project to your **Neon** (or other Postgres) URL and run **`npm run db:migrate`** so **`ig_users`** exists. Then **`isDBConnected()`** is true and usage uses Postgres — no file path involved.

### Neon + Vercel: `Connection terminated due to connection timeout`

Neon **cold start** (compute asleep) and **`channel_binding=require`** in the URL can make **node-pg** fail quickly on serverless.

**Code (already in repo):** strip **`channel_binding`** from the URL before connecting, use **60s** `connectionTimeoutMillis` on Vercel, and **3 retries** with backoff on transient errors.

You can also remove **`&channel_binding=require`** from **`DATABASE_URL`** in the Vercel UI and keep **`sslmode=require`**.

---

## 6. Quick reference: env vars

| Variable | Role |
|----------|------|
| **`VITE_CLERK_PUBLISHABLE_KEY_DEV`** | `pk_test_*` for localhost / Electron dev UI |
| **`CLERK_SECRET_KEY`** | Production / default secret (`sk_live_*` or `sk_test_*`) |
| **`CLERK_SECRET_KEY_DEV`** | `sk_test_*` for local API when **`CLERK_SECRET_KEY`** is live-only |
| **`ANALYZE_FAST_MODE`** | Force fast **`/api/analyze`** |
| **`ANALYZE_FULL_PIPELINE`** | Force slow pipeline (overrides dev default fast) |
| **`ANALYZE_VECTOR_CACHE`** | In dev, enable vector embedding cache path |
| **`NODE_ENV`** | **`development`** for local fast paths; launcher forces it for Electron dev server |

---

## 7. Files changed (reference)

| Area | Files |
|------|--------|
| Vite + Express HMR | `backend/api/server.ts`, `vite.config.ts` |
| Electron dev port / env | `desktop/main/dev-launcher.cjs`, `desktop/main/main.cjs` (port file `.interviewguru-dev-port` — mentioned elsewhere) |
| Clerk keys + middleware | `backend/config/clerkKeys.ts`, `backend/middleware/authMiddleware.ts`, `backend/services/clerkUserSync.ts` |
| Analyze latency | `backend/api/server.ts`, `backend/api/server.cjs` |
| Frontend auth + quotas | `frontend/providers/ApiAuthContext.tsx`, `frontend/components/OverlayWidget.tsx` |
| Examples / docs | `backend/.env.example`, `frontend/.env.example`, this file |
| Electron transparency | `desktop/main/main.cjs` |

---

## 8. Desktop SEE-THROUGH slider does nothing (window stays opaque)

### Symptoms

- Settings **SEE-THROUGH** is low (e.g. 21%) but the **desktop never shows through** — the window looks like a solid panel.
- User expects an **overlay** (see apps / wallpaper behind the UI).

### Root cause

The slider only changed **CSS alpha** on **`OverlayWidget`**’s root (`igRootStyle`). The **BrowserWindow** was still **`transparent: false`** with a solid **`backgroundColor: '#0b1220'`**. Electron paints that **opaque layer under the whole web view**, so the renderer’s transparency only blends with **that dark color**, not with the real desktop.

### Fix

In **`desktop/main/main.cjs`**, **`BrowserWindow`** options:

- **`transparent: true`**
- **`backgroundColor: '#00000000'`** (required on Windows when using transparency; see Electron docs)
- **`frame: false`** — Electron’s own [transparent-window](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles#transparent-windows) examples use **frameless** windows. On **Windows**, **`frame: true` + `transparent: true`** often still looks **fully opaque** because DWM composes a solid backing behind the native frame; apps like **Parakeet AI** use an **overlay-style frameless** window with a **custom drag region** (here: **`ig-topbar`** with **`-webkit-app-region: drag`**).

**Window controls**

- **Windows / Linux**: in-app **minimize**, **maximize/restore**, **close** (IPC **`window-minimize`**, **`window-maximize-toggle`**, existing quit/close).
- **macOS**: **`titleBarStyle: 'hidden'`** + **`trafficLightPosition`**; topbar gets **`ig-topbar-mac`** padding so content clears the traffic lights.

**Resize (frameless)**

- There is **no OS resize border** like a normal framed window. Use the **bottom-right corner grip**, or drag the **right** / **bottom edge strips** (IPC **`resize-window`**). If the window was **maximized**, **`resize-window`** first calls **`unmaximize()`** so **`setBounds`** applies.

Keep **`html, body, #root { background-color: transparent }`** in **`frontend/styles/index.css`** and the Electron **`igRootStyle`** / **`--ig-grid-opacity`** behavior as-is.

### If it happens again

- Confirm **`main.cjs`** keeps **`frame: false`**, **`transparent: true`**, and **`#00000000`** — not **`frame: true`** with transparency on Windows.
- Confirm **`preload.cjs`** allowlists **`window-minimize`** and **`window-maximize-toggle`** when using **remote web** (Option A).
- **Option A (remote URL)** in packaged builds: the **loaded site’s own CSS** may use an opaque `body` background — transparency only helps for the **local** `/app` UI you control.

**Note:** Parakeet AI is a commercial product; there is **no public source** for their stack. Public descriptions match a **frameless, always-on-top, translucent overlay** — same pattern as above, not a special Windows API we can copy verbatim.

---

## Changelog (summary)

- **Vite**: Middleware HMR bound to Express **`httpServer`**; removed strip-HMR plugin; fixed orphaned plugin reference.
- **Clerk**: **`CLERK_SECRET_KEY_DEV`**, shared **`clerkKeys`**, **`clerkMiddleware`** explicit keys, **`clerkUserSync`** uses same secret as JWT verification; in-flight user sync dedupe.
- **Latency**: Dev defaults to fast analyze; dev skips vector embedding unless opted in; **`max_tokens`** caps in fast mode; launcher forces **`NODE_ENV=development`**; stable **`getAuthHeaders`**; quota refetch tied to **`answer`**.
- **Electron overlay**: **`transparent: true`** + **`#00000000`** + **`frame: false`** (Windows needs frameless for real see-through); IPC window chrome; macOS traffic lights + **`ig-topbar-mac`** padding.

---

*Last updated: Electron transparency (§8), plus prior sessions on blank UI, WebSocket 400, Clerk 401, and analyze/usage slowness.*

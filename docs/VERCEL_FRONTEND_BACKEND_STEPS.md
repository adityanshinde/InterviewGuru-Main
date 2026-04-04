# Vercel — step by step (Frontend + Backend)

**Short note (Hindi / Roman Urdu):** GitHub pe push ho chuka hai to ab Vercel pe project banao. Is repo mein **frontend (Vite)** aur **backend (Express `/api`)** design ke hisaab se **ek hi Vercel project** ke andar chalte hain — alag deploy ki zarurat usually nahi. Neeche **Guide 1** wahi follow karo. Agar tum **do alag** Vercel projects chahte ho to **Guide 2 (advanced)** dekho.

---

## Guide 1 — Recommended: single Vercel project (front + back together)

InterviewGuru’s production shape:

| Layer | What Vercel does |
|--------|-------------------|
| **Frontend** | `npm run build` → static files in **`build/`** (Vite + `build:server` bundle used by the API path) |
| **Backend** | Requests to **`/api/*`** go to the serverless function **`api/[...path].ts`**, which runs your Express app |

Routing is defined in [`vercel.json`](../vercel.json). The browser should call **`/api/...` on the same domain** (e.g. `https://your-app.vercel.app/api/health`).  
**Do not set `VITE_API_URL`** in this setup (leave it empty).

---

### Part A — Frontend (Vite static output)

These steps configure how the **UI** is built and served.

1. Open [vercel.com](https://vercel.com) → **Add New…** → **Project**.
2. **Import** your GitHub repository (the one you already pushed).
3. **Framework Preset:** choose **Other** (the repo uses custom `vercel.json`).
4. **Root Directory:** leave as **`.`** (repository root).  
   - Do **not** set `frontend/` as root — the build expects the monorepo root (`vite.config.ts`, `api/`, `backend/`, etc.).
5. **Build Command:** should match `vercel.json` → **`npm run build`**  
   - This runs **`vite build`** (UI → `build/`) and **`tsup`** (server bundle for the API).
6. **Output Directory:** **`build`** (must match `vercel.json` → `outputDirectory`).
7. **Install Command:** default **`npm install`** is fine.

After first deploy, open your **`*.vercel.app`** URL — you should see the app shell.  
If the page loads but API fails, continue with Part B env vars.

---

### Part B — Backend (serverless `/api`)

The “backend” on Vercel is **not** a separate long-running server. It is the **Node serverless function** at **`api/[...path].ts`**.

1. **No second project needed** for normal use — rewrites already send `/api/*` → that function (see `vercel.json`).
2. After deploy, test:  
   **`https://YOUR-PROJECT.vercel.app/api/health`**  
   - Expect JSON like `{ "status": "ok" }`.
3. If you get **404** on `/api/*`, check:
   - Project root is repo root (not `frontend/`).
   - `vercel.json` is present on the branch you deploy.
   - Redeploy after fixing settings.

---

### Part C — Environment variables (both front + back use one project)

Add these in **Vercel → Project → Settings → Environment Variables** (at least **Production**).

**Backend / serverless (runtime)**

| Name | Required | Purpose |
|------|----------|---------|
| `GROQ_API_KEY` | Yes* | Transcribe + LLM (`*` or use client `x-api-key` in some flows) |
| `GEMINI_API_KEY` | Yes | TTS / Gemini usage |
| `CLERK_SECRET_KEY` | Yes for auth | Server verifies Clerk sessions |
| `DATABASE_URL` | Yes for prod DB | Postgres (Neon, etc.) |

**Frontend (baked in at `vite build` time)**

| Name | Required | Purpose |
|------|----------|---------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes for sign-in UI | Clerk in the browser |

**Same project, important:**

| Name | Value |
|------|--------|
| `VITE_API_URL` | **Leave empty** for same-origin `/api` |

Optional: `ABUSE_MAX_SIGNUPS_PER_IP_PER_DAY`, `API_RATE_LIMIT_PER_MINUTE`, etc. (see [`VERCEL_DEPLOYMENT_GUIDE.md`](./VERCEL_DEPLOYMENT_GUIDE.md)).

4. **Redeploy** after **any** change to `VITE_*` variables (Vite inlines them at build time).

---

### Part D — Database migrations (backend schema)

The API does **not** auto-create tables. Run migrations against the **same** `DATABASE_URL` you set in Vercel.

**Option 1 — Once from your PC**

1. Put `DATABASE_URL` in **`backend/.env`** (local, gitignored).
2. From repo root: **`npm run db:migrate`**.

**Option 2 — On every Vercel build**

1. Add `DATABASE_URL` to Vercel (Production).
2. Override **Build Command** to:  
   **`npm run db:migrate && npm run build`**

---

### Part E — Clerk + your Vercel URL

1. In **Clerk Dashboard**, add your production URL (e.g. `https://xxx.vercel.app`) to **allowed origins / redirect URLs** (exact names depend on Clerk’s UI).
2. Use matching **live** vs **test** keys for `CLERK_SECRET_KEY` and `VITE_CLERK_PUBLISHABLE_KEY`.

---

### Quick checklist (single project)

- [ ] Repo imported from GitHub, root = `.`
- [ ] Build: `npm run build`, output: `build`
- [ ] `/api/health` works on the deployment URL
- [ ] All env vars set; `VITE_API_URL` empty
- [ ] `npm run db:migrate` run at least once against production DB
- [ ] Clerk URLs include your `*.vercel.app` domain

---

## Guide 2 — Advanced: two separate Vercel projects (frontend only + API only)

Use this only if you **intentionally** want:

- **Project A:** static UI only  
- **Project B:** API only (`*.vercel.app` for backend)

This repo **can** work that way because `VITE_API_URL` overrides the API base (see [`shared/utils/config.ts`](../shared/utils/config.ts)) and the server allows cross-origin requests with credentials (see CORS in `backend/api/server.ts`). You must keep **Clerk** and **cookie / JWT** behavior correct for **two different domains** (stricter than same-origin — test sign-in end-to-end).

### Project B — Backend first (API)

1. **New Vercel project** → same GitHub repo, branch same as production.
2. **Root Directory:** **`.`** (still repo root — `api/[...path].ts` lives at root).
3. **Build Command:** you still need a build that produces what this repo expects. Easiest path: keep **`npm run build`** (same as monolith) even if you “only” care about API — **or** maintain a custom minimal build (more work, easy to break).
4. **Output Directory:** **`build`** (to match `vercel.json`; unused static files are acceptable for many teams).
5. Set **only server-side** secrets here: `GROQ_API_KEY`, `GEMINI_API_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL`, etc.
6. Deploy → note URL: **`https://your-api-project.vercel.app`**.
7. Test: **`https://your-api-project.vercel.app/api/health`**.

### Project A — Frontend (UI)

1. **Another new Vercel project** → same repo (or a fork — your choice).
2. **Root Directory:** still **`.`** if you use the same `vercel.json` and full build (simplest duplicate).
3. **Build Command:** `npm run build` (same).
4. **Output Directory:** `build`.
5. **Environment variables** must include:
   - `VITE_API_URL` = **`https://your-api-project.vercel.app`** (no trailing slash)
   - `VITE_CLERK_PUBLISHABLE_KEY` = same Clerk publishable key as you use for that environment
   - `GEMINI_API_KEY` if the browser bundle needs it (as in [`frontend/.env.example`](../frontend/.env.example))
6. **Also set** on Project A whatever `VITE_*` the UI needs at build time.
7. **Clerk:** allow **both** origins — your **frontend** `*.vercel.app` **and** your **API** origin if Clerk or redirects require it (follow Clerk docs for multi-domain).

**Caveat:** Two projects from one repo often means **two deploys per change** and duplicated env maintenance. Prefer **Guide 1** unless you have a strong reason.

---

## Related docs

- [DEPLOY_FROM_SCRATCH.md](./DEPLOY_FROM_SCRATCH.md) — Neon + Clerk + GitHub full reset flow  
- [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md) — env tables and common errors  

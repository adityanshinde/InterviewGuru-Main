# Deploy InterviewGuru from scratch (new GitHub, Vercel, Neon, Clerk)

This guide walks you through **removing old cloud resources**, **pushing this codebase to a new repository**, **creating fresh Neon + Clerk + Vercel**, and **wiring environment variables** so production matches how the app is built.

**Order matters:** create **Neon** and **Clerk** first (you need their URLs and keys before Vercel env is complete). **Vercel** comes after the repo exists on GitHub.

---

## What you will have at the end

| Piece | Role |
|--------|------|
| **GitHub** | Source of truth; Vercel deploys from it |
| **Neon** | Postgres (`DATABASE_URL`); usage, users, sessions |
| **Clerk** | Auth; `CLERK_SECRET_KEY` (server) + `VITE_CLERK_PUBLISHABLE_KEY` (browser build) |
| **Vercel** | Hosts the Vite `build/` + serverless `/api` via `api/[...path].ts` |

The app expects **same-origin** API calls: the browser talks to `https://your-app.vercel.app/api/...`, not a second backend URL. Keep `VITE_API_URL` empty unless you have a special split setup.

---

## Part 1 — Remove or archive old resources (optional but recommended)

Do this so you are not confused by stale domains, keys, or databases tied to an old repo name.

### 1.1 Vercel

1. Open [Vercel Dashboard](https://vercel.com/dashboard) → select the **old project**.
2. **Settings → General → Delete Project** (or archive if you prefer keeping history).
3. Note any **custom domains** attached; you will re-add them on the new project later.
4. If you use **Vercel Postgres** or other add-ons on that project, remove or migrate them before delete if the UI requires it.

### 1.2 Neon

1. Open [Neon Console](https://console.neon.tech).
2. Either **delete the old project** or **delete the branch** you no longer need (Neon uses projects/branches; pick what matches your old setup).
3. After deletion, **old `DATABASE_URL` values stop working** — anything still pointing at them will fail until you update env.

### 1.3 Clerk

1. Open [Clerk Dashboard](https://dashboard.clerk.com).
2. You can **delete the old application** (Applications → your app → danger zone) **or** create a **new** application and ignore the old one.
3. If you delete the app, all **old `pk_` / `sk_` keys** become invalid immediately.

**Tip:** For a clean slate, creating a **new Clerk application** with a clear name (e.g. `InterviewGuru Prod`) is often easier than hunting every redirect URL on an old app.

---

## Part 2 — New GitHub repository and push this code

### 2.1 Create an empty repo on GitHub

1. GitHub → **New repository** → name it (e.g. `InterviewGuru`).
2. Do **not** add a README/license if you already have them locally (avoids merge conflicts).
3. Copy the remote URL (HTTPS or SSH).

### 2.2 Point your local clone at the new remote and push

From your machine, in the project root (this repo):

```powershell
git remote -v
```

If `origin` still points at the old repo:

```powershell
git remote remove origin
git remote add origin https://github.com/YOUR_USER/YOUR_NEW_REPO.git
```

Push your current branch (usually `main`):

```powershell
git branch -M main
git push -u origin main
```

If GitHub shows a default branch other than `main`, align Vercel’s “Production Branch” with whatever you use.

---

## Part 3 — Neon (Postgres)

### 3.1 Create a project

1. Neon Console → **Create project**.
2. Pick a **region** close to your users or to Vercel’s region if you care about latency.
3. Note the default database name (often `neondb`).

### 3.2 Copy connection strings

Neon gives you several URLs. For **serverless / Vercel**, prefer the **pooled** connection string when Neon offers it (often labeled for serverless or includes pooling), with **`sslmode=require`**.

You need **one** value for the app: **`DATABASE_URL`**.

- Paste into a password manager; do not commit it to git.

### 3.3 Run migrations (before or on first deploy)

Schema is applied with **node-pg-migrate**, not auto-created at runtime.

**Option A — Run locally once (simplest)**

1. Put `DATABASE_URL` in `backend/.env` (gitignored).
2. From the **repository root**:

   ```powershell
   npm run db:migrate
   ```

3. Confirm success in the terminal (no migration errors).

**Option B — Run on every Vercel build**

- In Vercel, set **`DATABASE_URL`** for **Production** (and Preview if you use Preview DBs).
- Change the build command to:

  ```text
  npm run db:migrate && npm run build
  ```

  (Your repo’s `vercel.json` currently uses `npm run build` only; you can override **Build Command** in the Vercel project settings.)

See also: [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md).

---

## Part 4 — Clerk (authentication)

### 4.1 Create a Clerk application

1. Clerk Dashboard → **Create application**.
2. Choose sign-in methods you want (email, Google, etc.).

### 4.2 Copy API keys

From **API Keys** (or **Configure → API Keys**):

| Key | Where it goes |
|-----|----------------|
| **Publishable key** (`pk_...`) | Vercel env: `VITE_CLERK_PUBLISHABLE_KEY` — also `frontend/.env` for local Vite |
| **Secret key** (`sk_...`) | Vercel env: `CLERK_SECRET_KEY` — also `backend/.env` for local Express |

Use **production** keys for production Vercel; use **test** keys for local dev if you want isolation.

### 4.3 Allowed origins and redirect URLs (critical for Vercel)

After you know your Vercel URL (e.g. `https://interviewguru.vercel.app`):

1. Clerk → **Configure → Domains** (or **Paths / URLs** depending on Clerk UI version).
2. Add your **Vercel production URL** to allowed origins / front-end URLs as Clerk requires.
3. Set **redirect / callback URLs** for sign-in and sign-up to match your deployed origin (and `http://localhost:5173` or your local dev URL for local testing).

If these do not match, you will see **redirect loops**, **CORS-like errors**, or **401** on `/api` after login.

### 4.4 Backend behavior in this repo

- If **`CLERK_SECRET_KEY` is unset**, the API runs in **guest mode** (no real sign-in).
- If **`CLERK_SECRET_KEY` is set**, protected routes expect a **valid Clerk session** (JWT).

---

## Part 5 — Vercel (hosting)

### 5.1 Import the GitHub repo

1. Vercel → **Add New… → Project** → import the **new** GitHub repository.
2. Framework preset: **Other** (matches [vercel.json](../vercel.json)).
3. Confirm:
   - **Build Command:** `npm run build` (or `npm run db:migrate && npm run build` if you chose Part 3.3 Option B).
   - **Output Directory:** `build`
   - **Install Command:** default (`npm install`)

### 5.2 Environment variables (Production)

In **Project → Settings → Environment Variables**, add at least:

| Variable | Environment | Notes |
|----------|-------------|--------|
| `GROQ_API_KEY` | Production | Required for transcription / LLM unless client sends `x-api-key` |
| `GEMINI_API_KEY` | Production | TTS / client features that use Gemini |
| `CLERK_SECRET_KEY` | Production | Server-side Clerk |
| `DATABASE_URL` | Production | Neon URL; add to **Preview** too if previews should hit a DB |
| `VITE_CLERK_PUBLISHABLE_KEY` | Production | **Must be available at build time** for Vite |

Optional:

| Variable | Notes |
|----------|--------|
| `VITE_API_URL` | Leave **empty** for same-origin `/api` |
| `ABUSE_MAX_SIGNUPS_PER_IP_PER_DAY` | e.g. `3` — see backend usage |
| `API_RATE_LIMIT_PER_MINUTE` | Optional cap |

**Important:** `VITE_*` variables are **inlined when `vite build` runs**. After changing them, trigger a **new deployment**.

You can paste a block like this into Vercel (replace placeholders):

```env
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
CLERK_SECRET_KEY=sk_live_...
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_API_URL=
```

### 5.3 Deploy and verify

1. Deploy from the default branch.
2. Open the production URL.
3. Smoke tests:
   - `GET https://YOUR_DEPLOYMENT.vercel.app/api/health` → should return JSON ok.
   - Sign in (if Clerk is configured) and hit an authenticated endpoint (e.g. usage) from the UI.

---

## Part 6 — Local `.env` files (development)

Keep **secrets out of git**. Use the examples:

- [backend/.env.example](../backend/.env.example) → copy to `backend/.env`
- [frontend/.env.example](../frontend/.env.example) → copy to `frontend/.env`

**Local alignment:**

| File | Typical contents |
|------|------------------|
| `backend/.env` | `GROQ_API_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL`, `PORT` |
| `frontend/.env` | `VITE_CLERK_PUBLISHABLE_KEY`, `GEMINI_API_KEY`, `VITE_API_URL` (often empty) |

The server also loads a **root** `.env` first; `backend/.env` overrides duplicate keys (see root [.env.example](../.env.example)).

For local dev, if the Vite dev server proxies to Express, **`VITE_API_URL`** is often empty so calls go to `/api` on the same origin.

---

## Part 7 — Checklist (print-friendly)

**GitHub**

- [ ] New repo created; `origin` points to it; `main` (or chosen branch) pushed.

**Neon**

- [ ] New project/branch; `DATABASE_URL` copied.
- [ ] `npm run db:migrate` run successfully against that URL (local or CI/build).

**Clerk**

- [ ] New app; publishable + secret keys copied.
- [ ] Production URL (and localhost) allowed in Clerk URLs / domains.

**Vercel**

- [ ] Project connected to new GitHub repo.
- [ ] `GROQ_API_KEY`, `GEMINI_API_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY` set for Production.
- [ ] `VITE_API_URL` empty unless you intentionally use a separate API host.
- [ ] Build output `build`; rewrites unchanged in `vercel.json`.
- [ ] `/api/health` works on the live domain.

**Local**

- [ ] `backend/.env` and `frontend/.env` filled for dev (test keys OK).

---

## If something breaks

- **401 / “Sign in required”:** Clerk keys missing, wrong environment (test vs live), or frontend not sending session to same origin.
- **DB errors / missing tables:** Migrations not run; or wrong `DATABASE_URL`.
- **CORS / wrong API host:** Frontend calling another domain; prefer empty `VITE_API_URL` and same-origin `/api`.

More detail: [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md).

# Windows desktop (.exe) — build, GitHub Releases, website download

The app is an **Electron** wrapper around the same UI + an **embedded Express** server (`desktop/main/main.cjs` loads `backend/api/server.cjs`). Packaged users run everything **locally** on **`http://127.0.0.1:3000/app`** (port is fixed for Clerk; not the Vercel URL).

### End-user experience (normal app flow)

Users install the **NSIS Setup** build only — **no** `.env` file, no extra steps. At **your** build time, `npm run dist` copies **`backend/.env`** (production keys: Clerk, Neon, Groq/BYOK, etc.) into the installer as **`resources/.env`** (gitignored intermediate: `desktop/packaging/.env`). That file is **never committed**; only the built `.exe` / installer carries the values.

Optional: `INTERVIEWGURU_PACKAGING_ENV=path/to/prod.env npm run dist` to use a different env file than `backend/.env`.

**Clerk (one-time in dashboard):** add **`http://127.0.0.1:3000`** under allowed origins / redirect URLs for the desktop app.

**Auth parity with web:** Production API **does not allow guest usage**. The UI build must include **`VITE_CLERK_PUBLISHABLE_KEY`** (same as web). Portable `.exe` also embeds the same `resources/.env` when built this way.

**Option A (recommended for `pk_live`):** In `backend/.env` set **`INTERVIEWGURU_WEB_APP_URL=https://your-production-domain.com`** (no trailing slash). The packaged app then loads **`…/app`** from that URL instead of starting the embedded server, so Clerk sees your real HTTPS origin. **Deploy the website first** so that URL includes the latest frontend (preload IPC bridge). If `INTERVIEWGURU_WEB_APP_URL` is unset, the app falls back to the embedded `127.0.0.1` server (local / test keys).

---

## 1. Build on a Windows machine

1. Install **Node.js LTS** and clone the repo.
2. Put **production** values in **`backend/.env`** (or point `INTERVIEWGURU_PACKAGING_ENV` at another file). Without this, `npm run dist` stops with a clear error.
3. From the repo root:

   ```bash
   npm install
   npm run dist
   ```

   This runs **`prepare-packaged-env`** (copies env → `desktop/packaging/.env`), then **`npm run build`**, then **electron-builder**.

4. Output is under **`release/`** (folder is gitignored). You should see something like:
   - **`InterviewGuru-1.0.0-Windows-x64.exe`** — **portable** single file (good for “download and run” + GitHub).
   - **`InterviewGuru-1.0.0-Windows-x64.exe`** may also pair with an **NSIS installer** name pattern from electron-builder — check `release/` after the first build.

If `npm run dist` fails, install build tools (Windows may need **Python** / **VS Build Tools** for native deps; `pg` is usually prebuilt).

---

## 2. Publish to GitHub Releases

1. On GitHub, open **`adityanshinde/Interview-Guru`** (or your real repo).
2. **Releases → Draft a new release** → tag e.g. `v1.0.1`.
3. Upload the **portable `.exe`** from `release/` as a release asset. electron-builder usually names it like **`InterviewGuru 1.0.0.exe`** or **`InterviewGuru Setup 1.0.0.exe`** — check the `release/` folder after `npm run dist`.
4. **Stable website link (recommended):** also attach a **second copy** of the portable exe renamed to exactly **`InterviewGuru.exe`**. The landing page download button points to:

   `https://github.com/adityanshinde/Interview-Guru/releases/latest/download/InterviewGuru.exe`

   GitHub requires that filename to exist on **each** new release (re-upload `InterviewGuru.exe` every time, or change the site link to a versioned asset name).

---

## 3. Link from your website

In the landing page (or docs), point the download button to:

- **Per-version:** the `releases/download/vX.Y.Z/...` URL, or  
- **Latest:** `https://github.com/<owner>/<repo>/releases/latest/download/<exact-filename>`

Update the filename in **`frontend/pages/LandingPage.tsx`** when you change versioning.

---

## 4. Auto-updates (GitHub Releases)

**Who gets auto-updates?** Only users who installed the **NSIS Setup** build (e.g. `InterviewGuru Setup x.x.x.exe`), not the **portable** single `.exe`. On Windows, `electron-updater` is built for the installer flow; portable builds set `PORTABLE_EXECUTABLE_DIR` and the app skips the updater (those users download a new exe when you ship one).

**What you must do each release**

1. Bump **`package.json` → `version`** (e.g. `1.0.1` → `1.0.2`). The updater compares this to `latest.yml` on GitHub.
2. Build and **upload the update metadata + installer** to the same GitHub repo as in `package.json` → `build.publish` (`owner` / `repo`).
3. Easiest: from your machine (with a token that can upload release assets):

   ```bash
   set GH_TOKEN=ghp_your_token_here
   npm run dist:publish
   ```

   That runs `electron-builder --publish always`, which creates **`latest.yml`** and the **Setup** installer on the draft/latest release (or attaches to the version tag). **Never commit the token.**

   Manual alternative: run `npm run dist`, then on the GitHub Release attach **`latest.yml`** and the **`...Setup...exe`** from `release/` (names must match what `latest.yml` references).

4. **`InterviewGuru.exe`** (portable copy for the website) can still be uploaded separately for “download and run”; that path stays **manual** re-download for users.

**Runtime behavior:** On startup and about every **6 hours**, the installed app checks GitHub. If a newer version exists, it downloads in the background and installs **when the user quits** the app (Windows may show a SmartScreen prompt until you code-sign).

---

## 5. Security & trust (Windows)

- Unsigned builds show **SmartScreen** warnings. Long-term: **code signing** (paid cert).
- Some AV tools flag generic Electron/portable exes — expect occasional false positives; signing helps.

---

## 6. Desktop vs web (BYOK / Clerk / DB)

- **Web (Vercel):** Clerk, Neon, env on Vercel.
- **Desktop:** Embedded **local** API. It loads `.env` from the process **current working directory** when possible; packaged layout may differ. For a “full” cloud-backed desktop experience you’d document where to put `.env` or add a first-run settings screen — **not** the same as opening the hosted site in Electron.

For many users, desktop = **local Groq key (BYOK)** + optional local `.env` for advanced setups.

---

## 7. Checklist before announcing a public `.exe`

- [ ] Run `npm run dist` on a clean Windows machine once.
- [ ] Smoke-test: install/run portable, sign-in (if Clerk keys baked or configured), one chat + voice path.
- [ ] Upload to **GitHub Releases** and test the download link in an incognito window.
- [ ] Update website download href + release notes (changelog).

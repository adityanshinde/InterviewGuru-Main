# Step-by-step: Google sign-in with Clerk (InterviewGuru)

InterviewGuru uses **Clerk** for authentication. “Sign in with Google” is configured in **two places**: **Google Cloud Console** (OAuth client) and **Clerk Dashboard** (enable Google + paste credentials).

---

## Part 1 — Google Cloud Console

### 1.1 Open the right place

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a **new project** (or pick an existing one) from the project dropdown at the top.
3. Wait until the project is active.

### 1.2 OAuth consent screen (required once per project)

1. Menu → **APIs & Services** → **OAuth consent screen**.
2. Choose **External** (unless you use Google Workspace-only internal users).
3. Fill **App name**, **User support email**, **Developer contact email**.
4. **Scopes**: for Clerk’s Google sign-in, defaults are usually enough; add if Google asks for specific scopes later.
5. **Test users** (while app is in “Testing”): add your own Gmail address so you can sign in before publishing.
6. Save. If you need production for any Gmail user, later set **Publishing status** to **In production** and complete verification if Google asks for it.

### 1.3 Create OAuth 2.0 Client ID (Web)

1. Menu → **APIs & Services** → **Credentials**.
2. **+ Create credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. **Name**: e.g. `InterviewGuru Clerk`.

### 1.4 Redirect URIs (must match Clerk exactly)

Clerk will show you the exact redirect URLs. Add **every** URL Clerk lists for Google.

Typical pattern (your values will differ):

- Clerk-hosted / development-style redirect, often similar to:  
  `https://<something>.clerk.accounts.dev/v1/oauth_callback`  
  or your **custom Account Portal** domain, e.g.:  
  `https://accounts.<yourdomain>/v1/oauth_callback`  
  (Clerk’s UI shows the precise path — copy it.)

**How to get the exact URIs in Clerk**

1. Open [Clerk Dashboard](https://dashboard.clerk.com) → your application.
2. Go to **User & Authentication** → **Social connections** (or **SSO / OAuth** depending on Clerk’s menu).
3. Open **Google** and expand **Configuration** / **Advanced** / **Redirect URLs** (wording varies).
4. Copy **Redirect URI** or **Authorized redirect URI** values Clerk displays for Google.

Paste each of those into Google’s **Authorized redirect URIs** (one per line).

### 1.5 Authorized JavaScript origins (recommended)

In the same OAuth client, under **Authorized JavaScript origins**, add origins you use in the browser, for example:

- Your production site: `https://your-app.vercel.app`
- Custom domain if you use one: `https://www.yourdomain.com`
- Local dev: `http://localhost:5173` (or whatever port Vite uses)

Do **not** put trailing slashes. Use `https` in production.

### 1.6 Save and copy secrets

1. Click **Create**.
2. Copy the **Client ID** and **Client secret** (you will paste them into Clerk).  
   Store the secret safely; you cannot view it again later without resetting.

---

## Part 2 — Clerk Dashboard

### 2.1 Enable Google

1. [Clerk Dashboard](https://dashboard.clerk.com) → select your **InterviewGuru** application.
2. **User & Authentication** → **Social connections** → **Google**.
3. Turn **Google** **on**.

### 2.2 Paste Google credentials

1. Paste **Client ID** from Google into Clerk’s **Client ID** field.
2. Paste **Client secret** into Clerk’s **Client secret** field.
3. Save.

Clerk stores these server-side; you do **not** add Google’s client secret to `VITE_*` in Vercel.

### 2.3 Align environments (Development vs Production)

Clerk often has **Development** and **Production** instances (or keys).

- Use a **Google OAuth client** whose redirect URIs include **both** Clerk dev and prod callback URLs if you test locally and deploy.
- Or create **two** OAuth clients in Google (dev + prod) and configure each Clerk instance with the matching pair.

If redirect URIs don’t match, Google shows **redirect_uri_mismatch**. If Client ID never reaches Google, you see **missing client_id** / **invalid_request**.

---

## Part 3 — Your app (InterviewGuru) checklist

These should already be set for Clerk to work; Google adds no new env vars for the basic flow.

| Where | Variable |
|--------|-----------|
| Vercel (and local `frontend/.env`) | `VITE_CLERK_PUBLISHABLE_KEY` |
| Vercel (and local `backend/.env`) | `CLERK_SECRET_KEY` |
| Optional | `VITE_API_URL` empty for same-origin `/api` |

After changing `VITE_*`, **redeploy** so the frontend rebuilds.

---

## Part 4 — Google Cloud: enable the right API (if Google asks)

Usually **Google+ API** is not required for basic profile login; Clerk handles scopes. If Google Console shows errors about disabled APIs, enable **Google People API** or follow the link Google provides in the error.

---

## Part 5 — Quick test

1. Open your app → **Sign in** → **Continue with Google**.
2. You should get Google’s account picker, then return to your app signed in.
3. If it fails, open the **exact** error on `accounts.google.com` and match it to the table below.

---

## Common errors

| Symptom | Likely fix |
|---------|------------|
| **Missing required parameter: client_id** | Google provider in Clerk not saved, or wrong instance (dev vs prod). Re-open Clerk → Google and confirm Client ID is set. |
| **Error 400: redirect_uri_mismatch** | Redirect URI in Google Cloud must **exactly** match Clerk’s callback URL (scheme, host, path, no extra slash). |
| **Access blocked: app not verified** | OAuth consent screen still **Testing**; add your Gmail as a **test user**, or publish the app (may need verification). |
| **Sign-in works locally but not on Vercel** | Production Clerk keys on Vercel; production redirect URIs added in Google OAuth client; custom domain `accounts.*` verified in Clerk if you use it. |

---

## Official references

- [Clerk: Google social connection](https://clerk.com/docs/authentication/social-connections/google) (exact menu names and screenshots update over time — use this as the source of truth for redirect URL format).
- [Google: Setting up OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)

---

## Summary

1. **Google Cloud**: OAuth consent screen → **Web** OAuth client → **Authorized redirect URIs** = Clerk’s Google callback URLs → copy **Client ID** + **Client secret**.
2. **Clerk**: Enable **Google** → paste **Client ID** + **Client secret** → save.
3. **InterviewGuru**: Keep `VITE_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` correct; redeploy after changes.

That completes Google authentication for Clerk end-to-end.

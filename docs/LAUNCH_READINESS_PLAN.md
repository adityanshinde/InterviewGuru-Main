# Launch readiness plan — InterviewGuru (public beta)

This document turns “get ready for launch” into ordered work you can assign, verify, and sign off. Adjust dates and owners in your tracker; keep this file as the source of truth for scope.

---

## 0. Define the launch you are doing

Pick **one** primary mode so engineering, legal, and messaging align.

| Mode | Billing | User expectation | Minimum bar |
|------|---------|------------------|-------------|
| **A. Free public beta** | No charges | Free tier + clear limits | Monitoring, abuse caps, honest Privacy/Terms |
| **B. Paid beta** | Checkout + webhooks | Paywall matches product | Stripe or Clerk Billing + DB sync + receipts |
| **C. Invite-only beta** | Optional | Waitlist / codes | Same as A or B, plus signup gate |
| **D. BYOK beta** | Users bring **Groq** key | No platform Groq bill; users get key from [console.groq.com](https://console.groq.com) | `BYOK_MODE` + `VITE_BYOK`, Privacy mentions key handling, XSS/CSP awareness |

**Current product direction:** **D — BYOK** (users paste Groq API key in app settings; optional server `GROQ_API_KEY` only as fallback).

**Decision (fill in):** We are launching mode **D (BYOK)** on target date **___**.

---

## 1. Production environment — verify before any traffic

### 1.1 Vercel (or host)

- [ ] Single project: frontend build + `/api` serverless (or documented split if you use two projects).
- [ ] **Production** env vars set and reviewed (no test keys in prod unless intentional):
  - [ ] `DATABASE_URL` (Neon pooler, TLS OK)
  - [ ] **BYOK:** `BYOK_MODE=true` on the **server**; `VITE_BYOK=true` for **Production** builds (Vite bakes this in).
  - [ ] `GROQ_API_KEY` — **optional** for BYOK (fallback if user has no key); omit or empty if purely BYOK.
  - [ ] `GEMINI_API_KEY` (if TTS/features need it; often client-injected via Vite — see `frontend/.env.example`)
  - [ ] `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` and/or `VITE_CLERK_PUBLISHABLE_KEY`
  - [ ] `ALLOWED_ORIGINS` = every **browser** origin (custom domain + `www` + any `*.vercel.app` you actually use)
- [ ] **Preview** env: either same DB (risky) or separate Neon branch + separate Clerk app/test keys — document the choice.
- [ ] `npm run build` passes in CI or locally against `main`.

### 1.2 Database (Neon)

- [ ] Migrations applied on production: `npm run db:migrate` (or your pipeline) against prod `DATABASE_URL`.
- [ ] Confirm `ig_users` / `ig_sessions` exist and a test user row appears after real sign-in.
- [ ] Enable **automated backups** / point-in-time recovery per Neon plan; note **who** can restore and **how** (link to Neon docs in internal runbook).

### 1.3 Clerk

- [ ] Production instance: **Allowed origins / redirect URLs** include production domain(s) and `https://*.vercel.app` if needed for previews.
- [ ] Email + social providers tested on **production** URL (not only localhost).
- [ ] Session / MFA settings match your security story (document in FAQ if MFA is optional).

### 1.4 Local parity (optional but recommended)

- [ ] `env.local.example` → `.env.local` workflow documented; team can reproduce prod-like behavior before shipping.

---

## 2. Security & abuse (already partly done — confirm in prod)

Reference: `docs/SECURITY_HARDENING_PLAN.md`.

- [ ] **CORS:** `ALLOWED_ORIGINS` correct for all live frontends; smoke-test from browser DevTools (only your origin on credentialed responses).
- [ ] **Groq BYOK:** `BYOK_MODE=true` and `VITE_BYOK=true` aligned; smoke-test signed-in user with key in **Settings** → voice + analyze hit Groq with **their** quota (not yours). Do **not** log `x-api-key` in server logs.
- [ ] **Body size:** `JSON_BODY_LIMIT` default acceptable; raise only if large audio chunks fail.
- [ ] **Rate limiting:** `API_RATE_LIMIT_PER_MINUTE` set to something sane for beta (tune after first week).
- [ ] **Signups:** Set `ABUSE_MAX_SIGNUPS_PER_IP_PER_DAY` to a small number (e.g. 3–5) unless you have a strong reason not to.
- [ ] **Secrets:** No Groq/Clerk/DB keys in client bundle or public repos; rotate any key that ever leaked.

---

## 3. Billing & commercial readiness

### If **free beta** (mode A)

- [ ] UI and landing copy say **no card required** / **beta** / **limits apply** (voice, chat, sessions, trial).
- [ ] Remove or hide “Upgrade” paths that imply paid checkout unless `/api/upgrade` is admin-only or clearly labeled “beta access.”
- [ ] Plan for **when** you turn on real billing (separate milestone; see `billing` branch idea).

### If **BYOK** (mode D) — *current plan*

- [ ] Landing + FAQ: users need a **Groq account** and **API key**; link to Groq console; clarify **you do not store** the key on your server DB (browser localStorage + request header only), and **they** pay Groq for usage.
- [ ] Settings UI already has Groq key field — verify save + that production build sends `x-api-key` only when `VITE_BYOK=true`.
- [ ] Optional: server `GROQ_API_KEY` for a future “hosted tier”; document if unused in beta.
- [ ] Privacy Policy: mention user-supplied third-party API keys in the browser and your role as **proxy** to Groq.
- [ ] **Latency:** With `BYOK_MODE=true`, `/api/analyze` uses the **fast pipeline** by default (8B chat, fewer Groq round-trips). Clerk user lookups are **cached** (`CLERK_USER_CACHE_MS`, default 120s) so `/api/usage` is not blocked on a Clerk HTTP call every time. Set `ANALYZE_FULL_PIPELINE=true` only if you want the slower, richer multi-step flow.

### If **paid beta** (mode B)

- [ ] Choose **Stripe Checkout** or **Clerk Billing** (or other) and map product → `ig_users.plan`.
- [ ] Webhook handler: `subscription.active` / `canceled` → update `plan` + `subscription_status` in Postgres (idempotent, signed payloads).
- [ ] Customer portal or “manage subscription” link.
- [ ] Add DB column if needed (e.g. `stripe_customer_id`) via migration — today’s TS type hints at it but schema may not have it.
- [ ] Test: subscribe, upgrade, cancel, failed payment (Stripe test mode).

---

## 4. Legal, privacy, and trust

- [ ] **Privacy Policy** accurately lists: Clerk auth, email, optional IP on signup (`signup_ip`), usage metrics, session records, third parties (Groq, Google Gemini, Vercel, Neon), retention (state what you actually do). **BYOK:** explain that Groq keys are provided by the user in the client and sent only to **your API** to call Groq on their behalf — not stored in `ig_users`.
- [ ] **Terms of Service** include beta disclaimer, acceptable use (especially for interview-assistance tools — be explicit to reduce misuse risk), limitation of liability (lawyer-reviewed for your jurisdiction if possible).
- [ ] **Contact** channel works (email or form in `/contact`).
- [ ] Optional: **Security** page summarizes CORS, encryption in transit, no password storage in your DB (Clerk handles auth).

---

## 5. Observability & operations

### 5.1 Error and performance monitoring

- [ ] Add **error tracking** (e.g. Sentry) for **frontend** and **API** (Vercel serverless or Express), with release/version tags.
- [ ] Log aggregation: rely on Vercel logs + Neon logs for beta; define **where** you look when users report issues.

### 5.2 Alerts (minimum)

- [ ] Alert or daily check: API 5xx spike, Groq 429 spike, DB connection failures.
- [ ] Neon: disk / compute limits visible in dashboard.

### 5.3 Internal runbook (short doc or Notion)

- [ ] How to rotate `GROQ_API_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL`.
- [ ] How to temporarily **disable signups** (Clerk dashboard + optional env cap).
- [ ] Who is on-call for launch week.

---

## 6. Product & UX — beta polish

- [ ] **Beta badge** or banner: “Public beta — send feedback to ___.”
- [ ] **Feedback link** (Discord, GitHub Issues, form).
- [ ] **Empty / error states:** API down, quota exceeded, trial expired — copy is clear and not scary.
- [ ] **Auth:** Modal sign-in/sign-up tested on production domain (Safari + Chrome + mobile).
- [ ] **Critical path test script** (manual is fine for beta):
  - Sign up → `/app` → voice chunk → analyze → usage bar updates → sign out → sign in.

---

## 7. Desktop (if in scope for “launch”)

- [ ] Clarify: is beta **web-only** or **web + Windows .exe**? If exe: code signing, update channel, and support path.
- [ ] If web-only: landing download section still accurate (version, link, known issues).

---

## 8. Launch day checklist

- [ ] Final prod deploy from tagged release (e.g. `v0.9.0-beta`).
- [ ] Post **changelog** or release notes (GitHub Releases or blog).
- [ ] Announce in chosen channels (Twitter/X, Discord, email list).
- [ ] Watch errors and DB for first 24–48h actively.

---

## 9. Week-one post-launch

- [ ] Review Groq/Gemini **cost** vs signups; tighten rate limits if needed.
- [ ] Collect top 10 support issues → tickets.
- [ ] Decide date for **billing branch** merge or paid experiment.

---

## 10. Go / no-go summary

**Ship public beta** when all **must** items below are true:

| # | Must |
|---|------|
| 1 | Prod env complete; Clerk + DB verified on real domain |
| 2 | `ALLOWED_ORIGINS` + no client Groq keys in prod |
| 3 | Privacy + Terms reviewed and published; contact works |
| 4 | Error monitoring on API + UI |
| 5 | Abuse limits and rate limits consciously set |
| 6 | Commercial story matches reality (BYOK vs paid vs free tier) |
| 7 | Smoke test passed on production |

**Defer** (not required for a honest free beta, but schedule): full payment integration, advanced analytics, SLA promises, enterprise sales flow.

---

## 11. Suggested execution order (two tracks)

**Track 1 — Main (this repo)**  
Phases **1 → 2 → 4 → 5 → 6 → 8** in order; parallelize 4 with engineering where possible.

**Track 2 — Billing branch**  
Phase **3** only when you commit to paid beta; merge when webhooks + UI are done.

---

## Document history

| Date | Note |
|------|------|
| 2026-04-04 | Initial plan from launch-readiness discussion |

# Security hardening plan

This document tracks how we reduce attack surface for InterviewGuru’s Express API and related clients. Items are ordered by impact and ease of rollout.

## Goals

- Stop reflecting arbitrary `Origin` headers while `Access-Control-Allow-Credentials: true` (session cookies / Clerk would otherwise be usable from any site).
- Keep local development friction low (localhost origins).
- Make production configuration explicit via environment variables.

## Phase 1 — CORS allowlist (implemented)

**Risk:** Any website could trigger credentialed requests to our API in the user’s browser.

**Mitigation:**

- `ALLOWED_ORIGINS` — comma-separated list of full origins (scheme + host + port), no trailing slash. Example: `https://interviewguru.adhitya.me,https://www.interviewguru.adhitya.me`
- Non-production: localhost / 127.0.0.1 on common dev ports is always allowed in addition to `ALLOWED_ORIGINS`.
- On Vercel, `https://${VERCEL_URL}` is added automatically so the default `*.vercel.app` deployment keeps working without extra config.
- Custom domains **must** appear in `ALLOWED_ORIGINS` or the browser will block cross-origin API calls.

**Testing:** From the real site, open DevTools → Network → confirm API responses include `Access-Control-Allow-Origin` matching the page origin only. From a random origin (or `curl`), credentialed browser flows should not succeed.

## Phase 2 — Groq and API surface (implemented)

- **Server:** In `NODE_ENV=production`, the `x-api-key` header is **ignored**; only `GROQ_API_KEY` is used. Set `ALLOW_CLIENT_GROQ_KEY=true` to allow BYO key (not recommended for public production).
- **Client:** Production builds do not send `x-api-key` from the browser; dev builds still send the key from localStorage when set.
- **JSON body limit:** Default reduced to **`25mb`** (was `50mb`). Override with `JSON_BODY_LIMIT` if large audio payloads require it.
- **Operations:** Set `ABUSE_MAX_SIGNUPS_PER_IP_PER_DAY` and `API_RATE_LIMIT_PER_MINUTE` in production as needed (see `backend/.env.example`).

## Phase 3 — Headers and transport

- Consider `helmet` for sensible defaults (CSP is easiest to tune on the static frontend first).
- HSTS and TLS are typically handled by Vercel; document any custom domains.

## Phase 4 — Operational hygiene

- Rotate leaked or shared keys; use separate Clerk/Groq keys for dev vs production.
- Audit logs for unusual traffic; keep dependencies updated.

## Rollout checklist

1. Set `ALLOWED_ORIGINS` on Vercel (Production + Preview if previews call the same API).
2. Deploy backend; verify login and `/api/*` from production URL.
3. Optionally add preview URLs to `ALLOWED_ORIGINS` or use a second env per preview project.

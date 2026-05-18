# InterviewGuru advanced product research and implementation roadmap

Date: 2026-05-18

This document is a full-project scan plus external research pass for InterviewGuru. It is meant to be used as a product/engineering roadmap, not just a feature wishlist. The recommendations below are grounded in the current repo and in current external platform capabilities around realtime voice AI, Electron security, Groq APIs, Clerk billing, and interview-prep products.

---

## 1. Executive summary

InterviewGuru is already more than a basic chat app. The repo contains a React 19/Vite frontend, Express/TypeScript backend, Electron desktop shell, Clerk auth, Postgres/Neon-backed quotas and sessions, BYOK Groq support, streaming chat answers, Whisper STT, Gemini TTS, and a JD-based vector cache generator.

The best next moves are not "add another model dropdown." The strongest roadmap is:

1. **Make voice mode lower latency and more accurate** with adaptive chunking, better turn detection, transcript confidence metadata, speaker labeling, and domain term boosting.
2. **Turn session history into coaching intelligence** with answer scoring, filler-word detection, post-session summaries, weak-area tracking, and spaced review.
3. **Make the JD/resume cache production-grade** by persisting cache rows per user/session, tracking hit rate, adding invalidation/versioning, and supporting follow-up refinement.
4. **Harden desktop and web security** before broader launch: Electron isolation, restrictive permissions, CSP, secret-handling copy, update safety, and BYOK privacy controls.
5. **Add monetization and team readiness** with Clerk Billing or Stripe, plan-entitled feature gates, optional organizations, and verified webhooks.
6. **Add observability and evaluation loops** so latency, cost, answer quality, STT errors, cache hits, and quota failures become visible.

---

## 2. Current project scan

### 2.1 Stack and build system

- Frontend: React 19, Vite 6, Tailwind CSS v4 plugin, React Router 7, Lucide icons, Motion.
- Backend: Express 4, TypeScript, `tsx` for dev, `tsup` for CJS server bundle.
- Desktop: Electron 41, `electron-builder`, NSIS installer and portable Windows target, `electron-updater`.
- AI providers: Groq chat/STT, Google GenAI TTS, local Xenova embeddings for semantic cache.
- Auth and quota: Clerk React/Express, custom `ig_users` and `ig_sessions` tables, in-memory fallback store for desktop/local.
- Deployment: Vercel serverless entry via `api/[...path].ts`, Vite build output in `build/`, backend bundle in `backend/api/server.cjs`.
- Database: `pg`, `node-pg-migrate`, baseline tables for users and sessions.

Important files:

- `package.json` - scripts, dependencies, Electron packaging config.
- `frontend/routes/App.tsx` - public marketing/docs routes, Clerk-gated `/app`.
- `frontend/components/OverlayWidget.tsx` - core voice/chat/settings/history overlay UI.
- `frontend/hooks/useTabAudioCapture.ts` - browser/Electron audio capture, chunking, silence skip, STT requests.
- `frontend/hooks/useAIAssistant.ts` - transcript buffering, question detection, chat streaming, TTS playback.
- `backend/api/server.ts` - Express server, Groq calls, STT, analyze, streaming, cache generation, usage/session APIs.
- `shared/prompts/index.ts` - voice/chat/classification/cache prompts.
- `shared/constants/planLimits.ts` - free/basic/pro/enterprise quotas and feature flags.
- `desktop/main/main.cjs` - desktop window, overlay behavior, audio loopback, shortcuts, updater.
- `docs/LAUNCH_READINESS_PLAN.md` and `docs/SECURITY_HARDENING_PLAN.md` - existing operational guidance.

### 2.2 Product capabilities already implemented

Voice mode:

- Captures tab audio in browser through `getDisplayMedia`.
- Captures system audio in Electron through desktop capture and loopback.
- Chunks audio every 2-15 seconds, defaulting to 5 seconds.
- Skips silent chunks using RMS thresholding.
- Sends audio to `/api/transcribe`, using Groq Whisper models.
- Applies a Whisper hallucination filter and technical term corrections.
- Buffers transcript and runs question heuristics before LLM analysis.
- Generates short bullets and a spoken answer.
- Optional Gemini TTS playback, with output device selection where supported.

Chat mode:

- Sends typed questions to `/api/analyze/stream`.
- Receives SSE preview text while final structured JSON is generated.
- Renders section cards, code blocks, copy controls, feedback buttons, and refinement actions.
- Supports persona, resume, and JD context.
- Uses structured JSON prompts for concept, coding, system design, and behavioral answers.

Personalization and cache:

- Settings include Groq API key, persona, resume, JD, model, voice model, opacity, anti-capture, chunk length, skip-silence, and TTS.
- `/api/generate-cache` generates likely interview questions from a JD, generates answers, creates Xenova embeddings, stores them in a temp JSON cache, and serves high-similarity answers quickly.
- Cache hit threshold is currently `0.82` against `all-MiniLM-L6-v2`.

Auth, quota, and sessions:

- Clerk-gated `/app` route.
- Local guest mode only when Clerk is disabled outside production.
- Quotas by plan for voice minutes, chat messages, and sessions.
- `/api/usage`, `/api/sessions/start`, `/api/sessions/:id`, `/api/sessions/:id/close`, `/api/sessions/history`.
- `ig_users` and `ig_sessions` schema exists.
- Free/basic/pro/enterprise plan definitions exist, but billing webhooks are not implemented yet.

Desktop:

- Transparent, always-on-top, frameless overlay.
- Hide/show, click-through, taskbar hiding, anti-capture toggle.
- Auto-updater for installed Windows builds.
- Packaged mode can load a remote web app or embedded local server.

Security posture:

- Production CORS allowlist exists.
- BYOK mode can accept user Groq keys in production only when explicitly enabled.
- Rate limiting exists per Clerk user or IP fallback.
- Launch and security docs already call out CORS, BYOK, body limits, abuse caps, privacy, legal, and monitoring gaps.

---

## 3. External research findings

### 3.1 Realtime voice AI trends

Sources:

- [AssemblyAI voice agent best practices](https://assemblyai.com/docs/voice-agent-best-practices)
- [AssemblyAI streaming speaker diarization guide](https://www.assemblyai.com/blog/streaming-speaker-diarization)
- [AssemblyAI realtime STT guide](https://www.assemblyai.com/blog/real-time-speech-to-text-for-voice-agents)
- [Soniox v4 realtime announcement](https://soniox.com/blog/2026-02-05-soniox-v4-real-time/)

Relevant takeaways:

- Modern voice agents optimize for very low latency and stable turn boundaries. Sub-second end-to-end response is the product expectation in realtime voice UX.
- Silence-only VAD is not enough for natural turn detection. Better systems combine punctuation, silence duration, and semantic endpointing so the assistant does not interrupt mid-thought.
- Streaming diarization is valuable for meetings and interviews because it separates interviewer and candidate turns. Realtime diarization can be approximate early and more stable as more audio arrives.
- Domain-specific term boosting matters. InterviewGuru already has hardcoded technical corrections; a richer approach would derive key terms from resume/JD and inject them into STT or post-STT correction.

Fit for this repo:

- `useTabAudioCapture.ts` already has chunk length and RMS silence controls. The next step is adaptive chunking and turn-boundary scoring.
- `/api/transcribe` already cleans hallucinations. The next step is to return richer metadata: raw transcript, corrected transcript, term corrections applied, confidence if provider supports it, and chunk timing.
- `OverlayWidget.tsx` already labels transcript as "Interviewer"; speaker-aware transcripts would make this accurate instead of assumed.

### 3.2 Groq and LLM platform capabilities

Sources:

- [Groq API reference](https://console.groq.com/docs/api-reference)
- [Groq text generation docs](https://console.groq.com/docs/text-chat)
- [Groq Whisper Large v3 Turbo announcement](https://groq.com/blog/whisper-large-v3-turbo-now-available-on-groq-combining-speed-quality-for-speech-recognition)

Relevant takeaways:

- Groq chat supports streaming, structured JSON outputs, and tool-use style workflows.
- Groq STT options include quality/speed tradeoffs: Whisper Large v3, Whisper Large v3 Turbo, and Distil-Whisper English.
- Whisper Large v3 Turbo is a strong default for latency-sensitive transcription, while full Large v3 can be an accuracy upgrade.

Fit for this repo:

- The repo already uses streaming and structured JSON.
- Model selection exists in the UI.
- The next leverage point is observability: log model, latency, token usage, cached tokens if present in response usage, STT duration, and status codes.
- The cache generator should store per-user cache in Postgres instead of process temp storage if this becomes a paid feature.

### 3.3 Electron security guidance

Sources:

- [Electron security tutorial](https://electronjs.org/docs/latest/tutorial/security)
- [Electron context isolation docs](http://electron.atom.io/docs/latest/tutorial/context-isolation)
- [1Password electron-secure-defaults](https://github.com/1Password/electron-secure-defaults)

Relevant takeaways:

- Keep `contextIsolation` enabled.
- Disable Node integration for remote content.
- Use a restrictive Content Security Policy.
- Deny permissions by default, then allow only the exact permissions required.
- Avoid loading insecure content and keep Electron patched.

Fit for this repo:

- `desktop/main/main.cjs` uses safer settings for remote web mode (`nodeIntegration: false`, `contextIsolation: true`) but embedded local mode currently uses `nodeIntegration: true` and `contextIsolation: false`.
- Permission handling currently auto-grants all permissions. That should be narrowed.
- `setContentProtection` is exposed through the UI, but the startup value and README language should be rechecked so product copy matches actual behavior.

### 3.4 Interview-prep product landscape

Sources:

- [InterviewFocus job seeker product](https://interviewfocus.com/solutions/job-seekers/)
- [MockPrep](https://mockprep.ai/)
- [ZennPrep features](https://zennprep.com/features)
- [LightningHire](https://lightninghire.com/)

Relevant takeaways:

- Competitors emphasize mock interviews, resume/JD personalization, detailed feedback, scoring, transcripts, progress tracking, and role-specific practice.
- Advanced coaching apps score clarity, structure, specificity, confidence, filler words, tone, and answer completeness.
- Resume optimization, application tracking, and negotiation prep are common adjacent features.

Fit for this repo:

- InterviewGuru already has resume/JD inputs and session history. It can become a coaching product by adding post-session analysis instead of only realtime assistance.
- Feedback buttons exist visually, but there is no clear persisted feedback loop. Persisting thumbs up/down and reason tags would improve prompts and analytics.

### 3.5 Billing, organizations, and B2B

Sources:

- [Clerk Billing overview](https://clerk.com/billing)
- [Clerk Billing webhooks](https://clerk.com/docs/billing/events-webhooks)
- [Clerk billing management docs](https://clerk.com/docs/guides/billing/overview)

Relevant takeaways:

- Clerk Billing can manage B2C and B2B subscriptions, pricing pages, plans, and subscription state.
- Billing webhooks include subscription and payment attempt lifecycle events.
- Clerk Organizations can support team workspaces, roles, permissions, organization billing, and enterprise SSO.

Fit for this repo:

- Plan tiers and quota gates already exist.
- `UserRecord` has `stripeCustomerId`, but there is no production billing integration in the current code.
- Next billing step is a verified webhook handler that updates `ig_users.plan` and `subscription_status`, regardless of whether the provider is Clerk Billing or Stripe.

---

## 4. Highest-impact advanced features to add

### 4.1 Adaptive realtime voice pipeline

Goal: reduce perceived delay and wasted STT calls while increasing transcript quality.

Current state:

- Fixed chunking range: 2-15 seconds.
- RMS silence skip.
- Heuristic question detection after transcription.
- No true turn detection, diarization, or timing metadata.

Recommended implementation:

1. Add a client-side `VoiceTurnController` in `frontend/hooks/useTabAudioCapture.ts`.
2. Track RMS, speech start, speech end, last non-silent frame, chunk age, and punctuation in transcript.
3. Use shorter chunks during active speech and longer chunks during stable silence.
4. Send `chunkStartedAt`, `chunkEndedAt`, `rmsStats`, and `chunkIndex` to `/api/transcribe`.
5. Return `{ text, rawText, correctedText, correctionsApplied, chunkTiming }`.
6. In `useAIAssistant.ts`, process only when a probable turn boundary occurs: question mark, terminal punctuation plus silence, or max active speech window.

Implementation touchpoints:

- `frontend/hooks/useTabAudioCapture.ts`
- `frontend/hooks/useAIAssistant.ts`
- `backend/api/server.ts` `/api/transcribe`
- `shared/types/index.ts`

Difficulty: medium

Value: very high

### 4.2 Speaker-aware transcript and diarization-ready schema

Goal: separate interviewer, candidate, and AI output in history.

Current state:

- UI assumes transcript speaker is "Interviewer".
- Sessions only store counts, not transcript turns.

Recommended implementation:

1. Add `ig_session_turns` table with `session_id`, `speaker`, `text`, `started_at`, `ended_at`, `source`, `confidence`, `metadata`.
2. Start with simple speaker labels:
   - `interviewer` for captured system audio.
   - `candidate` for typed chat input.
   - `assistant` for AI response.
3. Leave room for provider diarization later with fields like `speaker_label`, `provider`, and `provider_turn_id`.
4. Render a transcript timeline in History.

Implementation touchpoints:

- New migration in `backend/migrations`
- `backend/storage/usageStorage.ts`
- `frontend/hooks/useSessionTracking.ts`
- `frontend/components/OverlayWidget.tsx`

Difficulty: medium

Value: high

### 4.3 Post-session coaching report

Goal: turn raw sessions into learning outcomes.

Current state:

- Session start/update/close exists.
- History panel exists.
- There is no answer quality scoring.

Recommended implementation:

1. On session close, call a new `/api/sessions/:id/report` endpoint.
2. Generate a report with:
   - strongest answers
   - weak answers
   - missed concepts
   - follow-up practice questions
   - STAR quality for behavioral answers
   - system design coverage checklist
   - coding complexity correctness
3. Store report JSON in `ig_session_reports`.
4. Render a report card in the history UI.

Suggested report schema:

```json
{
  "overallScore": 82,
  "strengths": ["Clear trade-off framing", "Good Big-O mentions"],
  "weaknesses": ["Needs more concrete project examples"],
  "questionBreakdown": [
    {
      "question": "Explain QuickSort.",
      "score": 86,
      "rubric": {
        "correctness": 90,
        "clarity": 80,
        "depth": 85,
        "interviewReadiness": 88
      },
      "improvedAnswer": "..."
    }
  ],
  "nextPractice": ["Design a URL shortener", "Explain indexes in Postgres"]
}
```

Implementation touchpoints:

- `backend/api/server.ts`
- `shared/prompts/index.ts`
- `backend/migrations`
- `frontend/components/OverlayWidget.tsx`

Difficulty: medium-high

Value: very high

### 4.4 Persistent personalized vector cache

Goal: make the "Generate Interview Cache" feature reliable across users, deployments, sessions, and server restarts.

Current state:

- Cache is process-global memory plus a temp JSON file.
- Cache is cleared per generation.
- It is not user-scoped in storage.
- It may not work reliably in serverless production.

Recommended implementation:

1. Create tables:
   - `ig_interview_caches`
   - `ig_interview_cache_items`
2. Scope cache by `clerk_user_id`, JD hash, resume hash, model version, embedding model, and created time.
3. Store embeddings with `vector` if using pgvector, or JSON initially if you want low-risk migration.
4. Add cache invalidation when JD/resume/model changes.
5. Add cache metrics:
   - hit/miss
   - similarity score
   - latency saved
   - generated question category
6. Show cache health in Settings: "35 questions cached, last generated 2h ago, 71% hit rate."

Implementation touchpoints:

- `backend/api/server.ts` cache generation and lookup
- `backend/services/database.ts`
- `backend/migrations`
- `frontend/components/OverlayWidget.tsx`

Difficulty: high

Value: very high

### 4.5 Retrieval-augmented resume/JD knowledge base

Goal: make answers use exact user project details without sending the entire resume/JD on every request.

Current state:

- Resume and JD are stored in localStorage and sent with requests.
- Prompts include raw context.

Recommended implementation:

1. Parse resume/JD into structured fields:
   - skills
   - projects
   - companies
   - metrics
   - target role requirements
2. Embed chunks and retrieve top relevant snippets per question.
3. Prompt with only relevant snippets and a stable system prefix.
4. Add UI showing which resume/JD facts were used.

Benefits:

- Lower token use.
- Better personalization.
- Better prompt caching compatibility.
- Clearer user trust: "This answer referenced Project X and AWS Lambda experience."

Difficulty: high

Value: high

### 4.6 Answer refinement modes

Goal: let users turn one answer into several interview-ready variants.

Current state:

- UI has refine controls for "shorter" and "examples" style actions.

Recommended additions:

- "Make it more senior"
- "Add production trade-offs"
- "Add Big-O and edge cases"
- "Convert to STAR"
- "Make it 30 seconds"
- "Make it 2 minutes"
- "Add code walkthrough"
- "Add follow-up questions interviewer may ask"

Implementation touchpoints:

- `frontend/components/OverlayWidget.tsx`
- `frontend/hooks/useAIAssistant.ts`
- `backend/api/server.ts`
- `shared/prompts/index.ts`

Difficulty: low-medium

Value: high

### 4.7 Live follow-up predictor

Goal: after each answer, predict likely interviewer follow-ups.

Current state:

- Voice mode answers the current question only.

Recommended implementation:

1. After answer generation, run a cheap follow-up prompt.
2. Return 2-3 likely follow-up questions and one-line prep bullets.
3. Render in a collapsible "Possible follow-ups" section.
4. Store follow-ups in session history.

Example:

```json
{
  "followUps": [
    {
      "question": "How would QuickSort behave on nearly sorted input?",
      "talkingPoint": "Mention pivot choice and randomized partitioning."
    }
  ]
}
```

Difficulty: medium

Value: high

### 4.8 Practice mode with spaced repetition

Goal: make InterviewGuru useful before the interview, not only during it.

Current state:

- Landing page and app are oriented around live assistance and typed chat.
- Cache generation can generate likely questions but there is no scheduled practice loop.

Recommended implementation:

1. Add a "Practice" tab.
2. Turn generated cache questions into flashcards.
3. Track confidence per question.
4. Use spaced repetition intervals: again, soon, later, mastered.
5. Generate new variants for weak categories.
6. Tie practice analytics into post-session report.

Implementation touchpoints:

- New frontend component under `frontend/components` or `frontend/pages`
- New tables for practice items and reviews
- `shared/prompts/index.ts` for question generation variants

Difficulty: high

Value: high

### 4.9 Feedback learning loop

Goal: make thumbs up/down useful.

Current state:

- `ChatMessage` has local feedback state only.

Recommended implementation:

1. Persist feedback with answer ID, model, question, persona, JD hash, cache hit flag, and reason tags.
2. Add quick reasons:
   - incorrect
   - too long
   - too shallow
   - not personalized
   - bad code
   - hallucinated API
3. Add an admin/dev report endpoint to inspect feedback trends.
4. Use aggregate feedback to tune prompts and model routing.

Implementation touchpoints:

- `frontend/components/OverlayWidget.tsx`
- `backend/api/server.ts`
- New migration for `ig_answer_feedback`

Difficulty: medium

Value: high

### 4.10 Observability dashboard and quality evals

Goal: know whether product quality is improving.

Current state:

- Logs exist, but metrics are not centralized.
- No answer evaluation dataset exists.

Recommended implementation:

Track at minimum:

- STT latency by model.
- STT empty/silence/hallucination rate.
- Analyze latency by model and mode.
- Streaming time to first preview.
- Cache hit rate and average similarity score.
- Groq 429/5xx rate.
- Quota failures.
- Session start/close rate.
- Feedback positive/negative rate.

Add a local eval script:

- `scripts/eval-answer-quality.mjs`
- Fixed set of interview questions.
- Expected rubric.
- Runs against `/api/analyze`.
- Produces JSON/Markdown report with correctness, structure, latency, and cost estimates.

Difficulty: medium

Value: very high

---

## 5. Security and trust roadmap

### 5.1 Electron hardening

Recommended changes:

- Use `contextIsolation: true` and `nodeIntegration: false` for embedded local mode too.
- Move required desktop APIs behind `desktop/main/preload.cjs` and `contextBridge`.
- Replace "auto-grant all permissions" with allowlisted permissions:
  - media
  - display-capture
  - audio capture where needed
- Add navigation guards so the desktop shell cannot navigate to arbitrary untrusted origins.
- Add CSP headers or meta tags for the local/remote app.
- Keep Electron updated and document version update cadence.

Files:

- `desktop/main/main.cjs`
- `desktop/main/preload.cjs`
- `backend/api/server.ts` if serving CSP headers locally

### 5.2 BYOK key handling

Current risk:

- User Groq key is stored in browser localStorage and sent to the app backend.
- This is acceptable for a BYOK beta only if the UI and privacy copy are very clear.

Recommended changes:

- Add a settings warning: "Stored locally in this browser. Never paste a key you cannot rotate."
- Add a one-click "Clear API key" control.
- Never log request headers.
- Add CSP to reduce XSS risk.
- Consider encrypting local key at rest for desktop using OS keychain later.

### 5.3 Product policy and consent modes

The app is positioned as a live interview/meeting copilot. This creates trust, employer-policy, and consent risk. Product copy should clearly distinguish:

- Practice mode: fully safe and encouraged.
- Meeting assistant mode: use with consent where required.
- Live interview mode: user is responsible for complying with interview rules.

Recommended product addition:

- "Compliance mode" that disables stealth controls, enables visible transcript/recording indicators, and focuses on post-session coaching.
- "Practice mode" as the default public positioning.

This improves distribution options and lowers platform/payment/legal risk.

---

## 6. Monetization roadmap

### 6.1 Short-term: make existing plan gates real

Current plan flags already include:

- `textToSpeech`
- `sessionExport`
- `customPersonas`
- `cacheGeneration`
- `advancedAnalytics`

Recommended actions:

1. Enforce feature flags consistently in backend and frontend.
2. Remove or label dev-only `/api/upgrade`.
3. Add real billing provider webhook.
4. Store provider customer/subscription IDs.
5. Add a billing settings page.

### 6.2 Clerk Billing path

Pros:

- Already using Clerk.
- Supports B2C and B2B subscription flows.
- Billing webhooks align with Clerk identity.
- Useful if you later add Organizations.

Cons:

- Billing APIs may still be beta/experimental depending on current Clerk release state.
- You must verify pricing/availability before committing.

### 6.3 Stripe path

Pros:

- Mature ecosystem.
- Strong webhook and customer portal support.
- Easier to migrate away from auth vendor lock-in.

Cons:

- More integration code.
- Need to map Stripe customer/subscription lifecycle to Clerk user IDs.

Recommendation:

- If speed matters and Clerk Billing is available in your account, use Clerk Billing.
- If long-term payment control matters more, use Stripe.
- In either case, design your own internal subscription state around `ig_users.plan` and `subscription_status`.

---

## 7. Data model additions

Recommended migrations:

### 7.1 Session turns

```sql
CREATE TABLE ig_session_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ig_sessions(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
  speaker VARCHAR(32) NOT NULL,
  source VARCHAR(32) NOT NULL,
  text TEXT NOT NULL,
  confidence REAL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 7.2 Session reports

```sql
CREATE TABLE ig_session_reports (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ig_sessions(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
  overall_score INT,
  report JSONB NOT NULL,
  model VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 7.3 Answer feedback

```sql
CREATE TABLE ig_answer_feedback (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
  session_id TEXT REFERENCES ig_sessions(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer JSONB NOT NULL,
  rating VARCHAR(16) NOT NULL,
  reason_tags TEXT[] NOT NULL DEFAULT '{}',
  model VARCHAR(128),
  persona VARCHAR(128),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 7.4 Persistent interview cache

```sql
CREATE TABLE ig_interview_caches (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL REFERENCES ig_users(clerk_user_id) ON DELETE CASCADE,
  resume_hash TEXT,
  jd_hash TEXT NOT NULL,
  embedding_model VARCHAR(128) NOT NULL,
  answer_model VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  item_count INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ig_interview_cache_items (
  id TEXT PRIMARY KEY,
  cache_id TEXT NOT NULL REFERENCES ig_interview_caches(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  variants JSONB NOT NULL DEFAULT '[]',
  answer JSONB NOT NULL,
  embedding JSONB NOT NULL,
  variant_embeddings JSONB NOT NULL DEFAULT '[]',
  category VARCHAR(64),
  difficulty VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 8. Suggested execution order

### Phase 1: Reliability and trust foundation

1. Add observability around STT, analyze, stream, and cache latency.
2. Persist answer feedback.
3. Harden Electron `contextIsolation`, `nodeIntegration`, permission handling, and navigation.
4. Add BYOK key warning and clear-key UX.
5. Fix docs/product copy around stealth, anti-capture, BYOK, and user responsibility.

Why first: it reduces launch risk and gives measurement for every later feature.

### Phase 2: Better live experience

1. Add adaptive voice turn detection.
2. Return richer transcript metadata.
3. Add likely follow-ups.
4. Add refinement modes.
5. Add persistent session turns.

Why second: this improves the core live-assist loop users feel immediately.

### Phase 3: Coaching product

1. Add post-session reports.
2. Add practice mode from JD-generated questions.
3. Add weak-area tracking and spaced repetition.
4. Add advanced analytics behind `advancedAnalytics`.

Why third: this expands the product from "during interview" to "before and after interview."

### Phase 4: Production cache and personalization

1. Move vector cache to Postgres.
2. Add cache hit metrics and cache management UI.
3. Add resume/JD parsing and retrieval.
4. Add prompt/version tracking.

Why fourth: this is high value but touches data, performance, and cost.

### Phase 5: Billing and teams

1. Choose Clerk Billing or Stripe.
2. Add verified billing webhook.
3. Make `/api/upgrade` dev-only or remove it.
4. Gate `cacheGeneration`, `sessionExport`, `customPersonas`, `advancedAnalytics`, and TTS.
5. Consider Clerk Organizations only after single-user billing works.

Why fifth: billing should charge for stable features, not unstable experiments.

---

## 9. Concrete near-term tickets

### Ticket 1: Persist feedback

Scope:

- Add `ig_answer_feedback` migration.
- Add `POST /api/feedback`.
- Send thumbs up/down and reason tags from `OverlayWidget.tsx`.
- Include model/persona/cache hit metadata.

Acceptance:

- Feedback survives reload.
- Backend validates rating and authenticated user.
- No answer content is logged outside database writes.

### Ticket 2: Add latency metrics

Scope:

- Add timing wrappers around `/api/transcribe`, `/api/analyze`, `/api/analyze/stream`, `/api/generate-cache`.
- Return `x-interviewguru-latency-ms` header.
- Log structured JSON in development and production-safe logs in production.

Acceptance:

- Logs include route, status, model, latency, and user plan.
- Logs do not include API keys, resume, JD, transcript, or full answer.

### Ticket 3: Post-session report prototype

Scope:

- Persist session question/answer turns.
- Add report prompt.
- Generate report on session close.
- Display report in history.

Acceptance:

- One completed session can show a coaching report.
- Report includes score, strengths, weaknesses, and next practice questions.

### Ticket 4: Electron security pass

Scope:

- Use preload bridge for IPC.
- Disable Node integration in renderer.
- Enable context isolation for local mode.
- Restrict permission handler.
- Add navigation guard.

Acceptance:

- Existing overlay controls still work.
- Audio capture still works in packaged/dev Electron.
- No renderer access to unrestricted Node APIs.

### Ticket 5: Persistent cache design spike

Scope:

- Add design doc or migration draft for persistent cache.
- Decide JSON embeddings vs pgvector.
- Add cache metadata and hit tracking plan.

Acceptance:

- Clear migration path exists.
- Serverless compatibility is addressed.
- Rollback strategy is documented.

---

## 10. Risks and trade-offs

### Latency vs answer quality

Fast mode uses fewer model calls and smaller models, which improves live UX but may reduce depth. Full pipeline improves quality but can feel slow. Keep both and route by mode:

- Voice: fastest acceptable answer.
- Chat/practice/report: richer pipeline.

### Stealth positioning risk

Stealth features may create policy and trust concerns. Keep the capability if it is core to the product, but add clearer user responsibility, compliance mode, and practice-first positioning.

### BYOK simplicity vs user trust

BYOK reduces platform cost, but localStorage API keys create XSS and extension risk. This must be clearly disclosed and protected with CSP and key-clearing UX.

### Serverless cache limitations

The current temp-file vector cache is not a durable production cache. It can still be useful locally or in desktop mode, but production web needs a persistent store.

### Billing before value

The repo has plan tiers, but billing should not ship until feature gates, quotas, webhook verification, and cancellation behavior are reliable.

---

## 11. Recommended north-star architecture

```text
Audio Capture
  -> Adaptive chunker
  -> STT provider
  -> Transcript cleanup and term correction
  -> Turn detection
  -> Session turn persistence
  -> Cache lookup
  -> Model router
  -> Structured answer generation
  -> Follow-up predictor
  -> UI render + TTS
  -> Feedback and metrics

Session Close
  -> Transcript and answer aggregation
  -> Coaching report generation
  -> Weak-area extraction
  -> Practice queue updates
```

This architecture keeps the live path fast while moving heavier learning features into async or post-session flows.

---

## 12. Best next action

Start with **Ticket 1: Persist feedback** and **Ticket 2: Add latency metrics**. They are small enough to ship quickly, they do not require a product redesign, and they create the measurement layer needed before changing the voice pipeline or billing.

After that, implement **Post-session report prototype** because it turns current session tracking into a visible user benefit and supports paid `advancedAnalytics` later.

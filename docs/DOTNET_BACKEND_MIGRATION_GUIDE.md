# InterviewGuru .NET Backend Migration Guide

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [System Architecture Diagram](#system-architecture-diagram)
3. [API Endpoints](#api-endpoints)
4. [Database Schema](#database-schema)
5. [Authentication & Authorization](#authentication--authorization)
6. [Rate Limiting](#rate-limiting)
7. [Quota & Usage Tracking System](#quota--usage-tracking-system)
8. [External Services](#external-services)
9. [Data Models & Types](#data-models--types)
10. [Middleware Pipeline](#middleware-pipeline)
11. [Error Handling](#error-handling)
12. [Configuration & Environment Variables](#configuration--environment-variables)
13. [Vector Cache System](#vector-cache-system)
14. [AI Pipeline Details](#ai-pipeline-details)
15. [Migration Checklist](#migration-checklist)

---

## Architecture Overview

### Technology Stack (Current Express Implementation)
- **Framework**: Express.js (Node.js)
- **Language**: TypeScript (compiled to JavaScript)
- **Database**: PostgreSQL (Neon for cloud) with optional in-memory fallback
- **ORM/Query Library**: node-pg (node-postgres raw SQL)
- **Authentication**: Clerk (JWT-based)
- **Rate Limiting**: express-rate-limit
- **AI Inference**: Groq API (speech-to-text, LLM completions)
- **TTS**: Google Gemini API
- **ML Embeddings**: @xenova/transformers (Xenova/all-MiniLM-L6-v2)
- **HTTP Server**: http (Node's built-in with Express)

### Key Characteristics
- **Stateless API**: Each request is self-contained
- **Optional Database**: Falls back to in-memory JSON persistence if DATABASE_URL is not set
- **BYOK Mode**: Supports Bring-Your-Own-Groq-Key; users can send `x-api-key` header
- **Lazy Loading**: ML models (embeddings) load only on first request to avoid cold-start delays
- **Fast Analysis Mode**: Optional "fast mode" that uses smaller, cheaper models (8b) for lower latency
- **Vector Cache**: Pre-generated embeddings and answers for common interview questions
- **Streaming Support**: `/api/analyze/stream` endpoint for real-time response previews

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Web/Desktop)                      │
│  (React + Electron / Browser)                                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    HTTP/HTTPS Requests
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
    ┌────▼────────────────────────────────┐ │
    │  Global Middleware Pipeline         │ │
    │  1. CORS Handler                    │ │
    │  2. Clerk Auth Middleware           │ │
    │  3. Rate Limiter (apiBurstLimiter) │ │
    │  4. Auth Middleware (identity)      │ │
    │  5. Quota Middleware (per endpoint) │ │
    └────┬────────────────────────────────┘ │
         │                                  │
    ┌────▼─────────────────────────────────┐│
    │  Route Handlers                      ││
    │  ├─ /api/health                      ││
    │  ├─ /api/cron/keep-warm              ││
    │  ├─ /api/transcribe                  ││
    │  ├─ /api/analyze                     ││
    │  ├─ /api/analyze/stream              ││
    │  └─ /api/generate-cache              ││
    └────┬─────────────────────────────────┘│
         │                                  │
    ┌────▼──────────────────────────────────┐
    │  Service Layer                         │
    │  ├─ Groq Service (Whisper, LLM)       │
    │  ├─ Gemini Service (TTS)              │
    │  ├─ Embedding Service (Xenova)        │
    │  ├─ Usage Storage Service             │
    │  ├─ Clerk User Sync Service           │
    │  └─ Database Service                  │
    └────┬──────────────────────────────────┘
         │
    ┌────┴──────────────────────────────────┐
    │  Data Layer                            │
    │  ├─ PostgreSQL (Neon)                 │
    │  └─ In-Memory Fallback (JSON file)    │
    └────────────────────────────────────────┘
```

---

## API Endpoints

### 1. Health Check
**Endpoint**: `GET /api/health`

**Middleware Stack**:
- Clerk Auth (global)
- Rate Limiter (optional skip)

**Query Parameters**:
- `deep` (optional): `'1'` or `'true'` or check `HEALTH_CHECK_DB` env var
  - When set, performs deep health check including database query

**Response** (shallow):
```json
{
  "status": "ok"
}
```

**Response** (deep):
```json
{
  "status": "ok",
  "db": "up"
}
```

**Status Codes**:
- `200`: Server healthy
- `503`: Database not connected / degraded state

**Notes**:
- Can be skipped from rate limiting (checked if path is `/health`)

---

### 2. Cron Keep-Warm (Database Wake-up)
**Endpoint**: `GET /api/cron/keep-warm`

**Middleware Stack**:
- Clerk Auth (global)
- No rate limit (internal cron only)

**Authentication**:
- Requires `Authorization: Bearer <CRON_SECRET>` header, OR
- `x-cron-secret` header matching `process.env.CRON_SECRET`
- Must be set for production/Vercel deployments

**Response** (success):
```json
{
  "ok": true,
  "at": "2025-04-26T10:30:00.000Z",
  "db": "up"
}
```

**Status Codes**:
- `200`: Success
- `401`: Invalid/missing CRON_SECRET
- `503`: Database not connected; Set CRON_SECRET in env

**Purpose**:
- Prevents Neon database compute from sleeping
- Hit on a schedule (Vercel Cron, GitHub Actions, UptimeRobot)
- Keeps connection pool warm for faster cold starts

---

### 3. Audio Transcription
**Endpoint**: `POST /api/transcribe`

**Middleware Stack**:
- Clerk Auth (global)
- Rate Limiter
- Auth Middleware (identity resolution)
- **Quota Middleware** (`quotaMiddleware('voice')`)

**Headers**:
- `x-voice-model` (optional): Groq model name, defaults to `"whisper-large-v3-turbo"`
- `x-api-key` (optional): Custom Groq API key (if BYOK or client key allowed)
- `Authorization`: Clerk token (auto-handled by middleware)

**Request Body**:
```json
{
  "audioBase64": "SUQz...",    // Base64-encoded audio chunk
  "mimeType": "audio/webm",    // "audio/webm" or "audio/mp4"
  "audioChunkDuration": 5      // Duration in seconds
}
```

**Response** (success):
```json
{
  "text": "What is the virtual DOM?",
  "usage": {
    "voiceMinutesUsed": 1,
    "remainingMinutes": 14
  }
}
```

**Response** (empty/hallucination):
```json
{
  "text": "",
  "usage": {
    "voiceMinutesUsed": 1,
    "remainingMinutes": 14
  }
}
```

**Error Responses**:
```json
{
  "error": "No audio provided"           // 400
}
```

```json
{
  "error": "Rate limit reached. Please wait a moment.",
  "retryAfter": 3
}
```

```json
{
  "error": "Transcription failed"        // 500
}
```

**Status Codes**:
- `200`: Success
- `400`: Missing audioBase64
- `402`: Voice quota exceeded (quota middleware)
- `429`: Rate limit exceeded (Groq API)
- `500`: Transcription error

**Key Logic**:
1. Decode Base64 audio to temp file
2. Send to Groq Whisper API
3. Filter hallucinations (common speech-to-text artifacts)
4. Apply technical term corrections (React → React, not "react.js")
5. Record voice usage in quota system
6. Return transcribed text + remaining quota

**Whisper Hallucination Filtering**:
- Filters ~40 common hallucinations: "thank you", "thanks for watching", YouTube/channel credits, etc.
- Skips if text is ≤2 chars or matches hallucination AND < 20 chars

**Technical Term Corrections**:
- Maps mishearing: "virtual dome" → "virtual DOM", "postgress" → "PostgreSQL", etc.

---

### 4. Question Analysis & Answer Generation
**Endpoint**: `POST /api/analyze`

**Middleware Stack**:
- Clerk Auth (global)
- Rate Limiter
- Auth Middleware
- **Quota Middleware** (`analyzeQuotaMiddleware`) — routes to chat or voice quota based on `x-mode` header

**Headers**:
- `x-mode` (required): `"chat"` or `"voice"` — determines response structure and quota type
- `x-model` (optional): Custom Groq model name
- `x-persona` (optional): Interviewer persona/style (defaults to "Technical Interviewer")
- `x-voice-model` (optional): Voice model (for voice mode)
- `x-answer-style` (optional): `"short"`, `"balanced"`, or `"detailed"` — affects prompt
- `x-api-key` (optional): Custom Groq API key
- `Authorization`: Clerk token

**Request Body**:
```json
{
  "transcript": "What is the virtual DOM in React?",
  "resume": "5 years experience with React...",  // optional
  "jd": "Job description with required skills...",  // optional
  "audioChunkDuration": 5  // ignored in chat mode, used for voice
}
```

**Response Structure - Chat Mode**:
```json
{
  "isQuestion": true,
  "question": "What is the virtual DOM in React?",
  "confidence": 0.95,
  "type": "concept",                    // "concept", "coding", "system_design", "behavioral"
  "difficulty": "medium",               // "easy", "medium", "hard"
  "sections": [
    {
      "title": "What is the Virtual DOM?",
      "content": "The virtual DOM is a JavaScript representation...",
      "points": [
        "Lightweight in-memory copy of the real DOM",
        "Improves performance through diffing"
      ]
    },
    {
      "title": "Why It Matters",
      "content": "...",
      "points": [...]
    }
  ],
  "code": "const vdom = <div>Hello</div>;",
  "codeLanguage": "javascript",
  "bullets": [],
  "spoken": "..."                       // For TTS playback
}
```

**Response Structure - Voice Mode**:
```json
{
  "isQuestion": true,
  "question": "What is the virtual DOM?",
  "confidence": 0.87,
  "type": "technical",                  // "technical", "behavioral", "general"
  "bullets": [
    "Lightweight in-memory representation of DOM",
    "React re-renders virtually before updating real DOM",
    "Improves performance by batching updates"
  ],
  "spoken": "The virtual DOM is an in-memory..."
}
```

**Response** (not a question):
```json
{
  "isQuestion": false,
  "question": "thanks for listening",
  "confidence": 0.05,
  "bullets": []
}
```

**Status Codes**:
- `200`: Success
- `400`: Missing transcript
- `402`: Chat/Voice quota exceeded
- `500`: Analysis failed

**Processing Pipeline**:

#### Chat Mode Pipeline:
1. **Vector Cache Lookup** (if enabled)
   - Embed transcript using Xenova all-MiniLM-L6-v2
   - Compare against cached embeddings (cosine similarity > 0.82 threshold)
   - Return cached answer if high similarity hit found
   - Metrics: `bestScore > 0.82` → cache hit

2. **Question Classification** (if not in fast mode)
   - Model: `llama-3.1-8b-instant`
   - Classifies into: concept | coding | system_design | behavioral
   - Difficulty: easy | medium | hard
   - Returns JSON with `type` and `difficulty`

3. **Answer Generation**
   - Model: 
     - Fast mode: `llama-3.1-8b-instant` (max_tokens=1536)
     - Full mode: `llama-3.3-70b-versatile` (slower, higher quality)
   - Format: JSON with `sections[]`, `code`, `explanation`, `spoken`
   - Applies answer style adjustments to system prompt

4. **Confidence Calculation**
   - Uses logprobs if available
   - Falls back to self-estimation LLM call (only in full mode)

5. **Self-Verification** (for hard/system_design with confidence < 0.8)
   - Second pass with `llama-3.1-8b-instant`
   - Checks answer validity, fixes issues
   - Only triggered when confidence is low

#### Voice Mode Pipeline:
1. **Vector Cache Lookup** (same as chat)

2. **Question Detection**
   - Model: `llama-3.1-8b-instant`
   - Returns JSON: `{ isQuestion: boolean, question: string, ... }`
   - Applies low confidence guard: `confidence < 0.2 → reject`

3. **Response Generation**
   - Structured as bullet points for quick speaking
   - Short, interview-ready phrasing

**Special Features**:
- **Prompt Caching**: Uses embedding similarity to avoid redundant LLM calls
- **Answer Styles**: 
  - `short`: 2-4 paragraphs / 4-6 bullets
  - `balanced`: standard detail level
  - `detailed`: comprehensive sections + examples
- **Temperature**: 0.4 for chat, 0.3 for voice (deterministic, accurate)

---

### 5. Streaming Analysis
**Endpoint**: `POST /api/analyze/stream`

**Middleware Stack**:
- Same as `/api/analyze` but uses `quotaMiddleware('chat')` (chat only)

**Headers**:
- Same as `/api/analyze`
- Required: `x-mode: "chat"` (voice mode not supported for streaming)

**Request Body**:
```json
{
  "transcript": "...",
  "resume": "...",
  "jd": "..."
}
```

**Response Format**: Server-Sent Events (SSE)
```
data: {"type":"preview","text":"The virtual DOM is "}
data: {"type":"preview","text":"a lightweight JavaScript representation"}
data: {"type":"final","data":{...complete answer...}}
data: {"type":"done"}
```

**Event Types**:
- `preview`: Streaming explanation text as it's generated
- `final`: Complete structured answer once LLM finishes
- `done`: Stream end signal
- `error`: Error occurred during streaming

**Content-Type**: `text/event-stream; charset=utf-8`

**Cache-Control**: `no-cache, no-transform`

**Status Codes**:
- `200`: Streaming started
- `400`: Mode not "chat" or transcript missing
- `402`: Chat quota exceeded
- `500`: Analysis error (sent via SSE)

---

### 6. Cache Generation
**Endpoint**: `POST /api/generate-cache`

**Middleware Stack**:
- Clerk Auth (global)
- Rate Limiter
- Auth Middleware
- **Does NOT use quota middleware** (but checks quota internally)

**Authentication**: Requires signed-in user (Clerk)

**Request Body**:
```json
{
  "jd": "Senior React Engineer at TechCorp. 5+ years experience...",  // ≥50 chars required
  "resume": "..."  // optional
}
```

**Response** (success, async):
```json
{
  "status": "Cache generation started",
  "count": 0
}
```

**Error Responses**:

```json
{
  "status": "Plan required",
  "message": "Interview cache generation requires Basic or Pro. Upgrade your plan."
}
```

```json
{
  "message": "Not enough chat quota for cache generation (needs at least 8 messages remaining).",
  "code": "quota_exceeded"
}
```

```json
{
  "status": "JD too short"
}
```

**Status Codes**:
- `200`: Cache generation started
- `400`: JD too short (<50 chars)
- `401`: User not found
- `402`: Insufficient chat quota (< 8 messages)
- `403`: Plan doesn't support cache generation

**Plan Requirements**:
- Free: ✗ (no cache generation)
- Basic+: ✓ (cache generation enabled)
- Pro: ✓
- Enterprise: ✓

**Minimum Quota**:
- Requires ≥8 chat messages remaining (estimated cost per cache run)

**Processing Pipeline**:
1. **Question Generation**
   - Model: `llama-3.1-8b-instant`
   - Prompt: `buildCacheQuestionsPrompt(jd)`
   - Output: Array of 10-20 likely interview questions

2. **For Each Question**:
   - Generate detailed answer
   - Extract variants (rephrasings for better semantic matching)
   - Compute embeddings:
     - Main question embedding (Xenova all-MiniLM-L6-v2)
     - Variant embeddings (for better recall on similar phrasings)
   - Store cache entry: `{ id, question, embedding, variantEmbeddings, answer }`

3. **Cache Persistence**
   - Stored in-memory during session
   - Saved to disk: `os.tmpdir()/interviewguru_cache.json`
   - Loaded on server restart

**Cache Entry Structure**:
```javascript
{
  id: "randomId123",
  question: "What is the virtual DOM?",
  embeddingModel: "all-MiniLM-L6-v2",
  embedding: [0.123, -0.456, ...],  // 384-dim vector
  variants: [
    "How does virtual DOM work?",
    "Explain the vdom concept"
  ],
  variantEmbeddings: [[...], [...]],
  answer: {
    type: "concept",
    difficulty: "medium",
    sections: [...],
    code: "...",
    codeLanguage: "javascript",
    spoken: "..."
  }
}
```

---

## Database Schema

### Overview
- **Type**: PostgreSQL (cloud: Neon)
- **Migration Tool**: node-pg-migrate
- **Location**: `backend/migrations/*.js`
- **Fallback**: In-memory storage (JSON file) when DATABASE_URL not set

### Tables

#### `ig_users`
**Primary Key**: `clerk_user_id` (TEXT)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `clerk_user_id` | TEXT | - | Primary key, from Clerk authentication |
| `email` | TEXT | `''` | User email address |
| `plan` | VARCHAR(32) | `'free'` | Plan tier: free \| basic \| pro \| enterprise |
| `subscription_status` | VARCHAR(32) | `'trial'` | Status: active \| expired \| cancelled \| trial |
| `trial_started_at` | TIMESTAMPTZ | NOW() | Trial start timestamp |
| `billing_month` | VARCHAR(7) | - | Format: "YYYY-MM" for monthly quota resets |
| `voice_minutes_used` | INT | 0 | Minutes used in current period |
| `chat_messages_used` | INT | 0 | Messages used in current period |
| `sessions_used` | INT | 0 | Sessions used in current period |
| `signup_ip` | TEXT | - | IP address at signup (optional) |
| `created_at` | TIMESTAMPTZ | NOW() | User creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOW() | Last update timestamp |

**Constraints**:
- Primary Key: `clerk_user_id`
- No foreign keys to other tables in baseline schema

**Notes**:
- For free plan users: Quota tracked as `billing_month = "lifetime"`
- For paid plans: Resets monthly based on calendar month (YYYY-MM)
- `trial_started_at` tracks when trial period began (for expiry logic)

---

#### `ig_sessions`
**Primary Key**: `id` (TEXT)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | TEXT | PRIMARY KEY | Unique session ID (generated client-side) |
| `clerk_user_id` | TEXT | FK → ig_users, ON DELETE CASCADE | Session owner |
| `started_at` | TIMESTAMPTZ | NOT NULL | Session start time |
| `ended_at` | TIMESTAMPTZ | - | Session end time (null if active) |
| `questions_asked` | INT | DEFAULT 0 | Count of questions in session |
| `voice_minutes_used` | INT | DEFAULT 0 | Total voice minutes used |
| `status` | VARCHAR(32) | NOT NULL | active \| completed \| abandoned |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Record creation time |

**Indexes**:
- `ig_sessions_user_idx`: ON `(clerk_user_id)` — fast user session lookup
- `ig_sessions_user_started_idx`: ON `(clerk_user_id, started_at DESC)` — recent sessions first

**Notes**:
- Tracks active interview/chat sessions for analytics
- Used for session history and duration calculations
- Automatically deleted when user is deleted (CASCADE)

---

### Migrations

**Baseline Migration**: `1700000000000_baseline-ig-tables.js`
- Creates `ig_users` and `ig_sessions` tables
- Creates indexes for performance

**Enhancement Migrations**:
- `1700000000001_add-clerk-env-to-ig-users.js` — Clerk environment tracking
- `1700000000002_expand-billing-month-to-10.js` — Extended billing month storage

**Running Migrations**:
```bash
# Up (apply)
npm run db:migrate

# Down (rollback)
npm run db:migrate:down

# Create new migration
npm run db:migrate:create
```

---

## Authentication & Authorization

### Clerk Integration

**Current Approach**:
- **Clerk Middleware**: `@clerk/express` package
- **Keys**:
  - `CLERK_SECRET_KEY` (production/live) or `CLERK_SECRET_KEY_DEV` (development)
  - `CLERK_PUBLISHABLE_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` (frontend, shared with backend)

**Key Resolution** (`backend/config/clerkKeys.ts`):
```typescript
function clerkSecretKeyForNode(): string {
  const dev = process.env.CLERK_SECRET_KEY_DEV?.trim() || '';
  const main = process.env.CLERK_SECRET_KEY?.trim() || '';
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv !== 'production' && dev) return dev;
  return main;
}

function clerkPublishableKeyForNode(): string {
  const dev = process.env.VITE_CLERK_PUBLISHABLE_KEY_DEV?.trim() || '';
  const main = process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY;
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv !== 'production' && dev) return dev;
  return main;
}
```

**Important**: Browser and backend must use matching key pairs (both test or both live).

### Auth Middleware Flow

**Middleware Chain**:
1. **Global `clerkAuthMiddleware`** (first in stack)
   - Parses Clerk JWT from request headers
   - Sets up AsyncLocalStorage for `getAuth()` calls
   - No-op if `CLERK_SECRET_KEY` not set (local dev guest mode)

2. **Route-Level `authMiddleware`** (after rate limiter)
   - Resolves user identity
   - Sets `req.user` object on `AuthRequest`

**Guest Mode** (Development Only):
- Triggered when Clerk is disabled (no secret key) AND `NODE_ENV !== 'production'`
- Generates guest ID: `guest_<hash(ip:userAgent)>` (SHA256 first 12 chars)
- User record:
  ```json
  {
    "userId": "guest_abc123def456",
    "email": "",
    "plan": "free"
  }
  ```
- In-memory quota tracking only (persisted to JSON file if path available)

**Production Requirement**:
- `NODE_ENV === 'production'` without `CLERK_SECRET_KEY` → returns `503` auth_misconfigured error
- No anonymous/guest access in production

### User Identity Resolution

**Authenticated User** (`authMiddleware`):
```typescript
interface AuthUser {
  userId: string;        // Clerk user ID
  email: string;
  plan: 'free' | 'basic' | 'pro' | 'enterprise';
}
```

**Guest User** (dev only):
```typescript
{
  userId: 'guest_<hash>',
  email: '',
  plan: 'free'
}
```

### User Sync with Database

**Service**: `backend/services/clerkUserSync.ts` → `loadClerkUserForRequest(userId, clientIp)`

**Flow**:
1. Receive Clerk `userId` and client IP from request
2. Load from database (or create if missing)
3. Sync email from Clerk (if changed)
4. Track signup IP (first request only)
5. Return `UserRecord` for quota/plan checks

---

## Rate Limiting

### Configuration

**File**: `backend/middleware/rateLimiter.ts`

**Limiter**: `express-rate-limit` with identity-aware key generation

**Default Limits**:
- **Per Minute**: 20-500 requests (configurable via `API_RATE_LIMIT_PER_MINUTE` env)
- **Default**: 180 requests/minute
- **Window**: 60,000ms (1 minute)

**Key Generation** (per identity):
- **Authenticated**: `user:<clerk_user_id>` (per signed-in user)
- **Guest**: `ip:<IP_ADDRESS>` (per IP if no Clerk session)

**Skipped Routes**:
- `/api/health` and `/health` paths (health checks don't count)

**Headers Returned**:
- `RateLimit-Limit`: Total requests allowed per window
- `RateLimit-Remaining`: Remaining requests
- `RateLimit-Reset`: Unix timestamp when window resets

**Error Response** (429 Too Many Requests):
```json
{
  "limit": 180,
  "current": 181,
  "remaining": 0,
  "resetTime": "2025-04-26T10:31:00.000Z"
}
```

### IP Resolution

**Precedence**:
1. `x-forwarded-for` header (first value before comma)
2. `req.socket.remoteAddress`
3. `req.ip`
4. Fallback: `'unknown-ip'`

---

## Quota & Usage Tracking System

### Overview

**Purpose**: Track and enforce per-user consumption limits based on plan tier

**Storage**:
- **Primary**: PostgreSQL (when DATABASE_URL is set)
- **Fallback**: In-memory Maps persisted to JSON file (for desktop app)

**Quota Types**:
1. **Voice Minutes**: Audio capture + transcription
2. **Chat Messages**: Question analysis calls
3. **Sessions**: Active interview sessions

### Plan Tiers & Limits

**File**: `shared/constants/planLimits.ts`

| Plan | Price | Voice Minutes/mo | Chat Messages/mo | Sessions/mo | TTS | Cache Gen | Export |
|------|-------|-----------------|------------------|-------------|-----|-----------|--------|
| Free | $0 | 15 (lifetime) | 10 (lifetime) | ∞ | ✗ | ✗ | ✗ |
| Basic | $9.99 | 60 | 500 | 1 | ✓ | ✓ | ✗ |
| Pro | $29.99 | 600 | 5000 | 10 | ✓ | ✓ | ✓ |
| Enterprise | Custom | ∞ | ∞ | ∞ | ✓ | ✓ | ✓ |

**Free Plan Peculiarity**:
- Quota is **lifetime** (one-time), not monthly
- Tracked via `billing_month = "lifetime"`
- Never resets

### Quota Enforcement

**Middleware**: `quotaMiddleware(quotaType)` and `analyzeQuotaMiddleware`

**Flow**:
1. Get user identity from `authMiddleware`
2. Load user from database
3. Call `resetMonthlyUsageIfNeeded(user)` to reset if month has changed
4. Get remaining quota via `getRemainingQuota(userId, quotaType)`
5. If remaining ≤ 0 → return `402 Payment Required`
6. Proceed to handler

**Response** (quota exceeded):
```json
{
  "message": "Monthly voice quota exceeded. Please upgrade your plan.",
  "code": "quota_exceeded",
  "quotaType": "voice"
}
```

### Recording Usage

**Functions**:
- `recordVoiceUsage(userId, minutes)` — adds to `voice_minutes_used`
- `recordChatUsage(userId, messageCount)` — adds to `chat_messages_used`

**Calling Points**:
- `/api/transcribe`: Records voice usage after successful transcription
- `/api/analyze` (chat mode): Records chat usage after answer generation
- `/api/analyze/stream`: Records chat usage after streaming completes

**In-Memory + Database Sync**:
- Updates in-memory Map immediately
- If database connected, updates Postgres asynchronously
- If not connected, persists to JSON file on timer (300ms debounce)

### Monthly Reset Logic

**Function**: `resetMonthlyUsageIfNeeded(user)`

**Trigger**:
- Called on every quota check request
- Compares `user.currentMonth` with computed month for plan

**Month Computation**:
```typescript
function usagePeriodForPlan(plan: PlanTier): string {
  return plan === 'free' ? 'lifetime' : getCurrentMonth();
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);  // "2025-04"
}
```

**Reset Logic**:
- If `user.currentMonth !== expectedMonth`:
  - Set `voiceMinutesUsed = 0`
  - Set `chatMessagesUsed = 0`
  - Set `sessionsUsed = 0`
  - Update `currentMonth = expectedMonth`
  - Save to database

---

## External Services

### Groq API Integration

**Service**: `backend/api/server.ts` → `getGroq(customKey?)`

**Library**: `groq-sdk` (npm package)

**Endpoints Used**:
1. **Audio Transcription**
   - `groq.audio.transcriptions.create()`
   - Model: Configurable (default: `"whisper-large-v3-turbo"`)
   - Input: WAV/MP4/WebM audio file stream
   - Output: JSON with transcription text

2. **Chat Completions**
   - `groq.chat.completions.create()`
   - Models: 
     - `"llama-3.1-8b-instant"` (fast, 8b)
     - `"llama-3.3-70b-versatile"` (powerful, 70b)
   - Input: Messages array with role/content
   - Output: Text or JSON (via `response_format`)

**Key Management**:
- **Server Key**: `process.env.GROQ_API_KEY` (fallback for server requests)
- **Client Key**: `x-api-key` header (BYOK mode, if allowed)
- **Key Priority**:
  1. Use `x-api-key` if present AND client key is allowed
  2. Fall back to `GROQ_API_KEY` if available
  3. Throw error if neither available

**BYOK Mode** (`BYOK_MODE` env var):
- When enabled, server accepts user-provided Groq keys
- Useful for reducing server costs (users pay for their own API)
- Affects model selection: defaults to fast mode (8b) in BYOK

**Error Handling**:
- `429 Too Many Requests`: Groq rate limit hit → return 429 with retry-after header
- `401 Unauthorized`: Invalid key → return 401 "API key required"
- `500`: Network/parse error → return 500

### Google Gemini TTS (Text-to-Speech)

**Currently Not Implemented** in backend (comment-only references)

**Expected Integration**:
- Service for reading answers aloud
- Called from frontend (`useAIAssistant.ts` hook)
- May need API key management similar to Groq

**Note**: Need to implement or document TTS call chain when migrating.

### Xenova Transformers (Embeddings)

**Library**: `@xenova/transformers` (npm package)

**Model**: `"Xenova/all-MiniLM-L6-v2"`

**Function**: `getEmbedding(text: string): Promise<number[]>`

**Details**:
- Downloads model on first call (lazy loading)
- Outputs 384-dimensional vectors
- Used for vector cache similarity matching

**Lazy Loading**:
```typescript
let extractor: any = null;
async function getEmbedding(text: string): Promise<number[]> {
  if (!extractor) {
    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = false;
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data) as number[];
}
```

**Performance Note**:
- Model is ~100MB WASM binary
- Avoided in `/api/health` to prevent cold-start delays
- Only loaded when `/api/analyze` or `/api/generate-cache` is called

---

## Data Models & Types

### Core Types

**File**: `shared/types/index.ts`

#### `UserRecord`
```typescript
interface UserRecord {
  userId: string;                    // Clerk user ID
  email: string;
  plan: PlanTier;                    // 'free' | 'basic' | 'pro' | 'enterprise'
  trialsUsed: boolean;
  trialStartDate?: number;
  subscriptionStatus: 'active' | 'expired' | 'cancelled' | 'trial';

  currentMonth: string;              // "YYYY-MM" or "lifetime" for free
  voiceMinutesUsed: number;
  chatMessagesUsed: number;
  sessionsUsed: number;

  activeSessions: string[];          // Session IDs
  sessionHistory: SessionRecord[];

  createdAt: number;                 // Unix timestamp
  lastActiveAt: number;
  stripeCustomerId?: string;
}
```

#### `SessionRecord`
```typescript
interface SessionRecord {
  sessionId: string;
  startTime: number;                 // Unix timestamp
  endTime?: number;
  questionsAsked: number;
  voiceMinutesUsed: number;
  status: 'active' | 'completed' | 'abandoned';
}
```

#### `AuthRequest` (Express Request Extension)
```typescript
interface AuthRequest extends Express.Request {
  user?: {
    userId: string;
    email: string;
    plan: PlanTier;
  };
}
```

#### `PlanTier`
```typescript
type PlanTier = 'free' | 'basic' | 'pro' | 'enterprise';
```

#### `PlanConfig`
```typescript
interface PlanConfig {
  name: string;
  price: number | null;
  currency: string;
  billingPeriod: 'one-time' | 'month' | 'year';
  voiceMinutesPerMonth: number;
  chatMessagesPerMonth: number;
  sessionsPerMonth: number;
  features: Record<string, boolean>;
  notes: string;
}
```

### Response Models

#### Chat Answer Response
```typescript
interface ChatAnswerResponse {
  isQuestion: boolean;
  question: string;
  confidence: number;                // 0.0-1.0
  type: 'concept' | 'coding' | 'system_design' | 'behavioral';
  difficulty: 'easy' | 'medium' | 'hard';
  sections: Array<{
    title: string;
    content: string;
    points: string[];
  }>;
  code: string;
  codeLanguage: string;
  bullets: string[];
  spoken: string;
}
```

#### Voice Answer Response
```typescript
interface VoiceAnswerResponse {
  isQuestion: boolean;
  question: string;
  confidence: number;
  type: 'technical' | 'behavioral' | 'general';
  bullets: string[];
  spoken: string;
}
```

#### Transcription Response
```typescript
interface TranscriptionResponse {
  text: string;
  usage: {
    voiceMinutesUsed: number;
    remainingMinutes: number;
  };
}
```

---

## Middleware Pipeline

### Execution Order

```
Request
  ↓
1. Express JSON Parser (25MB limit)
  ↓
2. CORS Handler (origin, methods, headers)
  ↓
3. Global clerkAuthMiddleware (sets up AsyncLocalStorage, parses JWT)
  ↓
4. Static file serving (if applicable)
  ↓
5. /api/health route (before rate limiter)
  ↓
6. /api/cron/keep-warm route (before rate limiter)
  ↓
7. Global apiBurstLimiter (180 req/min per user/IP)
  ↓
8. Global authMiddleware (resolves user identity)
  ↓
9. Route-Specific quotaMiddleware (checks remaining quota)
  ↓
10. Route Handler (transcribe, analyze, etc.)
  ↓
Response
```

### Key Middleware Details

#### CORS Handler
```javascript
app.use((req, res, next) => {
  const originHeader = req.headers.origin;
  if (originHeader) {
    const normalized = normalizeCorsOrigin(originHeader);
    if (corsAllowlist.has(normalized)) {
      res.header('Access-Control-Allow-Origin', normalized);
      res.header('Access-Control-Allow-Credentials', 'true');
    }
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', '...');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
```

**Allowlist Construction** (`buildCorsAllowlist()`):
- Parses `CORS_ALLOWLIST` env var (comma-separated origins)
- Includes localhost for dev
- Normalizes origins (removes trailing slash, lowercases)

#### Rate Limiter Behavior
- Skips `/health` and `/api/health` routes
- Groups by `user:<userId>` OR `ip:<IP_ADDRESS>`
- Returns 429 Too Many Requests if exceeded
- Includes `RateLimit-*` headers in response

#### Auth Middleware Decision Tree
```
if (Clerk enabled) {
  ├─ Get auth from Clerk JWT
  ├─ If no userId → 401 "Sign in required"
  └─ If userId → Sync with DB, set req.user
} else if (production) {
  └─ Return 503 "Auth misconfigured"
} else {
  └─ Create guest identity (dev only)
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| `200` | OK | Successful analysis |
| `400` | Bad Request | Missing required fields |
| `401` | Unauthorized | Missing/invalid Clerk token, user not found |
| `402` | Payment Required | Quota exceeded |
| `403` | Forbidden | Plan doesn't support feature (e.g., cache gen) |
| `429` | Too Many Requests | Rate limit exceeded |
| `503` | Service Unavailable | Database unavailable, server misconfigured |
| `500` | Internal Server Error | Unexpected error |

### Error Response Format

**Standard**:
```json
{
  "error": "Description of what went wrong"
}
```

**With Code**:
```json
{
  "error": "Description",
  "code": "error_code"
}
```

**With Details**:
```json
{
  "error": "Description",
  "message": "More detailed message",
  "code": "error_code",
  "quotaType": "voice"  // if applicable
}
```

### Common Error Scenarios

#### Missing Groq API Key
```javascript
const err = new Error(
  'Groq API key required. Add your key in the app settings (BYOK), or set GROQ_API_KEY on the server.'
);
(err as any).status = 401;
throw err;
```

#### Quota Exceeded
```json
{
  "message": "Monthly voice quota exceeded. Please upgrade your plan.",
  "code": "quota_exceeded",
  "quotaType": "voice"
}
```

#### Clerk Key Mismatch (Dev Warning)
```
[Clerk] Browser uses a dev key (pk_test_*) but CLERK_SECRET_KEY is sk_live_*. 
/api/* will return 401 until they match.
```

---

## Configuration & Environment Variables

### Backend Configuration Files

**Location**: `backend/.env` or system environment

### Required Environment Variables

#### Database
- `DATABASE_URL`: PostgreSQL connection string
  - Format: `postgresql://user:password@host:port/database`
  - Neon example: `postgresql://user:password@host.neon.tech/database`
  - Optional: Falls back to in-memory if not set

#### Clerk Authentication
- `CLERK_SECRET_KEY` or `CLERK_SECRET_KEY_DEV`: Backend JWT validation
  - `sk_test_*` (test environment)
  - `sk_live_*` (production)
  - Required for authentication (no guest mode in production)

- `CLERK_PUBLISHABLE_KEY` or `VITE_CLERK_PUBLISHABLE_KEY`: Frontend key (shared)
  - Must match secret key pair
  - Used for browser auth

#### Groq API
- `GROQ_API_KEY`: Server-side Groq API key (fallback for requests)
  - Optional if BYOK_MODE enabled
  - Format: `gsk_*`

#### Optional Features
- `BYOK_MODE`: Enable Bring-Your-Own-Key mode (accept `x-api-key` header)
  - Values: `true`, `1`, `yes` (case-insensitive)
  - Default: `false` (unless NODE_ENV is 'production')

- `ALLOW_CLIENT_GROQ_KEY`: Allow clients to send custom Groq keys
  - Values: `true`, `false`, `1`, `0`, `yes`, `no`
  - Default: `false` in production, `true` in dev

- `ANALYZE_FAST_MODE`: Always use fast (8b) models
  - Default: `true` in dev, determined by BYOK_MODE in prod

- `ANALYZE_FULL_PIPELINE`: Always use full (70b) models
  - Overrides ANALYZE_FAST_MODE

- `ANALYZE_VECTOR_CACHE`: Enable vector cache in dev
  - Default: `false` (enabled in prod)

#### Rate Limiting
- `API_RATE_LIMIT_PER_MINUTE`: Requests per minute
  - Default: `180`
  - Range: 20-500

#### Cron & Health
- `CRON_SECRET`: Bearer token for `/api/cron/keep-warm`
  - Required in production (Vercel injects via env)
  - Optional in dev

- `HEALTH_CHECK_DB`: Deep health check includes DB query
  - Default: checks query string `?deep=1`

#### Storage (Desktop/Offline)
- `INTERVIEWGURU_USAGE_STORE`: Path for in-memory storage JSON file
  - Default: 
    - Windows: `%APPDATA%/InterviewGuru/usage-store.json`
    - Unix: `~/.interviewguru/usage-store.json`
  - Set for serverless to disable (no writable filesystem)

#### Server Runtime
- `NODE_ENV`: `'development'` or `'production'`
  - Affects: Key resolution, auth fallback, feature defaults

- `PORT`: HTTP server port
  - Default: `3000`

- `JSON_BODY_LIMIT`: Max request body size
  - Default: `'25mb'`

- `CORS_ALLOWLIST`: Comma-separated allowed origins
  - Default: includes `localhost:*`

#### Database Connection Tuning
- `DATABASE_SSL`: Enable/disable SSL for PostgreSQL
  - Default: `true` (SSL required)
  - Set `'false'` to disable (local dev only)

### Example `.env` File

```bash
# Database
DATABASE_URL=postgresql://user:password@neon-host.neon.tech/database?sslmode=require

# Clerk Auth
CLERK_SECRET_KEY_DEV=sk_test_xyz123...
VITE_CLERK_PUBLISHABLE_KEY_DEV=pk_test_abc456...

# Groq API
GROQ_API_KEY=gsk_xyz123...

# Features
BYOK_MODE=false
ALLOW_CLIENT_GROQ_KEY=false
ANALYZE_FAST_MODE=false

# Rate Limiting
API_RATE_LIMIT_PER_MINUTE=180

# Server
NODE_ENV=development
PORT=3000
CRON_SECRET=your-secret-token-here
```

### Configuration Loading

**Order of Operations** (server startup):
1. `loadEnvFirst()` — Load `.env` immediately (must be first import)
2. `initializeDatabase()` — Connect to Postgres or fall back to in-memory
3. `resolveClerkExpressMiddleware()` — Initialize Clerk with env values
4. Setup Express app with middleware stack

**Critical**: `loadEnvFirst()` must run before any other module reads `process.env`.

---

## Vector Cache System

### Cache Structure

**In-Memory Storage**:
```typescript
let vectorCache: any[] = [];  // Loaded from disk on startup
```

**Persistence**:
- Location: `os.tmpdir()/interviewguru_cache.json`
- Loaded automatically on server restart
- Updated by `/api/generate-cache` endpoint

### Cache Entry Format

```typescript
interface CacheEntry {
  id: string;                        // Random unique ID
  question: string;                  // Original question
  embeddingModel: string;            // "all-MiniLM-L6-v2"
  embedding: number[];               // 384-dim vector
  variants: string[];                // Rephrasings of question
  variantEmbeddings: number[][];      // Embeddings of variants
  answer: {
    type: 'concept' | 'coding' | ... ;
    difficulty: 'easy' | 'medium' | 'hard';
    sections: Array<{
      title: string;
      content: string;
      points: string[];
    }>;
    code: string;
    codeLanguage: string;
    spoken: string;                  // For TTS
  };
}
```

### Cache Lookup Algorithm

**Similarity Threshold**: `0.82` (cosine similarity)

**Matching Process**:
1. Embed incoming transcript using same model (all-MiniLM-L6-v2)
2. For each cache entry:
   - Compute cosine similarity against main question embedding
   - If variants exist, also compute against all variant embeddings
   - Track the highest similarity score
3. Sort by similarity, take top 5 candidates
4. Return top match if score > 0.82
5. If match found, return cached answer immediately (skip LLM)

**Cosine Similarity**:
```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

### Cache Hit Benefits

**Performance**:
- Zero-latency response (no LLM call)
- Can respond in <100ms vs. 5-30s for LLM

**Cost Savings**:
- Skip expensive LLM inference
- Reduce API calls to Groq

**Quality**:
- Pre-curated, verified answers
- Consistent responses for common questions

---

## AI Pipeline Details

### Prompt Building

**File**: `shared/prompts/index.ts`

**System Prompts**:
- `buildVoiceSystemPrompt()` — For voice mode question detection
- `buildChatSystemPrompt()` — For chat mode answer generation
- `buildQuestionClassificationPrompt()` — Classify into type/difficulty
- `buildAnswerConfidencePrompt()` — Self-estimate confidence
- `buildAnswerVerificationPrompt()` — Verify hard answers
- `buildCacheQuestionsPrompt()` — Generate interview questions
- `buildCacheAnswerPrompt()` — Generate answers for caching

### Model Selection Strategy

**Voice Mode**:
- Detection: `llama-3.1-8b-instant` (always)
- Fast baseline: `llama-3.1-8b-instant`

**Chat Mode**:
- Classification: `llama-3.1-8b-instant`
- Generation:
  - Fast: `llama-3.1-8b-instant` (max_tokens=1536)
  - Full: `llama-3.3-70b-versatile` (unlimited)
- Confidence: `llama-3.1-8b-instant` (if needed)
- Verification: `llama-3.1-8b-instant` (for hard questions)

**Cache Generation**:
- Question Gen: `llama-3.1-8b-instant`
- Answer Gen: `llama-3.1-8b-instant` (per question, sequential)

### Temperature Settings

| Task | Temperature | Reason |
|------|-------------|--------|
| Voice detection | 0.3 | Deterministic, fast |
| Chat generation | 0.4 | Balanced accuracy/variety |
| Classification | 0.1 | Consistent categorization |
| Confidence calc | 0.1 | Consistent estimation |
| Verification | 0.2 | Accurate fixing |
| Cache questions | 0.3 | Deterministic generation |

### Response Format Control

**JSON Mode** (forced):
```typescript
response_format: { type: "json_object" }
```

**Logprobs** (optional, for confidence):
```typescript
logprobs: true  // Only on supported models (llama3-8b-8192)
```

**Max Tokens** (optimization):
- Voice: 768 (in fast mode)
- Chat: 1536 (in fast mode), unlimited (full mode)

### Answer Style Modifications

**Style Input**: Header `x-answer-style: "short" | "balanced" | "detailed"`

**Prompt Injection**:
```typescript
function applyAnswerStyleToPrompt(basePrompt: string, style: AnswerStyle): string {
  if (style === 'short') {
    return `${basePrompt}\n\nAdditional style requirement: keep the response concise (2-4 short paragraphs or 4-6 bullets).`;
  }
  // Similar for 'detailed'
  return basePrompt;
}
```

---

## Migration Checklist

### Phase 1: Core Infrastructure

- [ ] Set up ASP.NET Core project (latest LTS)
- [ ] Configure dependency injection & options pattern
- [ ] Set up PostgreSQL connection pool (EF Core or Dapper)
- [ ] Implement configuration loading from environment variables
- [ ] Set up logging (Serilog or built-in)
- [ ] Configure CORS middleware
- [ ] Implement error handling middleware

### Phase 2: Authentication & Authorization

- [ ] Integrate Clerk SDK for .NET (if available) OR JWT validation
- [ ] Implement custom JWT validation from Clerk
- [ ] Build AuthRequest/AuthUser extension models
- [ ] Implement guest identity generation (for dev)
- [ ] Set up AsyncLocal/context for auth state
- [ ] Implement Clerk user sync service

### Phase 3: Database & Persistence

- [ ] Create EF Core DbContext for `ig_users` and `ig_sessions` tables
- [ ] Run migrations or scaffold existing schema
- [ ] Implement `IUsageStorage` interface with both PostgreSQL and in-memory variants
- [ ] Build `IUserRepository` for user CRUD operations
- [ ] Build `ISessionRepository` for session tracking
- [ ] Implement in-memory JSON persistence as fallback

### Phase 4: Rate Limiting & Quotas

- [ ] Implement rate limiting middleware (per-user/IP)
- [ ] Build quota checking service
- [ ] Implement `quotaMiddleware` for each endpoint
- [ ] Build usage recording (voice, chat, sessions)
- [ ] Implement monthly reset logic
- [ ] Build plan-based feature checking

### Phase 5: External Service Integration

- [ ] Integrate Groq SDK for .NET
  - [ ] Audio transcription endpoint
  - [ ] Chat completions endpoint
- [ ] Implement custom Groq key support (BYOK)
- [ ] Build embedding service (Xenova or alternative)
- [ ] Implement vector cache lookup algorithm
- [ ] (Optional) Integrate Google Gemini for TTS

### Phase 6: API Endpoints

- [ ] `GET /api/health` (shallow & deep)
- [ ] `GET /api/cron/keep-warm` (with CRON_SECRET)
- [ ] `POST /api/transcribe` (with quota)
- [ ] `POST /api/analyze` (chat & voice modes)
- [ ] `POST /api/analyze/stream` (SSE streaming)
- [ ] `POST /api/generate-cache` (with plan check)

### Phase 7: AI Pipeline

- [ ] Implement question classification
- [ ] Build chat mode answer generation
- [ ] Build voice mode answer generation
- [ ] Implement confidence calculation (logprobs or LLM)
- [ ] Implement answer verification for hard questions
- [ ] Build cache generation pipeline
- [ ] Implement Whisper hallucination filtering
- [ ] Implement technical term corrections

### Phase 8: Caching System

- [ ] Build vector cache in-memory storage
- [ ] Implement cache persistence (JSON file)
- [ ] Implement cache loading on startup
- [ ] Implement cosine similarity algorithm
- [ ] Build cache lookup with threshold (0.82)
- [ ] Integrate cache into `/api/analyze` flow

### Phase 9: Testing & Validation

- [ ] Unit tests for quota logic
- [ ] Unit tests for auth middleware
- [ ] Integration tests for rate limiter
- [ ] Integration tests for database operations
- [ ] End-to-end tests for transcribe → analyze flow
- [ ] Load testing (rate limit behavior)
- [ ] Test Groq API error handling

### Phase 10: Deployment & Configuration

- [ ] Document all environment variables
- [ ] Create deployment guide for Azure/Vercel
- [ ] Set up health check endpoints
- [ ] Configure database connection pooling
- [ ] Document CORS allowlist setup
- [ ] Create migration scripts
- [ ] Test production error logging
- [ ] Performance profiling & optimization

### Phase 11: Frontend Integration

- [ ] Test API compatibility with existing frontend
- [ ] Verify auth header handling
- [ ] Test quota enforcement UX
- [ ] Test error response format compatibility
- [ ] Test streaming responses
- [ ] Load testing from frontend

### Phase 12: Go-Live

- [ ] Final security audit
- [ ] Database backup strategy
- [ ] Rollback plan
- [ ] Monitor production logs
- [ ] Track error rates
- [ ] Monitor API latency
- [ ] Verify quota tracking accuracy

---

## Key Implementation Notes for .NET

### 1. Async/Await Patterns
- All database operations must be async
- All external API calls must be async
- Use `Task<T>` return types throughout

### 2. Dependency Injection
- Register services in `Startup.cs` / `Program.cs`
- Use constructor injection in controllers
- Consider factory patterns for Groq/Gemini clients

### 3. Middleware Order
- Critical: Order matters (auth → rate limit → quota)
- Clerk middleware should be registered early
- Rate limiter before auth, not after

### 4. Error Handling
- Create custom exception types (e.g., `QuotaExceededException`)
- Map exceptions to HTTP responses in middleware
- Log all errors with structured logging

### 5. Configuration Management
- Use `IConfiguration` interface for env vars
- Leverage `IOptions<T>` pattern for complex config
- Validate config on startup (fail fast)

### 6. Database Transactions
- Quota updates should be transactional
- Monthly resets must be atomic
- Consider pessimistic locking for quota checks

### 7. Streaming Responses
- Use `StreamWriter` or `PipeWriter` for SSE
- Implement `IAsyncEnumerable<T>` for streaming
- Handle client disconnects gracefully

### 8. Authentication
- Implement custom JWT validation if Clerk .NET SDK unavailable
- Cache Clerk JWKS (public keys) for performance
- Validate audience and issuer claims

### 9. Testing Strategy
- Unit test: Quota calculations, auth logic
- Integration test: Database operations, API flow
- E2E test: Full request lifecycle with mocks
- Load test: Rate limiter, concurrent requests

### 10. Monitoring & Observability
- Log all API requests (request ID, user ID, duration)
- Track quota usage patterns
- Monitor Groq API latency and errors
- Set up alerts for high error rates

---

## Appendix: File Reference Map

### Backend Structure (Node/Express Current)
```
backend/
├── api/
│   ├── server.ts             # Main Express app, route handlers
│   ├── loadEnvFirst.ts       # Environment variable loading
│   └── server.cjs            # Compiled version for production
├── middleware/
│   ├── authMiddleware.ts     # Auth + quota enforcement
│   └── rateLimiter.ts        # Express rate limiter config
├── services/
│   ├── database.ts           # PostgreSQL connection pool
│   ├── clerkUserSync.ts      # Clerk user loading
│   └── [other services]
├── storage/
│   └── usageStorage.ts       # Quota + session tracking
├── config/
│   ├── clerkKeys.ts          # Auth key resolution
│   └── database.config.ts    # Database URL config
└── migrations/
    ├── 1700000000000_baseline-ig-tables.js
    └── [other migrations]

shared/
├── constants/
│   └── planLimits.ts         # Plan tiers & quota limits
├── prompts/
│   └── index.ts              # AI system prompts
└── types/
    └── index.ts              # TypeScript interfaces
```

### For .NET Implementation
Map these directly:
- `backend/api/server.ts` → `Controllers/` (one per endpoint group)
- `backend/middleware/` → `Middleware/` (register in pipeline)
- `backend/services/` → `Services/` (DI registered)
- `backend/storage/` → `Data/Repositories/` (EF Core DbSets)
- `backend/config/` → `Configuration/` (IOptions<T>)
- `shared/` → `Shared/` (shared project or constants)
- Migrations → `Migrations/` (EF Core migrations)

---

## Summary

This document covers everything needed to recreate the InterviewGuru backend in .NET:

1. **Complete API specification** with all endpoints, request/response shapes, and error codes
2. **Database schema** including table definitions, indexes, and migration strategy
3. **Authentication flow** with Clerk integration and guest mode for dev
4. **Rate limiting and quota system** with multi-tier plan support
5. **External service integration** for Groq, Gemini, and Xenova embeddings
6. **AI pipeline details** including model selection, prompts, and streaming
7. **Vector cache system** for pre-generated interview answers
8. **Configuration management** with all environment variables documented
9. **Migration checklist** to track progress across 12 phases
10. **Implementation notes** specific to .NET ecosystem

Use this as the authoritative source for all backend decisions during the migration.

---

**Last Updated**: April 26, 2026  
**Version**: 1.0  
**Status**: Ready for .NET Migration

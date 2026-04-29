# InterviewGuru Frontend Features Guide

## Table of Contents
1. [Overview](#overview)
2. [User Experience Flow](#user-experience-flow)
3. [Landing Page](#landing-page)
4. [Authentication & Authorization](#authentication--authorization)
5. [Main Application Interface](#main-application-interface)
6. [Voice Mode Features](#voice-mode-features)
7. [Chat Mode Features](#chat-mode-features)
8. [Session Tracking](#session-tracking)
9. [Quota & Plan Management](#quota--plan-management)
10. [Settings & Customization](#settings--customization)
11. [History & Analytics](#history--analytics)
12. [Components Architecture](#components-architecture)
13. [Hooks & State Management](#hooks--state-management)
14. [UI/UX Elements](#uiux-elements)
15. [Keyboard Shortcuts](#keyboard-shortcuts)
16. [Electron-Specific Features](#electron-specific-features)

---

## Overview

### What is InterviewGuru?

InterviewGuru is a **stealth AI copilot for technical interviews**. It listens to your interview/meeting in real-time, detects questions, and provides instant answers—without interfering with your workflow.

### Two Operating Modes

1. **Voice Mode** (🎙️): Real-time audio capture → question detection → instant answers
   - Best for: Live interviews, meetings, on-the-fly questions
   - Response: Bullet points optimized for quick speaking

2. **Chat Mode** (💬): Type questions → structured, detailed answers
   - Best for: Deep preparation, research, explanations
   - Response: Multi-section answers with code examples

### Target Users

- **Job seekers** preparing for technical interviews
- **Software engineers** upgrading skills before interviews
- **Teams** in technical discussions or meetings
- **Students** learning new technologies

---

## User Experience Flow

### First-Time User Journey

```
1. Land on "/" (Marketing Page)
   ├─ See interactive demo
   ├─ Watch feature showcase
   ├─ View pricing/plans
   └─ Click "Get Started"

2. Sign In / Sign Up (Clerk)
   ├─ Email + password OR
   ├─ Google OAuth OR
   └─ GitHub OAuth

3. Redirect to "/app" (Main Dashboard)
   ├─ Welcome tour (if first-time)
   ├─ Grant microphone/screen share permissions
   ├─ Select audio capture mode
   └─ Start first session

4. Voice Mode Interview
   ├─ Click mic to start listening
   ├─ System captures audio
   ├─ Speaks interview question
   ├─ AI detects question
   ├─ AI generates answer
   └─ See answer + speak option

5. End Session
   ├─ Review session history
   ├─ Download transcript (if plan allows)
   └─ Start new session or review plan status
```

### Returning User Journey

```
1. Land on "/" (Marketing Page)
   └─ If signed in → "Launch App" button

2. Click "Launch App" or navigate to "/app"
   └─ Skip onboarding → go straight to dashboard

3. Continue with Voice/Chat Modes
```

---

## Landing Page

### Route: `/` (Marketing & Onboarding)

### Sections

#### 1. **Hero Section**
- **Headline**: "Interview Copilot for Technical Interviews"
- **Subheading**: "Real-time question detection and instant answers"
- **CTA Buttons**:
  - "Get Started" (Sign up)
  - "Learn More" (Scroll to demo)
- **Hero Image**: Animated mockup of interview in progress

#### 2. **Interactive Demo**
- **Live Simulation**: Animated demo of a full interview exchange
  - Interviewer asks: "Can you explain how QuickSort works?"
  - AI detects: "Coding / Medium difficulty"
  - AI answers: Bullet points + complexity analysis
  - AI speaks: "QuickSort recursively partitions..."
- **Auto-play**: Demo runs automatically; user can replay
- **Duration**: ~3.6 seconds per cycle

#### 3. **Features Showcase**
- **Voice Mode Card**:
  - Icon: 🎙️
  - Title: "Live Interview Mode"
  - Description: Real-time audio capture and instant answers
  - Use case: Perfect for live interviews

- **Chat Mode Card**:
  - Icon: 💬
  - Title: "Deep Preparation"
  - Description: Type questions, get detailed structured answers
  - Use case: Research, learning, planning

- **Stealth Overlay Card**:
  - Icon: 👁️
  - Title: "Invisible When Screen Sharing"
  - Description: Content-protected in Electron; never visible to others
  - Use case: Safe to use in screen-shared interviews

- **Cache Generation Card**:
  - Icon: ⚡
  - Title: "Pre-Interview Cache"
  - Description: Generate 10-20 likely questions from job description
  - Use case: Speed up response time

#### 4. **Tech Stack Section**
- **Frontend**: React 19, Vite, Tailwind CSS
- **Backend**: Express.js, Node.js, PostgreSQL
- **AI Services**: Groq (LLM + Whisper), Google Gemini (TTS)
- **Auth**: Clerk
- **Desktop**: Electron

#### 5. **Pricing Section**
| Plan | Price | Voice Min/mo | Chat Msg/mo | Sessions | Features |
|------|-------|-------------|------------|----------|----------|
| **Free** | $0 | 15 (lifetime) | 10 (lifetime) | ∞ | BYOK |
| **Basic** | $9.99/mo | 60 | 500 | 1 | TTS, Cache Gen |
| **Pro** | $29.99/mo | 600 | 5000 | 10 | All + Export |
| **Enterprise** | Custom | ∞ | ∞ | ∞ | Custom |

#### 6. **Footer Pages**
- `/docs` — Documentation & guides
- `/api-reference` — API integration guide
- `/blog` — Blog posts & announcements
- `/faq` — Frequently asked questions
- `/privacy` — Privacy policy
- `/terms` — Terms of service
- `/security` — Security info & responsible disclosure
- `/contact` — Contact form

### Responsive Design
- **Desktop**: Full-width sections, 2-column layouts
- **Tablet**: Adapted column widths, touch-friendly
- **Mobile**: Single column, stacked cards, hamburger menu

---

## Authentication & Authorization

### Current Auth System: Clerk

**Clerk Integration**:
- OAuth providers: Google, GitHub (configurable)
- Password-based signup/signin
- Email verification
- Session management

### Routes

#### Sign In
**Route**: `/sign-in`
- **Provider**: Clerk sign-in modal
- **Features**:
  - Email + password
  - Google OAuth
  - GitHub OAuth
  - "Don't have an account?" → Sign up link

#### Sign Up
**Route**: `/sign-up`
- **Provider**: Clerk sign-up modal
- **Features**:
  - Email + password
  - OAuth options
  - "Already have an account?" → Sign in link

### Authorization

#### Protected Routes

**Route**: `/app` (Main App)
- **Condition**: User must be signed in (if Clerk enabled)
- **If unsigned**: Shows `<AppSignInGate />` — prompts login
- **If no Clerk**: Shows `<AppAuthConfigMissing />` — dev-only message

#### Public Routes
- `/` (Landing page)
- `/docs`, `/blog`, `/faq`, etc. (Info pages)

### Auth Context: `ApiAuthContext`

**Provides**:
- `getAuthHeaders()` — Returns Clerk JWT token
- `isAuthReady` — Clerk finished loading
- `isSignedIn` — User has active session

**Usage**:
```typescript
const { getAuthHeaders, isSignedIn } = useApiAuth();
const headers = await getAuthHeaders();  // { Authorization: 'Bearer <JWT>' }
```

### Guest Mode (Development Only)
- Triggered when Clerk is disabled AND `NODE_ENV !== 'production'`
- Backend generates guest ID: `guest_<hash(ip:userAgent)>`
- No authentication required
- Limited to free plan quotas
- **Not available in production**

---

## Main Application Interface

### Route: `/app` (OverlayWidget Component)

### Main Components

#### 1. **Header Bar** (Top)
```
┌─────────────────────────────────────────────┐
│ [Settings] [History] [Usage] [User Menu]    │
└─────────────────────────────────────────────┘
```

**Elements**:
- **Logo**: InterviewGuru branding
- **Settings Icon** (⚙️): Opens settings modal
  - Voice chunk duration (2-15s)
  - Skip silent chunks toggle
  - Answer style (short/balanced/detailed)
  - TTS enable/disable
  - Output device selector
  - BYOK API key input

- **History Icon** (📜): Opens session history
  - List of past questions & answers
  - Filter by date, type, difficulty
  - Export session as PDF/JSON
  - Delete individual items

- **Usage Icon** (📊): Shows quota usage
  - Voice minutes: X / Y remaining
  - Chat messages: X / Y remaining
  - Sessions: X / Y remaining
  - Upgrade button if limited

- **User Menu**:
  - Profile (from Clerk)
  - Subscription management
  - Sign out

#### 2. **Mode Selector** (Left Sidebar or Toggle)
```
┌─────────────┐
│ Voice Mode  │  ← Currently selected
│ Chat Mode   │  ← Click to switch
└─────────────┘
```

**Voice Mode**: Real-time listening + answer generation
**Chat Mode**: Type a question → get structured answer

#### 3. **Main Content Area**

##### Voice Mode View
```
┌─────────────────────────────────────┐
│                                     │
│   🎙️  [MIC BUTTON - Large Circle]  │
│                                     │
│   Listening for speech...          │
│   🧠 Detecting question...         │
│   ⚡ Generating answer...          │
│                                     │
├─────────────────────────────────────┤
│ Latest Answer:                      │
│                                     │
│ ▾ Key Points                        │
│   • Point 1                         │
│   • Point 2                         │
│                                     │
│ ▾ How It Works                      │
│   • More details                    │
│                                     │
│ [🔊 Speak] [📋 Copy] [👍] [👎]     │
└─────────────────────────────────────┘
```

**Live Status Ticker**:
- Shows: 🎙️ "Listening for speech..."
- Transitions: 🧠 → ⚡ as processing happens
- Animated dots: ...

**Mic Button**:
- **Idle**: Static circle with subtle ring
- **Listening**: Animated pulsing rings + red mic icon
- **Processing**: Spinning ring + brain icon
- **Click**: Toggle listening on/off
- **Space Key**: Also toggles listening

**Answer Display**:
- **Sections**: Each section collapsible (▾)
- **Icons**: Context-specific emojis (🧠, 📌, ⚙️, etc.)
- **Content**: Paragraphs + bullet points
- **Code**: Syntax-highlighted code blocks (if applicable)

**Answer Actions**:
- 🔊 **Speak**: TTS playback of answer (if enabled)
- 📋 **Copy**: Copy answer to clipboard
- 👍 **Helpful**: Feedback (thumbs up)
- 👎 **Not Helpful**: Feedback (thumbs down)
- ⟳ **Regenerate**: Ask for new answer

##### Chat Mode View
```
┌─────────────────────────────────────┐
│ Session: Acme Corp Interview #3     │
├─────────────────────────────────────┤
│                                     │
│ [Interview Question Input Box]      │
│ [    Type your question...      ]   │
│                   [Send Button] ►   │
│                                     │
├─────────────────────────────────────┤
│ Q: What is polymorphism?            │
│ Confidence: 95%                     │
│                                     │
│ ▾ Definition                        │
│   Polymorphism allows different...  │
│                                     │
│ ▾ Types of Polymorphism             │
│   • Compile-time (Method Overload)  │
│   • Runtime (Method Override)       │
│                                     │
│ ▾ Code Example                      │
│   ```java                           │
│   public void greet(String name) {} │
│   public void greet(int id) {}      │
│   ```                               │
│                                     │
│ [🔊 Speak] [📋 Copy] [+Gen Cache]   │
│                                     │
└─────────────────────────────────────┘
```

**Chat Input**:
- **Text Box**: Multiline input for questions
- **Send Button**: Submits question to API
- **Placeholder**: "Type your question..."
- **Char Limit**: None (server validates)

**Streaming Responses**:
- Live preview of answer as it's generated
- "preview" events stream in real-time
- Final structured answer appears once complete
- Shows typing effect during generation

**Answer Display** (Chat):
- **Question Echo**: Shows detected/interpreted question
- **Confidence**: % score (0-100)
- **Type**: "Concept", "Coding", "System Design", "Behavioral"
- **Difficulty**: "Easy", "Medium", "Hard"
- **Sections**: Collapsible sections with content
- **Code**: Syntax-highlighted with copy button
- **Spoken**: TTS-ready summary

#### 4. **Plan Banner** (If Applicable)
```
Free Plan: 15 voice min, 10 chat msg (lifetime)
[Upgrade to Basic →]
```

**Shows**:
- Current plan tier
- Quota breakdown
- Trial days remaining (if applicable)
- Upgrade button

#### 5. **Error States**
- **Mic Permission Denied**: "Please enable microphone access"
- **No Audio Detected**: "No audio found. Check audio settings"
- **Quota Exceeded**: "Monthly quota exhausted. Upgrade or wait for reset"
- **API Error**: "Could not process. Try again"
- **Rate Limited**: "Too many requests. Wait a moment"

---

## Voice Mode Features

### How Voice Mode Works

1. **User clicks mic button** or presses Space
2. **Audio capture starts**:
   - Electron: System audio loopback (WASAPI)
   - Browser: Display media with audio share
3. **Audio chunks stream to backend** every 5 seconds (configurable)
4. **Whisper transcription** converts audio → text
5. **Question detection** determines if text is a question
6. **Answer generation** if question detected
7. **User sees results** in real-time

### Audio Capture

#### Electron (Desktop App)
- **Method**: System audio loopback
- **Source**: Primary display (desktop audio)
- **Permissions**: Automatic (Electron handles)
- **Supported**: Windows, macOS, Linux
- **Advantage**: Captures system audio without user interaction

#### Browser (Web App)
- **Method**: `getDisplayMedia()` API
- **Source**: Browser tab or screen
- **Permissions**: Browser permission prompt
- **Must check**: "Share audio" checkbox
- **Advantage**: Works anywhere; no special setup

### Chunk Duration
- **Default**: 5 seconds
- **Configurable**: 2-15 seconds (in settings)
- **Trade-off**:
  - Shorter (2s): More frequent analysis, higher API cost
  - Longer (15s): Better for long answers, more latency

### Hallucination Filtering
- **Filters ~40 common false positives**:
  - "Thank you", "Thank you for watching"
  - YouTube credits: "Subscribe", "Like and subscribe"
  - Channel artifacts: "Subtitles by...", "Translated by..."
  - Filler words: "Uh", "Um", "Hmm"
  - Short noise: Anything < 20 chars matching hallucinations

### Technical Term Corrections
- **Fixes transcription mishearing**:
  - "Virtual dome" → "Virtual DOM"
  - "Postgress" → "PostgreSQL"
  - "View.js" → "Vue.js"
  - "Travel inheritance" → "Types of inheritance"
  - ~20 common tech term corrections

### Question Detection Heuristics
**Pre-filters** (before LLM):
- Must be ≥15 characters long
- Must have:
  - Question mark (`?`), OR
  - Question word (what, how, why, can you, explain, etc.)

**If passes heuristic**:
- Sent to LLM for confidence scoring
- Low confidence answers (`<0.2`) rejected

### Answer Generation

**Model Selection**:
- **Fast Mode** (default in production):
  - Model: `llama-3.1-8b-instant`
  - Speed: ~1-3 seconds
  - Cost: Low
  - Quality: Accurate for most questions
  
- **Full Mode** (dev/advanced):
  - Model: `llama-3.3-70b-versatile`
  - Speed: ~5-15 seconds
  - Cost: Higher
  - Quality: More comprehensive

**Response Format** (Voice Mode):
```json
{
  "isQuestion": true,
  "question": "What is the virtual DOM?",
  "confidence": 0.87,
  "type": "technical",
  "bullets": [
    "Lightweight in-memory representation",
    "React re-renders virtually before DOM",
    "Improves performance via batching"
  ],
  "spoken": "The virtual DOM is an in-memory..."
}
```

### TTS (Text-to-Speech)
- **Service**: Google Gemini (`gemini-2.5-flash-preview-tts`)
- **Voice**: "Kore" (female voice)
- **Enable**: Settings → TTS
- **Output Device**: Selectable (Settings)
- **Playback**: Audio element in browser
- **Speed**: Generated on-demand (~2-3s latency)
- **Not Available**: Desktop app (clipboard guard + audio complexity)

### Keyboard Shortcuts
- **Space Bar**: Toggle listening on/off
- **Ctrl+Shift+Space**: Focus chat input
- **Ctrl+Shift+X**: Toggle click-through mode (Electron)
- **Ctrl+Shift+H**: Hide/show overlay (Electron)
- **Ctrl+Q**: Emergency quit (Electron)

---

## Chat Mode Features

### How Chat Mode Works

1. **User types a question** in text input
2. **Clicks Send** or presses Enter
3. **Question sent to `/api/analyze` endpoint**
4. **Backend processes**:
   - Checks vector cache (instant if found)
   - Classifies question (type & difficulty)
   - Generates adaptive answer
   - Verifies if needed
   - Calculates confidence
5. **User receives structured answer** with sections & code

### Question Classification

**Question Types**:
- **Concept**: "What is...", "Explain...", "Compare..."
  - Response: Definition + trade-offs + when to use
  
- **Coding**: "Implement...", "Write code...", "Algorithm..."
  - Response: Approach + complexity + working code
  
- **System Design**: "Design...", "Architecture...", "Scale..."
  - Response: Architecture + components + trade-offs
  
- **Behavioral**: "Tell me about...", "Experience...", "Situation..."
  - Response: Story structure (Situation, Action, Result, Learnings)

**Difficulty Levels**:
- **Easy**: Basic definitions, junior-level
- **Medium**: Trade-offs, algorithms, intermediate
- **Hard**: System design, architecture, advanced

### Answer Structure

```
{
  "isQuestion": true,
  "question": "Detected/interpreted question",
  "confidence": 0.95,
  "type": "concept",
  "difficulty": "medium",
  "sections": [
    {
      "title": "What is the Virtual DOM?",
      "content": "The virtual DOM is...",
      "points": [
        "In-memory representation",
        "Improves performance"
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
  "spoken": "For TTS playback"
}
```

### Vector Cache Integration

**What it does**:
- Pre-matches incoming questions against cached Q&A pairs
- Uses semantic similarity (cosine distance)
- Returns cached answer if similarity > 0.82
- **Instant response** (0ms LLM latency)

**Cache Generation** (Plan feature):
- User uploads job description (≥50 chars)
- AI generates 10-20 likely interview questions
- For each: Creates answer + embeddings + variants
- Stored in vector cache
- Used for fast lookups

**Triggering Cache Gen**:
- Button: "Generate Interview Cache"
- Requires: Basic+ plan
- Costs: ~8 chat messages
- Generates: ~20 Q&A pairs
- Stored: In-memory + disk (`os.tmpdir()`)

### Answer Styles

**User Setting**: `localStorage['groq_answer_style']`

**Short Style**:
- 2-4 short paragraphs OR 4-6 bullets
- Interview-ready phrasing
- High density, minimal verbosity
- Best for: Quick prep

**Balanced Style** (Default):
- Standard detail level
- Clear structure with examples
- Comprehensive but concise
- Best for: Most use cases

**Detailed Style**:
- Deep dives with multiple examples
- Trade-offs & edge cases
- Research-level quality
- Best for: Learning & mastery

### Streaming Responses (`/api/analyze/stream`)

**Server-Sent Events (SSE)**:
```
data: {"type":"preview","text":"The virtual DOM is "}
data: {"type":"preview","text":"a lightweight JavaScript..."}
data: {"type":"final","data":{...complete answer...}}
data: {"type":"done"}
```

**Browser-side**:
- Receives `preview` events as answer streams
- Displays live text in real-time
- Final answer replaces preview when ready
- "Type effect" animation applied

**Benefits**:
- User sees response immediately (visual feedback)
- Doesn't wait for full answer before reading
- Better UX for long answers

### Confidence Scoring

**Calculation**:
1. **Logprobs Method** (preferred):
   - If model supports: uses token log-probabilities
   - Average across all tokens
   - Converted to 0-1 score

2. **Self-Estimation** (fallback):
   - Second LLM pass: "How confident are you in this answer?"
   - Returns 0-1 score
   - Only in full mode (not fast mode)

3. **Display**:
   - Shown as "Confidence: 95%"
   - Used to decide on verification (hard answers < 80% → verify)

### Self-Verification

**Triggered When**:
- Difficulty = "hard" OR type = "system_design"
- Confidence < 0.8

**Process**:
1. Second LLM pass verifies answer
2. Checks for:
   - Technical accuracy
   - Logical consistency
   - Completeness
3. If issues found: Applies fixes
4. Returns improved answer

**Cost**: Extra API call (mitigated by threshold)

---

## Session Tracking

### Session Concept

**What is a session?**
- Represents one interview/prep session
- Tracks: Duration, questions asked, quota used
- Useful for: Analytics, history, plan enforcement

### Session Lifecycle

#### Start Session
```typescript
const sessionId = await startSession({
  persona: "Technical Interviewer",
  resume: "...",
  jd: "..."
});
```

**What happens**:
- Backend creates `ig_sessions` record
- Returns `sessionId` (UUID)
- Sets `isSessionActive = true`
- Buffers questions

#### Track Questions
```typescript
await updateSession({
  question: "What is React?",
  answer: ["Virtual DOM", "Component-based"],
  timestamp: Date.now(),
  confidence: 0.95,
  type: "concept"
});
```

**What happens**:
- Adds question to local buffer
- Increments `questionsAsked` counter
- Records in session history
- Used for analytics

#### End Session
```typescript
const { end } = useSessionTracking();
await end();
```

**What happens**:
- Calculates session duration
- Sends final stats to backend
- Marks session as "completed"
- Clears active session
- Can start new session

### Session Limits

**Plan-based**:
- **Free**: 1 session at a time, unlimited duration
- **Basic**: 1 session/month, limited duration
- **Pro**: 10 sessions/month, extended duration
- **Enterprise**: Unlimited

**Displayed**:
- `sessionLimitMinutes`: Total allowed minutes
- Countdown timer in UI
- Warning at 80% usage
- Error at 100% (must start new session)

---

## Quota & Plan Management

### Quota Types

#### 1. **Voice Minutes** 🎙️
- **Tracked**: Per `/api/transcribe` call
- **Cost**: Duration of audio chunk (rounded up to nearest minute)
- **Reset**: Monthly (or lifetime for free)
- **View**: Usage bar shows "X/Y minutes remaining"

#### 2. **Chat Messages** 💬
- **Tracked**: Per `/api/analyze` call (chat mode)
- **Cost**: 1 per question
- **Reset**: Monthly
- **View**: Usage bar shows "X/Y messages remaining"

#### 3. **Sessions** 📊
- **Tracked**: `startSession()` call
- **Cost**: 1 per session
- **Reset**: Monthly
- **View**: Usage bar shows "X/Y sessions remaining"

### Plan Comparison

| Feature | Free | Basic | Pro | Enterprise |
|---------|------|-------|-----|------------|
| **Voice Min/mo** | 15 (lifetime) | 60 | 600 | ∞ |
| **Chat Msg/mo** | 10 (lifetime) | 500 | 5000 | ∞ |
| **Sessions/mo** | ∞ | 1 | 10 | ∞ |
| **TTS** | ❌ | ✅ | ✅ | ✅ |
| **Cache Gen** | ❌ | ✅ | ✅ | ✅ |
| **Export** | ❌ | ❌ | ✅ | ✅ |
| **Price** | $0 | $9.99/mo | $29.99/mo | Custom |

### Usage Display

**UsageBar Component**:
```jsx
<UsageBar 
  label="Voice Minutes"
  used={45}
  limit={60}
  unit=" min"
  periodLabel="month"
/>
```

**Visual**:
- Progress bar with percentage
- Color coding:
  - Green: < 50% used
  - Orange: 50-80% used
  - Red: > 80% used
- Footer: "X minutes remaining this month"

### Plan Banner

**Free Plan**:
```
┌─────────────────────────────┐
│ 🎯 BYOK                     │
│ Free Plan                   │
│ One-time quota. Upgrade     │
│ [Upgrade Now →]             │
└─────────────────────────────┘
```

**Paid Plans**:
```
┌─────────────────────────────┐
│ You're on the Pro plan      │
└─────────────────────────────┘
```

### Upgrading Plans

**Upgrade Flow**:
1. Click "Upgrade Now" button (in plan banner or settings)
2. Redirected to pricing page (or Stripe/payment provider)
3. Select plan tier
4. Enter billing info
5. Confirm
6. Quota increases take effect immediately

---

## Settings & Customization

### Settings Modal (⚙️ Icon)

#### Audio Settings
- **Chunk Duration**: 2-15 seconds
  - Default: 5 seconds
  - Clamped: Invalid inputs are rounded
  - Stored: `localStorage['voice_chunk_ms']`

- **Skip Silent Chunks**: Toggle
  - Default: Enabled
  - Behavior: Skips audio chunks with low RMS (volume)
  - Threshold: 0.028 RMS
  - Stored: `localStorage['voice_skip_silent']`

#### Answer Settings
- **Answer Style**: Dropdown (short / balanced / detailed)
  - Default: Balanced
  - Affects: Prompt style, response length
  - Stored: `localStorage['groq_answer_style']`

#### TTS Settings (Text-to-Speech)
- **Enable TTS**: Toggle
  - Default: Disabled
  - Requires: Gemini API key + plan feature
  - Stored: `localStorage['aura_enable_tts']`

- **Output Device**: Dropdown
  - Shows: Available audio output devices
  - Default: System default
  - Used: `setSinkId()` on audio element
  - Stored: `localStorage['aura_output_device']`

#### API Configuration (BYOK)
- **Custom Groq API Key**: Text input
  - Enables: Use personal Groq credits
  - Format: `gsk_...`
  - Stored: `localStorage['groq_api_key']`
  - Usage: Sent via `x-api-key` header
  - Server-side: Applies if `BYOK_MODE` enabled

#### Voice Model Selection
- **Whisper Model**: Dropdown
  - Default: `whisper-large-v3-turbo`
  - Options: `whisper-large-v3` (slower, better) or `whisper-medium`
  - Stored: `localStorage['whisper_model']`
  - Impact: Affects transcription quality & speed

---

## History & Analytics

### Session History

**View**: History icon (📜) in header

**Shows**:
- **List of past sessions**:
  - Date/time
  - Duration
  - Questions asked
  - Quota used

- **Question history**:
  - Question text
  - Answer summary
  - Confidence score
  - Type & difficulty
  - Timestamp

### Export Options (Pro+ Plan)

**Formats**:
- PDF: Printable report
- JSON: Machine-readable data
- TXT: Plain text

**Includes**:
- Session summary
- All Q&A pairs
- Metadata (duration, quota, type)
- Optional: Resume, job description context

### Delete Options
- Delete individual question
- Delete entire session
- Confirm before deleting

---

## Components Architecture

### Component Tree

```
main.tsx
  └─ ClerkProvider
      └─ ApiAuthProvider
          └─ App.tsx
              └─ BrowserRouter
                  ├─ LandingPage
                  ├─ FooterPages (Docs, Blog, FAQ, etc.)
                  ├─ SignIn / SignUp (Clerk modals)
                  └─ /app
                      └─ OverlayWidget
                          ├─ Header
                          │  ├─ SettingsModal
                          │  ├─ HistoryModal
                          │  └─ UserButton (Clerk)
                          ├─ ModeSelector (Voice/Chat toggle)
                          ├─ Voice Mode Section
                          │  ├─ MicCenterCTA
                          │  ├─ LiveStatusTicker
                          │  ├─ WaveBars
                          │  ├─ SectionBlock (answer sections)
                          │  └─ CodeBlock (if code)
                          ├─ Chat Mode Section
                          │  ├─ ChatInput
                          │  ├─ SectionBlock[]
                          │  └─ CodeBlock
                          ├─ PlanBanner
                          └─ UsageBar[] (voice, chat, sessions)

Providers
  ├─ ApiAuthContext (JWT, auth state)
  └─ ClerkProvider (from @clerk/clerk-react)

Hooks
  ├─ useAIAssistant (answer generation)
  ├─ useTabAudioCapture (audio capture)
  ├─ usePlanStatus (quota + plan info)
  └─ useSessionTracking (session lifecycle)
```

### Key Components

#### `OverlayWidget.tsx`
- **Purpose**: Main application interface
- **Features**: Mode switching, answer display, session mgmt
- **Size**: ~900 lines
- **State**: Manages voice/chat mode, answer history, UI state

#### `useAIAssistant.ts`
- **Purpose**: Question detection & answer generation
- **Exports**: `processTranscript()`, `playSpeech()`
- **State**: `detectedQuestion`, `answer`, `isProcessing`
- **API Calls**: `/api/analyze`, `/api/analyze/stream`

#### `useTabAudioCapture.ts`
- **Purpose**: Audio capture (Electron + Browser)
- **Exports**: `startListening()`, `stopListening()`
- **State**: `isListening`, `transcript`
- **API Calls**: `/api/transcribe`

#### `usePlanStatus.ts`
- **Purpose**: Quota & plan tracking
- **Exports**: `refetch()` for manual reload
- **State**: `plan`, `quotas`, `features`, `loading`, `error`
- **API Calls**: `/api/usage`

#### `useSessionTracking.ts`
- **Purpose**: Session lifecycle management
- **Exports**: `startSession()`, `updateSession()`, `endSession()`
- **State**: `sessionId`, `isSessionActive`, `sessionLimitMinutes`
- **API Calls**: `/api/sessions/start`, `/api/sessions/{id}` (PUT)

---

## Hooks & State Management

### State Management Philosophy

**No Redux/Context/Zustand**:
- Uses React hooks only
- Local component state + context for auth
- Ref-based debouncing & buffering
- localStorage for persistence

### Key Hooks Usage

#### `useState`
```typescript
const [isListening, setIsListening] = useState(false);
const [detectedQuestion, setDetectedQuestion] = useState<QuestionDetection | null>(null);
const [answer, setAnswer] = useState<Answer | null>(null);
const [history, setHistory] = useState<HistoryItem[]>([]);
```

#### `useRef`
```typescript
const transcriptBufferRef = useRef<string>('');  // Keep transcript across re-renders
const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);  // Debounce processing
const audioRef = useRef<HTMLAudioElement | null>(null);  // Audio element for TTS
const streamRef = useRef<MediaStream | null>(null);  // Media stream reference
```

#### `useCallback`
```typescript
const processTranscript = useCallback(async (newText: string) => {
  // Heavy lifting, wrapped to avoid re-creating on every render
}, [isProcessing, isSpeaking]);
```

#### `useEffect`
```typescript
useEffect(() => {
  // Setup audio element on mount
  audioRef.current = new Audio();
  // Cleanup on unmount
  return () => { audioRef.current?.pause(); };
}, []);
```

### localStorage Keys

| Key | Value | Type | Purpose |
|-----|-------|------|---------|
| `voice_chunk_ms` | 2000-15000 | number | Audio chunk duration |
| `voice_skip_silent` | true/false | string | Skip silent chunks |
| `groq_answer_style` | short/balanced/detailed | string | Answer style |
| `aura_enable_tts` | true/false | string | TTS enabled |
| `aura_output_device` | device ID | string | Audio output device |
| `groq_api_key` | gsk_... | string | Custom Groq key (BYOK) |
| `whisper_model` | model name | string | Whisper model choice |
| `interview_history` | JSON | string | Session history (local) |

---

## UI/UX Elements

### Colors & Theming

**Color Palette**:
- **Primary**: Cyan/Teal (#00FFB3, #00C2FF)
- **Accent**: Purple (#7A5CFF)
- **Background**: Dark (theme-aware)
- **Text**: Light (contrast-aware)
- **Success**: Green
- **Warning**: Orange
- **Error**: Red

### Icons (Lucide React)

| Icon | Purpose |
|------|---------|
| `Mic` / `MicOff` | Listening state toggle |
| `MessageSquare` | Chat mode |
| `Send` | Send message |
| `Copy` | Copy to clipboard |
| `CheckCircle` | Success indicator |
| `Loader2` | Loading spinner |
| `AlertTriangle` | Error/warning |
| `History` | Session history |
| `Download` | Export |
| `Settings` | Settings modal |
| `User` | User profile |
| `ThumbsUp` / `ThumbsDown` | Feedback |

### Animations

**CSS Animations**:
- **Wave bars**: Oscillating bars during listening
- **Pulsing brain**: Processing indicator
- **Mic rings**: Expanding circles when listening
- **Status ticker**: Fade in/out transitions
- **Text typing effect**: Character-by-character reveal

**Transitions**:
- Modal open/close: 300ms fade
- Answer section expand/collapse: 200ms slide
- Page navigation: 150ms fade

### Responsive Design

**Breakpoints**:
- **Mobile** (<640px): Single column, touch-friendly buttons
- **Tablet** (640-1024px): 1.5 column layout, adaptive spacing
- **Desktop** (>1024px): Full layout, side panels

**Touch Handling**:
- Large tap targets (44px minimum)
- No hover states on mobile
- Swipe gestures for navigation (future)

---

## Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| **Space Bar** | Toggle listening | Voice mode |
| **Enter** | Send message | Chat input focused |
| **Escape** | Close modal | Any modal open |
| **Ctrl+Shift+Space** | Focus chat input | Global (Electron) |
| **Ctrl+Shift+X** | Toggle click-through | Electron only |
| **Ctrl+Shift+H** | Hide/show overlay | Electron only |
| **Ctrl+Q** | Emergency quit | Electron only |
| **Cmd+K** / **Ctrl+K** | Open command palette | Future feature |

---

## Electron-Specific Features

### Desktop App Unique Features

#### 1. **Always-On-Top Window**
- Floats above other windows
- Even above video calls (Zoom, Teams, Google Meet)
- Frameless design
- Resize handles

#### 2. **Click-Through Mode**
- **Toggle**: Ctrl+Shift+X
- **Behavior**:
  - When enabled: Mouse passes through overlay
  - Chat input disabled
  - Good for: Watching interview content
  
- **Auto-disable**: When chat input is focused
- **Auto-enable**: When chat input blurs

#### 3. **System Audio Loopback**
- **How**: WASAPI (Windows Audio Session API)
- **Captured**: Primary display audio
- **No permission needed**: Electron handles it
- **Benefits**:
  - No user interaction needed
  - Always captures system audio
  - Zoom, Teams, Meet, Discord all work

#### 4. **Screen Share Protection**
- **Feature**: Content protection during screen sharing
- **Behavior**: Overlay becomes invisible to screen capture
- **Toggle**: Ctrl+Shift+S or settings
- **Benefits**: Interview questions/answers never visible to interviewers

#### 5. **IPC Communication**
- **Main ↔ Renderer**:
  - `get-source-id`: Get primary monitor for audio
  - `resize-window`: Adjust window size
  - `focus-chat-input`: Programmatically focus input
  - `update-hotkeys`: Update global shortcuts

#### 6. **Global Keyboard Shortcuts**
- **Ctrl+Shift+Space**: Open/focus app
- **Ctrl+Shift+H**: Hide/show
- **Ctrl+Shift+X**: Toggle click-through
- **Ctrl+Q**: Quit app
- **Works**: Even when app is not focused

#### 7. **Clipboard Guard**
- **What**: Prevents accidental copying of visible content
- **How**: Blocks copy/cut outside text inputs
- **Why**: Prevents leaking interview info
- **Bypass**: Only works in editable fields (input, textarea)

#### 8. **Window Sizing**
- **Default**: 953 x 744 px
- **Resizable**: Yes (user can drag edges)
- **Min size**: ~600x400 px
- **HMR resize**: Auto-resizes on hot module reload (dev)

#### 9. **Native Titlebar Menu**
- **File**: Recent sessions, open logs
- **Edit**: Copy, paste, etc.
- **View**: Zoom, toggle devtools (dev)
- **Settings**: Opens app settings
- **Help**: Documentation links

#### 10. **Persistent Storage**
- **Location**:
  - Windows: `%APPDATA%/InterviewGuru/`
  - Mac: `~/Library/Application Support/InterviewGuru/`
  - Linux: `~/.config/InterviewGuru/`
  
- **Stored**:
  - Usage/quota data (JSON)
  - Session history
  - User settings
  - Vector cache

---

## User Workflows

### Workflow 1: Live Interview Prep (Voice Mode)

```
1. Launch InterviewGuru
   ↓
2. Join interview call (Zoom, Teams, etc.)
   ↓
3. Switch to Voice Mode
   ↓
4. Click Mic to start listening
   ↓
5. Interview question asked → AI hears it
   ↓
6. AI detects question → Shows "95% confident"
   ↓
7. AI generates bullet-point answer
   ↓
8. Read silently or click Speak for TTS
   ↓
9. Answer interviewer aloud
   ↓
10. Next question → Repeat
```

### Workflow 2: Deep Preparation (Chat Mode)

```
1. Open InterviewGuru
   ↓
2. Switch to Chat Mode
   ↓
3. Upload job description (optional, for context)
   ↓
4. Type interview question
   ↓
5. See structured answer with:
   - Definition
   - How it works
   - Code example
   - Trade-offs
   ↓
6. Read & learn
   ↓
7. Copy code if needed
   ↓
8. Speak answer aloud (TTS optional)
   ↓
9. Generate cache for fast interview access
```

### Workflow 3: Pre-Interview Prep (Cache Generation)

```
1. Get job description from job posting
   ↓
2. Paste into "Generate Cache" dialog
   ↓
3. Click "Generate" (costs ~8 chat messages)
   ↓
4. AI generates 10-20 likely questions
   ↓
5. For each question, AI pre-generates answer + embeddings
   ↓
6. Cache stored locally on computer
   ↓
7. During interview:
   - Interviewer asks question
   - AI checks cache (instant match if similar)
   - Returns pre-generated answer (~100ms)
```

### Workflow 4: Review & Export

```
1. End interview session
   ↓
2. Click History (📜 icon)
   ↓
3. See all Q&A from session
   ↓
4. (Pro plan) Click Export
   ↓
5. Choose format (PDF, JSON, TXT)
   ↓
6. Download session report
   ↓
7. Share or keep for records
```

---

## API Integration Points

### Frontend → Backend API Calls

| Endpoint | Method | Purpose | Mode |
|----------|--------|---------|------|
| `/api/health` | GET | Check server status | Both |
| `/api/transcribe` | POST | Audio → text | Voice |
| `/api/analyze` | POST | Question → answer | Both |
| `/api/analyze/stream` | POST | Streaming answer | Chat |
| `/api/generate-cache` | POST | Pre-gen Q&A cache | Both |
| `/api/usage` | GET | Quota + plan info | Both |
| `/api/sessions/start` | POST | Start interview session | Both |
| `/api/sessions/{id}` | PUT | Update session stats | Both |

### Headers Sent

```javascript
{
  "Authorization": "Bearer <Clerk JWT>",        // If signed in
  "Content-Type": "application/json",
  "x-mode": "voice" | "chat",                  // /api/analyze
  "x-answer-style": "short" | "balanced" | "detailed",
  "x-api-key": "gsk_...",                      // If BYOK enabled
  "x-persona": "Technical Interviewer",        // Custom persona
  "x-voice-model": "whisper-large-v3-turbo"    // Custom Whisper model
}
```

---

## Performance Optimizations

### Frontend Optimizations
- **Lazy loading**: ML models loaded on first use
- **Debouncing**: 800ms before sending transcript
- **Heuristic filtering**: Pre-filter obvious non-questions
- **Streaming responses**: Don't wait for full answer
- **Cache lookup**: Instant answers if matched

### Network Optimizations
- **Audio chunking**: 5s chunks reduce payload
- **Silent skipping**: Skip chunks with low volume
- **Compression**: Groq handles audio compression
- **Connection pooling**: Backend uses connection pool

### UI Optimizations
- **Memoization**: Components wrapped with React.memo
- **useCallback**: Debounce timers kept with refs
- **Virtual scrolling**: Long history lists (future)
- **CSS animations**: GPU-accelerated transforms

---

## Accessibility

### Keyboard Navigation
- All buttons accessible via Tab
- Enter/Space to activate
- Arrow keys in lists/menus
- Focus visible on all interactive elements

### Screen Reader Support
- Semantic HTML (buttons, labels, sections)
- ARIA labels on custom components
- Descriptive text for icons
- Status updates announced

### Visual Accessibility
- High contrast text (WCAG AA)
- Font size configurable (browser zoom)
- Color not sole information (icons + text)
- Reduced motion respected (prefers-reduced-motion)

---

## Future Features (Roadmap)

1. **Multi-language Support**
   - Translate questions/answers
   - Multilingual TTS voices

2. **Custom AI Personas**
   - Different interviewer styles
   - Industry-specific prompts

3. **Analytics Dashboard**
   - Question patterns
   - Performance metrics
   - Weak areas

4. **Collaborative Sessions**
   - Share session with mentor
   - Real-time feedback

5. **Mobile App**
   - React Native version
   - On-device transcription

6. **Browser Extension**
   - Inject into Zoom/Teams
   - Native integration

---

## Summary

InterviewGuru's frontend is a **real-time AI interview copilot** with:
- ✅ **Voice Mode** for live interviews (system audio capture, instant answers)
- ✅ **Chat Mode** for deep prep (structured answers, code examples)
- ✅ **Quota & Plan Management** (track usage, upgrade plans)
- ✅ **Session Tracking** (analytics, history, export)
- ✅ **Vector Cache** (pre-generated answers for instant lookup)
- ✅ **TTS Integration** (speak answers aloud)
- ✅ **Electron Desktop App** (always-on-top, click-through, system audio)
- ✅ **Web App** (browser-based with display media sharing)
- ✅ **Clerk Authentication** (OAuth, email/password, session mgmt)

All features are fully documented and ready for feature-parity implementation in other frameworks or languages.

---

**Last Updated**: April 26, 2026  
**Version**: 1.0  
**Status**: Complete Feature Documentation

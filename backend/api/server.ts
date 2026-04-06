import './loadEnvFirst';
import express from 'express';
import { createServer } from 'http';
import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { timingSafeEqual } from 'node:crypto';

// Directory of this module. tsx (ESM): import.meta.url. Bundled server.cjs (Electron): Node's real __dirname — never use
// process.cwd() here; packaged apps cwd is the exe folder, so ../../build would be wrong and the UI shows "Not Found".
const apiDir =
  typeof import.meta.url === 'string' && import.meta.url.startsWith('file:')
    ? path.dirname(fileURLToPath(import.meta.url))
    : // CJS bundle: tsup leaves this as the module __dirname (path to backend/api/server.cjs inside asar).
      (typeof __dirname !== 'undefined' ? __dirname : path.join(process.cwd(), 'backend', 'api'));

import { authMiddleware, clerkAuthMiddleware, quotaMiddleware } from '../middleware/authMiddleware';
import { apiBurstLimiter } from '../middleware/rateLimiter';
import {
  recordVoiceUsage,
  recordChatUsage,
  getRemainingQuota,
  upgradeUserPlan,
  getUserFromDB,
  createUserInDB,
  resetMonthlyUsageIfNeeded,
  checkTrialExpired,
  calculateTrialDaysRemaining,
} from '../storage/usageStorage';
import { PLAN_LIMITS } from '../../shared/constants/planLimits';
import { AuthRequest } from '../../shared/types';
import { waitForDatabase, getPool, isDBConnected } from '../services/database';
import {
  buildAnswerConfidencePrompt,
  buildAnswerVerificationPrompt,
  buildCacheAnswerPrompt,
  buildCacheQuestionsPrompt,
  buildChatSystemPrompt,
  buildQuestionClassificationPrompt,
  buildVoiceQuestionConfidencePrompt,
  buildVoiceSystemPrompt,
} from '../../shared/prompts';

/** Written in dev when the HTTP server listens — Electron dev launcher reads this so it loads the same port (3000, 3001, …). */
const interviewGuruDevPortFile = path.join(apiDir, '..', '..', '.interviewguru-dev-port');

// ════════════════════════════════════════════════════════════════
// VECTOR CACHE (Pre-Interview Generation to drastically reduce latency)
// ════════════════════════════════════════════════════════════════
let vectorCache: any[] = [];
const CACHE_FILE = path.join(os.tmpdir(), 'interviewguru_cache.json');
try {
  if (fs.existsSync(CACHE_FILE)) {
    vectorCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    console.log(`Loaded ${vectorCache.length} cached answers from disk.`);
  }
} catch (e) {
  console.log('No cache found or malformed.');
}

let extractor: any = null;
/** Lazy-load @xenova/transformers so Vercel/serverless cold starts (e.g. /api/health) do not pull ML/WASM at import time. */
async function getEmbedding(text: string): Promise<number[]> {
  if (!extractor) {
    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = false;
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data) as number[];
}

function cosineSimilarity(a: number[], b: number[]) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function extractJSON(content: string): any {
  if (!content) return {};
  try {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) return JSON.parse(match[1]);
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function decodeJsonStringEscape(ch: string): string {
  if (ch === 'n') return '\n';
  if (ch === 'r') return '\r';
  if (ch === 't') return '\t';
  if (ch === '"') return '"';
  if (ch === '\\') return '\\';
  return ch;
}

/** Best-effort preview extractor from a partial JSON stream. */
function extractPreviewExplanationFromJsonStream(partial: string): string {
  const key = '"explanation"';
  const keyIdx = partial.indexOf(key);
  if (keyIdx < 0) return '';
  const colonIdx = partial.indexOf(':', keyIdx + key.length);
  if (colonIdx < 0) return '';
  const openQuoteIdx = partial.indexOf('"', colonIdx + 1);
  if (openQuoteIdx < 0) return '';

  let out = '';
  let escaped = false;
  for (let i = openQuoteIdx + 1; i < partial.length; i++) {
    const c = partial[i];
    if (escaped) {
      out += decodeJsonStringEscape(c);
      escaped = false;
      continue;
    }
    if (c === '\\') {
      escaped = true;
      continue;
    }
    if (c === '"') {
      break;
    }
    out += c;
  }
  return out.trim();
}

function normalizeCorsOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, '');
}

/** Origins allowed when reflecting Access-Control-Allow-Origin with credentials. */
function buildCorsAllowlist(): Set<string> {
  const set = new Set<string>();
  const raw = process.env.ALLOWED_ORIGINS?.trim();
  if (raw) {
    for (const part of raw.split(',')) {
      const n = normalizeCorsOrigin(part);
      if (n) set.add(n);
    }
  }
  if (process.env.NODE_ENV !== 'production') {
    set.add('http://localhost:5173');
    set.add('http://127.0.0.1:5173');
    for (let p = 3000; p <= 3010; p++) {
      set.add(`http://localhost:${p}`);
      set.add(`http://127.0.0.1:${p}`);
    }
  }
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    set.add(`https://${vercelUrl}`);
  }
  if (process.env.NODE_ENV === 'production' && set.size === 0) {
    console.warn(
      '[CORS] No allowlisted origins. Set ALLOWED_ORIGINS to your site URL(s). Browser cross-origin API calls will fail until then.'
    );
  }
  return set;
}

function truthyEnv(v: string | undefined): boolean {
  const t = v?.trim().toLowerCase();
  return t === 'true' || t === '1' || t === 'yes';
}

/** Compare cron secrets in constant time (after trim). Length mismatch → false. */
function secureCronSecretEquals(expected: string, provided: string): boolean {
  const a = Buffer.from(expected.trim(), 'utf8');
  const b = Buffer.from(provided.trim(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function cronBearerToken(req: express.Request): string | undefined {
  const raw = req.headers.authorization;
  if (!raw || typeof raw !== 'string') return undefined;
  const m = raw.match(/^\s*Bearer\s+(.+?)\s*$/is);
  return m?.[1]?.trim();
}

function cronSecretHeader(req: express.Request): string | undefined {
  const raw = req.headers['x-cron-secret'];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && raw[0]) return String(raw[0]).trim();
  return undefined;
}

/** Public BYOK launch: users send their Groq key via `x-api-key`; server `GROQ_API_KEY` is optional fallback. */
function byokModeEnabled(): boolean {
  return truthyEnv(process.env.BYOK_MODE);
}

/**
 * Fewer / cheaper Groq calls and smaller chat model — lower latency, some quality tradeoff.
 * ON by default when BYOK_MODE is set (live-interview UX). Opt out with ANALYZE_FULL_PIPELINE=true.
 * Or force on anytime with ANALYZE_FAST_MODE=true.
 * Local dev defaults to fast (8b) so /api/analyze is not 10s+ from 70b + extra rounds; use ANALYZE_FULL_PIPELINE=true to test the slow path.
 */
function analyzeFastMode(): boolean {
  if (truthyEnv(process.env.ANALYZE_FULL_PIPELINE)) return false;
  if (truthyEnv(process.env.ANALYZE_FAST_MODE)) return true;
  if (process.env.NODE_ENV !== 'production') return true;
  return byokModeEnabled();
}

/** Embedding + Xenova model load can take seconds on first hit; skip in dev unless ANALYZE_VECTOR_CACHE=true. */
function vectorCacheLookupEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  return truthyEnv(process.env.ANALYZE_VECTOR_CACHE);
}

/** When false in production, `x-api-key` is ignored unless BYOK_MODE or ALLOW_CLIENT_GROQ_KEY is on. */
function isClientGroqKeyAllowed(): boolean {
  if (byokModeEnabled()) return true;
  const v = process.env.ALLOW_CLIENT_GROQ_KEY?.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return process.env.NODE_ENV !== 'production';
}

function clientGroqKeyFromRequest(req: express.Request): string | undefined {
  if (!isClientGroqKeyAllowed()) return undefined;
  const raw = req.headers['x-api-key'];
  const h = typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? raw[0]?.trim() : '';
  return h || undefined;
}

let serverStarted = false;

export async function startServer(): Promise<number | express.Express> {
  // Prevent multiple server instances from starting
  if (serverStarted) {
    console.log('[Server] ℹ️  Server already started');
    await waitForDatabase();
    return parseInt(process.env.PORT || '3000');
  }
  serverStarted = true;

  console.log('[Server] Initializing database pool...');
  await waitForDatabase();
  console.log('[Server] Database pool init finished');
  if (byokModeEnabled()) {
    console.log('[Groq] BYOK_MODE: accepting user x-api-key in production (server GROQ_API_KEY optional fallback).');
  }

  const app = express();
  let initialPort = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const httpServer = createServer(app);

  const corsAllowlist = buildCorsAllowlist();
  if (corsAllowlist.size > 0) {
    console.log('[CORS] Allowlisted origins:', [...corsAllowlist].join(', '));
  }

  const jsonBodyLimit = process.env.JSON_BODY_LIMIT?.trim() || '25mb';
  app.use(express.json({ limit: jsonBodyLimit }));

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
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-api-key, x-model, x-persona, x-voice-model, x-mode, x-client-fingerprint, Cache-Control, cache-control, Pragma, pragma'
    );

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Clerk must run as global middleware so AsyncLocalStorage is set before any getAuth()
  // (rate limiter keyGenerator, authMiddleware, etc.). Mounting only under /api breaks that contract.
  app.use(clerkAuthMiddleware);

  app.get('/api/health', async (req, res) => {
    const deep =
      req.query.deep === '1' ||
      req.query.deep === 'true' ||
      truthyEnv(process.env.HEALTH_CHECK_DB);
    if (!deep) {
      res.json({ status: 'ok' });
      return;
    }
    if (!isDBConnected()) {
      res.status(503).json({ status: 'degraded', db: 'not_connected' });
      return;
    }
    try {
      await getPool()!.query('SELECT 1');
      res.json({ status: 'ok', db: 'up' });
    } catch (e: any) {
      console.error('[health] DB ping failed:', e?.message || e);
      res.status(503).json({ status: 'error', db: 'down' });
    }
  });

  /**
   * Your own “UptimeRobot”: hit on a schedule (Vercel Cron, GitHub Actions, etc.).
   * Secured with Authorization: Bearer <CRON_SECRET> (Vercel injects this when CRON_SECRET is set).
   * Runs SELECT 1 to wake Neon + exercise the API.
   */
  app.get('/api/cron/keep-warm', async (req, res) => {
    const secret = process.env.CRON_SECRET?.trim();
    const onVercel = truthyEnv(process.env.VERCEL);
    if (secret) {
      const bearer = cronBearerToken(req);
      const headerSecret = cronSecretHeader(req);
      const ok =
        (bearer !== undefined && secureCronSecretEquals(secret, bearer)) ||
        (headerSecret !== undefined && secureCronSecretEquals(secret, headerSecret));
      if (!ok) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    } else if (onVercel || process.env.NODE_ENV === 'production') {
      res.status(503).json({ error: 'Set CRON_SECRET in env for /api/cron/keep-warm' });
      return;
    }

    if (!isDBConnected()) {
      res.status(503).json({ ok: false, db: 'not_connected' });
      return;
    }
    try {
      await getPool()!.query('SELECT 1');
      res.json({ ok: true, at: new Date().toISOString(), db: 'up' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[cron/keep-warm]', msg);
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

  app.use('/api', apiBurstLimiter);
  app.use('/api', authMiddleware);

  function getGroq(customKey?: string) {
    const key = customKey || process.env.GROQ_API_KEY;
    if (!key) {
      const err = new Error(
        'Groq API key required. Add your key in the app settings (BYOK), or set GROQ_API_KEY on the server.'
      );
      (err as any).status = 401;
      throw err;
    }
    return new Groq({ apiKey: key });
  }

  app.post("/api/transcribe", quotaMiddleware('voice'), async (req: express.Request, res) => {
    let tmpFilePath = '';
    try {
      const authReq = req as AuthRequest;
      
      const customVoiceModel = (req.headers['x-voice-model'] as string) || 'whisper-large-v3-turbo';
      const groq = getGroq(clientGroqKeyFromRequest(req));

      const { audioBase64, mimeType, audioChunkDuration } = req.body;
      if (!audioBase64) {
        return res.status(400).json({ error: "No audio provided" });
      }

      const ext = mimeType?.includes('mp4') ? 'mp4' : 'webm';
      tmpFilePath = path.join(os.tmpdir(), `audio-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`);
      fs.writeFileSync(tmpFilePath, Buffer.from(audioBase64, 'base64'));

      const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(tmpFilePath),
        model: customVoiceModel || "whisper-large-v3-turbo",
        response_format: "json",
      });

      let text = transcription.text || "";

      // Filter out common Whisper hallucinations on silence or background noise
      const hallucinations = [
        "thank you",
        "thanks for watching",
        "thank you for watching",
        "please subscribe",
        "subscribed",
        "www.openai.com",
        "you",
        "bye",
        "goodbye",
        "oh",
        "uh",
        "um",
        "i'm sorry",
        "i don't know",
        "the end",
        "watching",
        "be sure to like and subscribe",
        "thanks for listening",
        "thank you so much",
        "subtitle by",
        "subtitles by",
        "amara.org",
        "english subtitles",
        "re-edited by",
        "translated by",
        "you guys",
        "peace",
        "see you in the next one",
        "god bless",
        "thank you for your time",
        "i'll see you next time",
        "don't forget to like",
        "hit the bell icon",
        "thanks for the support",
        "i'll see you in the next video",
        "thanks for joining",
        "have a great day",
        "see you soon",
        "take care",
        "stay tuned",
        "welcome back",
        "let's get started",
        "in this video",
        "today we are going to",
        "if you enjoyed this",
        "leave a comment",
        "share this video"
      ];

      const cleanText = text.trim().toLowerCase().replace(/[.,!?;:]/g, "");

      // Technical term corrections (Whisper often mishears these)
      const corrections: Record<string, string> = {
        "virtual dome": "virtual DOM",
        "react.js": "React",
        "view.js": "Vue.js",
        "node.js": "Node.js",
        "next.js": "Next.js",
        "typescript": "TypeScript",
        "javascript": "JavaScript",
        "tailwind": "Tailwind CSS",
        "postgress": "PostgreSQL",
        "mongo db": "MongoDB",
        "graphql": "GraphQL",
        "rest api": "REST API",
        "dockerize": "Dockerize",
        "kubernetes": "Kubernetes",
        "aws": "AWS",
        "azure": "Azure",
        "gcp": "GCP",
        "eaml": "YAML",
        "travel inheritance": "types of inheritance",
        "travel inheritances": "types of inheritance",
      };

      let correctedText = text;
      Object.entries(corrections).forEach(([wrong, right]) => {
        const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
        correctedText = correctedText.replace(regex, right);
      });
      text = correctedText;

      // If the text is just one of the hallucinations and very short, discard it
      // But don't discard if it's part of a longer sentence
      const isHallucination = hallucinations.some(h => cleanText === h && text.length < 20);

      if (isHallucination || text.length < 2) {
        text = "";
      }

      // Record voice usage if user authenticated
      if (authReq.user) {
        const voiceMinutes = Math.ceil((audioChunkDuration || 5) / 60);
        await recordVoiceUsage(authReq.user.userId, voiceMinutes);
      }

      const remainingVoice = authReq.user ? await getRemainingQuota(authReq.user.userId, 'voice') : 0;

      res.json({
        text,
        usage: {
          voiceMinutesUsed: audioChunkDuration ? Math.ceil(audioChunkDuration / 60) : 0,
          remainingMinutes: remainingVoice,
        },
      });
    } catch (error: any) {
      console.error("Transcription error:", error);
      const status = error.status || 500;
      const message = error.message || "Transcription failed";

      if (status === 429) {
        return res.status(429).json({
          error: "Rate limit reached. Please wait a moment.",
          retryAfter: error.headers?.['retry-after'] || 3
        });
      }

      res.status(status).json({ error: message });
    } finally {
      if (tmpFilePath && fs.existsSync(tmpFilePath)) {
        fs.unlinkSync(tmpFilePath);
      }
    }
  });

  app.post("/api/analyze", quotaMiddleware('chat'), async (req: express.Request, res) => {
    try {
      const authReq = req as AuthRequest;
      
      const customModel = (req.headers['x-model'] as string) || '';
      const persona = (req.headers['x-persona'] as string) || 'Technical Interviewer';
      const mode = (req.headers['x-mode'] as string) || 'voice';
      const groq = getGroq(clientGroqKeyFromRequest(req));

      const supportsLogprobs = (model: string) => {
        // Define models that are known to support logprobs or skip it completely
        const supported = ['llama3-8b-8192'];
        return supported.includes(model);
      };

      const { transcript, resume, jd } = req.body;
      if (!transcript) {
        return res.status(400).json({ error: "No transcript provided" });
      }

      // ════════════════════════════════════════════════════════════════
      // FAST LOOKUP — Vector Cache Match
      // ════════════════════════════════════════════════════════════════
      try {
        if (
          vectorCacheLookupEnabled() &&
          vectorCache.length > 0 &&
          (mode === 'chat' || mode === 'voice')
        ) {
          const emb = await getEmbedding(transcript);
          
          let topMatches = [];
          for (const item of vectorCache) {
            // Ignore items embedded with a different model if one changes down the line
            if (item.embeddingModel && item.embeddingModel !== 'all-MiniLM-L6-v2') continue;
            
            let maxScore = cosineSimilarity(emb, item.embedding);
            
            // Check all variants for a potentially higher similarity hit
            if (item.variantEmbeddings && Array.isArray(item.variantEmbeddings)) {
              for (const varEmb of item.variantEmbeddings) {
                const varScore = cosineSimilarity(emb, varEmb);
                if (varScore > maxScore) {
                  maxScore = varScore;
                }
              }
            }

            topMatches.push({ item, score: maxScore });
          }
          
          topMatches.sort((a, b) => b.score - a.score);
          // Look at topK = 5
          const bestMatches = topMatches.slice(0, 5);
          
          // Re-rank basic thresholding check logic
          let bestMatch = null;
          let bestScore = -1;
          for (const match of bestMatches) {
             if (match.score > bestScore) {
                bestScore = match.score;
                bestMatch = match.item;
             }
          }

          // Optimal threshold for all-MiniLM-L6-v2 context variations
          if (bestMatch && bestScore > 0.82) {
             console.log(`[Cache HIT] Score: ${bestScore.toFixed(2)} | Q: ${bestMatch.question.substring(0, 40)}`);
             if (mode === 'chat') {
                 return res.json({
                   isQuestion: true,
                   question: bestMatch.question, // Re-map nicely to the clean generated question
                   confidence: 1.0,
                   type: bestMatch.answer.type || 'concept',
                   difficulty: bestMatch.answer.difficulty || 'medium',
                   sections: bestMatch.answer.sections || [],
                   code: bestMatch.answer.code || "",
                   codeLanguage: bestMatch.answer.codeLanguage || "",
                   bullets: [],
                   spoken: bestMatch.answer.spoken || "",
                 });
             } else {
                 return res.json({
                   isQuestion: true,
                   question: bestMatch.question,
                   confidence: 1.0,
                   type: bestMatch.answer.type || 'technical',
                   bullets: bestMatch.answer.bullets || bestMatch.answer.sections?.flatMap((s: any) => s.points || []) || [],
                   spoken: bestMatch.answer.spoken || "I can definitely help with that.",
                 });
             }
          }
        }
      } catch (e) {
        console.error("Vector search failed, falling back to LLM", e);
      }

      // ════════════════════════════════════════════════════════════════
      // CHAT MODE — Adaptive Prompting + Self-Verification Pipeline
      // ════════════════════════════════════════════════════════════════
      if (mode === 'chat') {
        const fastAnalyze = analyzeFastMode();

        // ── STEP 1: Difficulty Classifier (cheap + fast) ──────────────
        let questionType = 'concept';
        let difficulty = 'medium';

        if (!fastAnalyze) {
          try {
            const classifyCompletion = await groq.chat.completions.create({
              messages: [
                {
                  role: "system",
                  content: `You are a classifier. Return ONLY valid JSON, nothing else.
Schema: {"type": "concept | coding | system_design | behavioral", "difficulty": "easy | medium | hard"}
Rules:
- concept: definitions, explanations, comparisons of technologies
- coding: algorithm, data structure, write code, implement
- system_design: architecture, distributed systems, scalability, design a system
- behavioral: experience, soft skills, tell me about a time
- easy: basic definitions, junior-level
- medium: trade-offs, algorithms, intermediate
- hard: system design, architecture, advanced algorithms`
                },
                { role: "user", content: `Classify: ${transcript}` }
              ],
              model: "llama-3.1-8b-instant",
              response_format: { type: "json_object" },
              temperature: 0.1,
            });
            let classifyData: any = {};
            try { classifyData = JSON.parse(classifyCompletion.choices[0]?.message?.content || "{}"); } catch { }
            questionType = classifyData.type || 'concept';
            difficulty = classifyData.difficulty || 'medium';
          } catch { /* use defaults */ }
        }

        // ── STEP 2: Build Adaptive Prompt ─────────────────────────────
        const chatSystemPrompt = buildChatSystemPrompt({
          questionType,
          difficulty,
          resume,
          jd,
          persona,
        });

        // ── STEP 3: Generate Answer ────────────────────────────────────
        const chatModel = fastAnalyze ? "llama-3.1-8b-instant" : "llama-3.3-70b-versatile";
        const chatParams: any = {
          messages: [
            { role: "system", content: chatSystemPrompt },
            { role: "user", content: `Question: ${transcript}` }
          ],
          model: chatModel,
          temperature: 0.4, // Lower = more accurate, less hallucination
          response_format: { type: "json_object" },
        };

        if (supportsLogprobs(chatModel)) {
          chatParams.logprobs = true;
        }
        if (fastAnalyze) {
          chatParams.max_tokens = 1536;
        }

        const chatCompletion = await groq.chat.completions.create(chatParams);

        const chatData = extractJSON(chatCompletion.choices[0]?.message?.content || "{}");

        // Compute confidence (logprob or self-estimation fallback)
        let confidence = 1.0;
        const tokens = (chatCompletion.choices[0] as any)?.logprobs?.content;
        if (tokens && Array.isArray(tokens) && tokens.length > 0) {
          const avgLogProb = tokens.reduce((s: number, t: any) => s + (t.logprob || 0), 0) / tokens.length;
          confidence = Math.exp(avgLogProb);
          console.log(`[Chat] Answer generated with logprob confidence: ${confidence.toFixed(2)}`);
        } else if (!fastAnalyze) {
          try {
            const confCompletion = await groq.chat.completions.create({
              model: "llama-3.1-8b-instant",
              messages: [
                { role: "system", content: buildAnswerConfidencePrompt(transcript, JSON.stringify(chatData)) },
              ],
              temperature: 0.1,
            });
            const confData = extractJSON(confCompletion.choices[0]?.message?.content || "{}");
            if (typeof confData.confidence === 'number') {
              confidence = confData.confidence;
              console.log(`[Chat] Answer generated with LLM self-confidence: ${confidence.toFixed(2)}`);
            }
          } catch {
             console.log(`[Chat] Answer generated with default confidence: 1.0`);
          }
        }

        // ── STEP 4: Self-Verification for hard/system_design questions ─
        // Use logprobs trick: ONLY run verification if confidence is low (< 0.8)
        if (
          !fastAnalyze &&
          (difficulty === 'hard' || questionType === 'system_design') &&
          confidence < 0.8
        ) {
          try {
            const verifyCompletion = await groq.chat.completions.create({
              messages: [
                {
                  role: "system",
                  content: buildAnswerVerificationPrompt(transcript, JSON.stringify(chatData))
                }
              ],
              model: "llama-3.1-8b-instant", // Fast + cheap for verification
              response_format: { type: "json_object" },
              temperature: 0.2,
            });

            let verifyData: any = { valid: true };
            try { verifyData = JSON.parse(verifyCompletion.choices[0]?.message?.content || "{}"); } catch { }

            if (!verifyData.valid && Array.isArray(verifyData.improvedSections) && verifyData.improvedSections.length > 0) {
              chatData.sections = verifyData.improvedSections;
              console.log(`[Verify] Fixed issues: ${verifyData.issues?.join(', ')}`);
            }
          } catch { /* use original answer if verification fails */ }
        }

        // ── STEP 5: Normalize + Return ─────────────────────────────────
        const sections = Array.isArray(chatData.sections) ? chatData.sections : [];
        // Fallback: if model returned old-style explanation, wrap it
        if (sections.length === 0 && (chatData.explanation || chatData.answer)) {
          sections.push({
            title: "Answer",
            content: chatData.explanation || chatData.answer || "",
            points: Array.isArray(chatData.bullets) ? chatData.bullets : []
          });
        }

        // Record chat usage if user authenticated
        if (authReq.user) {
          await recordChatUsage(authReq.user.userId, 1);
        }

        return res.json({
          isQuestion: true,
          question: transcript,
          confidence: 1.0,
          type: questionType,
          difficulty,
          sections,
          code: chatData.code || "",
          codeLanguage: chatData.codeLanguage || chatData.language || "",
          bullets: [],
          spoken: chatData.spoken || "",
        });
      } else {
      // ════════════════════════════════════════════════════════════════
      // VOICE MODE — Low Latency, High Signal Density
      // ════════════════════════════════════════════════════════════════
        const fastAnalyze = analyzeFastMode();
        const voiceSystemPrompt = buildVoiceSystemPrompt({ resume, jd, persona });

        const selectedVoiceModel = customModel || "llama-3.1-8b-instant";
        const voiceParams: any = {
          messages: [
            { role: "system", content: voiceSystemPrompt },
            { role: "user", content: `Transcript: "${transcript}"` }
          ],
          model: selectedVoiceModel,
          response_format: { type: "json_object" },
          temperature: 0.3, // Low temperature = fast, accurate, deterministic
        };

        if (supportsLogprobs(selectedVoiceModel)) {
          voiceParams.logprobs = true;
        }
        if (fastAnalyze) {
          voiceParams.max_tokens = 768;
        }

        const voiceCompletion = await groq.chat.completions.create(voiceParams);

        // Calculate actual logprob confidence or use LLM self-estimation
        const voiceTokens = (voiceCompletion.choices[0] as any)?.logprobs?.content;
        let logprobConfidence = -1;
        if (voiceTokens && Array.isArray(voiceTokens) && voiceTokens.length > 0) {
          const avgLogProb = voiceTokens.reduce((s: number, t: any) => s + (t.logprob || 0), 0) / voiceTokens.length;
          logprobConfidence = Math.exp(avgLogProb);
          console.log(`[Voice] Question detection API completed with avg logprob confidence: ${logprobConfidence.toFixed(2)}`);
        } else if (!fastAnalyze) {
          try {
            const confCompletion = await groq.chat.completions.create({
              model: "llama-3.1-8b-instant",
              messages: [
                { role: "system", content: buildVoiceQuestionConfidencePrompt(transcript) },
              ],
              response_format: { type: "json_object" },
              temperature: 0.1,
            });
            const confData = JSON.parse(confCompletion.choices[0]?.message?.content || "{}");
            if (typeof confData.confidence === 'number') {
              logprobConfidence = confData.confidence;
              console.log(`[Voice] Question detection API completed with LLM self-confidence: ${logprobConfidence.toFixed(2)}`);
            }
          } catch {
             console.log(`[Voice] Question detection API fallback to default confidence`);
          }
        }

        let voiceData: any = { isQuestion: false };
        try {
          voiceData = JSON.parse(voiceCompletion.choices[0]?.message?.content || "{}");
          
          if (logprobConfidence >= 0) {
            voiceData.confidence = logprobConfidence; // Override self-reported LLM confidence
          }
        } catch {
          voiceData = { isQuestion: false };
        }
        
        // Anti-hallucination guard
        if (voiceData.isQuestion && voiceData.confidence < 0.2) {
           console.log(`[Voice] Rejected question due to low confidence (< 0.2)`);
           voiceData.isQuestion = false;
        }
        
        // Record chat usage if user authenticated (voice mode also counts as chat message)
        if (authReq.user) {
          await recordChatUsage(authReq.user.userId, 1);
        }
        
        return res.json(voiceData);
      }

    } catch (error: any) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: error.message || "Analysis failed" });
    }
  });

  /**
   * Streaming variant for chat UX. Keeps existing /api/analyze unchanged and only streams
   * a live explanation preview + final structured payload.
   */
  app.post("/api/analyze/stream", quotaMiddleware('chat'), async (req: express.Request, res) => {
    try {
      const customModel = (req.headers['x-model'] as string) || '';
      const persona = (req.headers['x-persona'] as string) || 'Technical Interviewer';
      const mode = (req.headers['x-mode'] as string) || 'chat';
      const groq = getGroq(clientGroqKeyFromRequest(req));
      const { transcript, resume, jd } = req.body || {};

      if (mode !== 'chat') {
        return res.status(400).json({ error: 'Streaming is currently supported for chat mode only' });
      }
      if (!transcript) {
        return res.status(400).json({ error: "No transcript provided" });
      }

      const fastAnalyze = analyzeFastMode();
      let questionType = 'concept';
      let difficulty = 'medium';

      if (!fastAnalyze) {
        try {
          const classifyCompletion = await groq.chat.completions.create({
            messages: [
              { role: 'system', content: buildQuestionClassificationPrompt() },
              { role: 'user', content: `Classify: ${transcript}` },
            ],
            model: 'llama-3.1-8b-instant',
            response_format: { type: 'json_object' },
            temperature: 0.1,
          });
          const classifyData = extractJSON(classifyCompletion.choices[0]?.message?.content || '{}');
          questionType = classifyData.type || 'concept';
          difficulty = classifyData.difficulty || 'medium';
        } catch {
          // Keep defaults
        }
      }

      const chatSystemPrompt = buildChatSystemPrompt({
        questionType,
        difficulty,
        resume,
        jd,
        persona,
      });

      const chatModel = customModel || (fastAnalyze ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile');
      const stream = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: chatSystemPrompt },
          { role: 'user', content: `Question: ${transcript}` },
        ],
        model: chatModel,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        stream: true,
      });

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const sendSse = (payload: any) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      let raw = '';
      let sentPreview = '';
      for await (const part of stream as any) {
        const delta = part?.choices?.[0]?.delta?.content || '';
        if (!delta) continue;
        raw += delta;
        const preview = extractPreviewExplanationFromJsonStream(raw);
        if (preview && preview.length > sentPreview.length) {
          const nextDelta = preview.slice(sentPreview.length);
          sentPreview = preview;
          sendSse({ type: 'preview', text: nextDelta });
        }
      }

      const parsed = extractJSON(raw);
      const authReqStream = req as AuthRequest;
      if (authReqStream.user) {
        await recordChatUsage(authReqStream.user.userId, 1);
      }
      sendSse({
        type: 'final',
        data: {
          isQuestion: true,
          question: transcript,
          confidence: 1.0,
          type: parsed.type || questionType || 'general',
          difficulty: parsed.difficulty || difficulty || 'medium',
          sections: Array.isArray(parsed.sections) ? parsed.sections : [],
          code: parsed.code || '',
          codeLanguage: parsed.codeLanguage || '',
          explanation: parsed.explanation || '',
          spoken: parsed.spoken || parsed.explanation || '',
          bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [],
        },
      });
      sendSse({ type: 'done' });
      res.end();
    } catch (error: any) {
      console.error('Analyze stream error:', error);
      if (!res.headersSent) {
        return res.status(error?.status || 500).json({ error: error?.message || 'Analyze stream failed' });
      }
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error?.message || 'Analyze stream failed' })}\n\n`);
      } catch {
        // ignore write failures
      }
      res.end();
    }
  });

  // Background Cache Generator Endpoint (~8 chat units after success)
  app.post("/api/generate-cache", async (req: express.Request, res) => {
    const authReq = req as AuthRequest;
    const user = await getUserFromDB(authReq.user!.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    resetMonthlyUsageIfNeeded(user);
    if (user.plan === 'free' && checkTrialExpired(user)) {
      return res.status(402).json({ message: 'Free trial expired. Upgrade to continue.', code: 'trial_expired' });
    }
    const planFeatures = PLAN_LIMITS[user.plan].features;
    if (!planFeatures.cacheGeneration) {
      return res.status(403).json({
        status: 'Plan required',
        message: 'Interview cache generation requires Basic or Pro. Upgrade your plan.',
      });
    }
    const chatRemaining = await getRemainingQuota(authReq.user!.userId, 'chat');
    if (chatRemaining < 8) {
      return res.status(402).json({
        message: 'Not enough chat quota for cache generation (needs at least 8 messages remaining).',
        code: 'quota_exceeded',
      });
    }

    const { jd, resume } = req.body;

    if (!jd || jd.length < 50) {
      console.log("[Cache] JD too short or missing. Skipping.");
      return res.status(400).json({ status: "JD too short" });
    }

    try {
      const groq = getGroq(clientGroqKeyFromRequest(req));
      console.log("[Cache] Starting pre-interview cache generation...");

      // Step 1: Generate Questions
      const questionsCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: buildCacheQuestionsPrompt(jd)
          }
        ],
        model: "llama-3.1-8b-instant",
        temperature: 0.3,
      });

      const data = extractJSON(questionsCompletion.choices[0]?.message?.content || "{}");
      const questions: string[] = Array.isArray(data.questions) ? data.questions : [];
      
      if (questions.length === 0) {
        console.log("[Cache] Failed to generate questions array.");
        return;
      }
      
      console.log(`[Cache] Found ${questions.length} questions. Generating answers & embeddings...`);
      vectorCache = []; // clear old cache

      // Step 2: Generate Answers & Embeddings
      // Run sequentially to keep Groq happy, but fast because 8b model
      for (const q of questions) {
         try {
          const systemPrompt = buildCacheAnswerPrompt({ question: q, resume, jd });
            const ansCompletion = await groq.chat.completions.create({
              messages: [
                 { role: "system", content: systemPrompt },
                 { role: "user", content: `Question: ${q}\n\nResume Context: ${resume || 'None'}\nJob Context: ${jd.substring(0, 1000)}` }
              ],
              model: "llama-3.1-8b-instant", // Using 8b for bulk speed
              response_format: { type: "json_object" },
              temperature: 0.2, // Deterministic
            });

            let answerJson = JSON.parse(ansCompletion.choices[0]?.message?.content || "{}");
            
            // Standardize code and difficulty fallbacks mapping natively
            if (answerJson.code === null || answerJson.code === undefined) answerJson.code = "";
            if (!answerJson.difficulty) answerJson.difficulty = "medium";
            
            // Extract variants and generate embeddings
            const variants = Array.isArray(answerJson.variants) ? answerJson.variants : [];
            delete answerJson.variants; // Remove from answers to keep structure clean
            
            const variantEmbeddings: number[][] = [];
            for (const variant of variants) {
                if (typeof variant === 'string' && variant.trim().length > 5) {
                    const varEmb = await getEmbedding(variant);
                    variantEmbeddings.push(varEmb);
                }
            }

            // Create a single unique entry for the MAIN QUESTION + VARIANTS
            const emb = await getEmbedding(q);
            vectorCache.push({
               id: Math.random().toString(36).substring(7),
               question: q,
               embeddingModel: "all-MiniLM-L6-v2",
               embedding: emb,
               variants: variants,
               variantEmbeddings: variantEmbeddings,
               answer: answerJson
            });

            console.log(`[Cache] Pre-generated: ${q.substring(0, 45)}... with ${variants.length} variations`);
         } catch(e) {
           console.log(`[Cache] Skipped individual generation for: ${q}`);
         }
      }

      // Step 3: Write out buffer to cache file
      fs.writeFileSync(CACHE_FILE, JSON.stringify(vectorCache));
      console.log(`[Cache] Success! ${vectorCache.length} questions are now primed natively in vector cache.`);

      await recordChatUsage(authReq.user!.userId, 8);

      // Return success response to frontend
      res.json({ status: `Successfully cached ${vectorCache.length} questions!` });
    } catch(err: any) {
      console.error("[Cache] Background generation failed pipeline:", err);
      res.status(500).json({ status: "Generation failed", error: err.message });
    }
  });

  // GET /api/usage — Get user's current usage + remaining quotas
  app.get('/api/usage', async (req: express.Request, res) => {
    const pct = (used: number, limit: number) =>
      !limit || limit <= 0 ? 0 : (used / limit) * 100;

    try {
      const authReq = req as AuthRequest;

      if (!authReq.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      let user: Awaited<ReturnType<typeof getUserFromDB>>;
      try {
        user = await getUserFromDB(authReq.user.userId);
      } catch (dbErr) {
        console.error('[api/usage] getUserFromDB failed:', dbErr);
        return res.status(503).json({
          error: 'Database error while loading usage',
          ...(process.env.NODE_ENV !== 'production'
            ? { detail: dbErr instanceof Error ? dbErr.message : String(dbErr) }
            : {}),
        });
      }

      if (!user) {
        try {
          user = await createUserInDB(authReq.user.userId, authReq.user.email || '');
        } catch (createErr) {
          console.error('[api/usage] createUserInDB failed:', createErr);
          return res.status(503).json({
            error: 'Could not create usage profile',
            ...(process.env.NODE_ENV !== 'production'
              ? { detail: createErr instanceof Error ? createErr.message : String(createErr) }
              : {}),
          });
        }
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      resetMonthlyUsageIfNeeded(user);
      const planConfig = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.free;

      const response = {
        user: {
          userId: user.userId,
          email: user.email,
          plan: user.plan,
          subscriptionStatus: user.subscriptionStatus,
        },
        quotas: {
          voiceMinutes: {
            used: user.voiceMinutesUsed,
            limit: planConfig.voiceMinutesPerMonth,
            remaining: Math.max(0, planConfig.voiceMinutesPerMonth - user.voiceMinutesUsed),
            percentUsed: pct(user.voiceMinutesUsed, planConfig.voiceMinutesPerMonth),
          },
          chatMessages: {
            used: user.chatMessagesUsed,
            limit: planConfig.chatMessagesPerMonth,
            remaining: Math.max(0, planConfig.chatMessagesPerMonth - user.chatMessagesUsed),
            percentUsed: pct(user.chatMessagesUsed, planConfig.chatMessagesPerMonth),
          },
          sessions: {
            used: user.sessionsUsed,
            limit: planConfig.sessionsPerMonth,
            remaining: Math.max(0, planConfig.sessionsPerMonth - user.sessionsUsed),
            percentUsed: pct(user.sessionsUsed, planConfig.sessionsPerMonth),
          },
        },
        features: planConfig.features,
        currentMonth: user.currentMonth,
        trialDaysRemaining: user.plan === 'free' && !checkTrialExpired(user) ? calculateTrialDaysRemaining(user) : 0,
      };

      // Prevent browser caching to ensure real-time quota updates
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      });

      res.json(response);
    } catch (error) {
      console.error('Usage endpoint error:', error);
      res.status(500).json({
        error: 'Failed to fetch usage data',
        ...(process.env.NODE_ENV !== 'production'
          ? { detail: error instanceof Error ? error.message : String(error) }
          : {}),
      });
    }
  });

  // POST /api/upgrade — Upgrade user plan (dev / explicit opt-in only).
  // In production, plan changes must come from a verified billing webhook (e.g. Stripe), not the browser.
  app.post('/api/upgrade', async (req: express.Request, res) => {
    try {
      const authReq = req as AuthRequest;
      
      if (!authReq.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (process.env.NODE_ENV === 'production' && !truthyEnv(process.env.ALLOW_CLIENT_PLAN_UPGRADE)) {
        return res.status(403).json({
          error: 'Plan is assigned through billing. Client-initiated upgrades are disabled.',
          code: 'upgrade_via_billing_only',
        });
      }

      const { newPlan } = req.body;
      if (!['basic', 'pro', 'enterprise'].includes(newPlan)) {
        return res.status(400).json({ error: 'Invalid plan' });
      }

      const upgraded = await upgradeUserPlan(authReq.user.userId, newPlan);
      if (!upgraded) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        message: `Successfully upgraded to ${newPlan} plan`,
        user: { plan: upgraded.plan },
      });
    } catch (error) {
      console.error('Upgrade endpoint error:', error);
      res.status(500).json({ error: 'Failed to upgrade plan' });
    }
  });

  // ════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT ENDPOINTS
  // ════════════════════════════════════════════════════════════════

  // POST /api/sessions/start — Create new interview session
  app.post('/api/sessions/start', quotaMiddleware('session'), async (req: express.Request, res) => {
    try {
      const authReq = req as AuthRequest;
      
      if (!authReq.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { createSession } = await import('../storage/usageStorage');
      const sessionId = await createSession(authReq.user.userId);

      if (!sessionId) {
        return res.status(500).json({ error: 'Failed to create session' });
      }

      res.json({
        sessionId,
        message: `Session started: ${sessionId}`,
      });
    } catch (error: any) {
      console.error('[Session] Failed to start session:', error.message);
      res.status(500).json({ error: 'Failed to start session' });
    }
  });

  // PUT /api/sessions/:sessionId — Update session with question count
  app.put('/api/sessions/:sessionId', async (req: express.Request, res) => {
    try {
      const authReq = req as AuthRequest;
      const { sessionId } = req.params;
      const { questionsAsked, voiceMinutesUsed } = req.body;

      if (!authReq.user || !sessionId) {
        return res.status(401).json({ error: 'User not authenticated or missing session ID' });
      }

      const { updateSession } = await import('../storage/usageStorage');
      await updateSession(sessionId, authReq.user.userId, questionsAsked || 0, voiceMinutesUsed || 0);

      res.json({
        sessionId,
        message: `Session updated: ${questionsAsked} questions asked`,
      });
    } catch (error: any) {
      console.error('[Session] Failed to update session:', error.message);
      res.status(500).json({ error: 'Failed to update session' });
    }
  });

  // PUT /api/sessions/:sessionId/close — Close/complete session
  app.put('/api/sessions/:sessionId/close', async (req: express.Request, res) => {
    try {
      const authReq = req as AuthRequest;
      const { sessionId } = req.params;
      const { status } = req.body; // 'completed' or 'abandoned'

      if (!authReq.user || !sessionId) {
        return res.status(401).json({ error: 'User not authenticated or missing session ID' });
      }

      const finalStatus = (status === 'completed' || status === 'abandoned') ? status : 'completed';

      const { closeSession } = await import('../storage/usageStorage');
      await closeSession(sessionId, authReq.user.userId, finalStatus);

      res.json({
        sessionId,
        status: finalStatus,
        message: `Session closed: ${finalStatus}`,
      });
    } catch (error: any) {
      console.error('[Session] Failed to close session:', error.message);
      res.status(500).json({ error: 'Failed to close session' });
    }
  });

  // GET /api/sessions/active — Get all currently active sessions (admin/monitoring)
  app.get('/api/sessions/active', async (req: express.Request, res) => {
    try {
      const authReq = req as AuthRequest;
      if (!authReq.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }
      const { getActiveSessionsForUser } = await import('../storage/usageStorage');
      const activeSessions = await getActiveSessionsForUser(authReq.user.userId);

      res.json({
        count: activeSessions.length,
        sessions: activeSessions,
      });
    } catch (error: any) {
      console.error('[Session] Failed to fetch active sessions:', error.message);
      res.status(500).json({ error: 'Failed to fetch active sessions' });
    }
  });

  // GET /api/sessions/history — Get user's past session history
  app.get('/api/sessions/history', async (req: express.Request, res) => {
    try {
      const authReq = req as AuthRequest;
      
      if (!authReq.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { getUserSessionHistory } = await import('../storage/usageStorage');
      const history = await getUserSessionHistory(authReq.user.userId);

      res.json({
        userId: authReq.user.userId,
        sessionCount: history.length,
        sessions: history,
      });
    } catch (error: any) {
      console.error('[Session] Failed to fetch session history:', error.message);
      res.status(500).json({ error: 'Failed to fetch session history' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const viteModule = await import('vite');
    const repoRoot = path.join(apiDir, '..', '..');
    const vite = await viteModule.createServer({
      root: repoRoot,
      configFile: path.join(repoRoot, 'vite.config.ts'),
      server: {
        middlewareMode: true,
        /** Same HTTP server as Express so HMR WebSocket is not a separate port (24678) that returns 400. */
        hmr: { server: httpServer },
      },
      appType: 'spa',
      mode: 'development',
    });
    app.use(vite.middlewares);
  } else {
    const buildPath = path.join(apiDir, '../../build');
    app.use(express.static(buildPath));
    
    // SPA Fallback for React Router
    app.get('*', (req, res) => {
      res.sendFile(path.join(buildPath, 'index.html'));
    });
  }

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return app;
  }

  return new Promise((resolve) => {
    let wroteDevPortMarker = false;
    const clearDevPortMarker = () => {
      if (!wroteDevPortMarker) return;
      try {
        fs.unlinkSync(interviewGuruDevPortFile);
      } catch {
        /* ignore */
      }
    };
    const startListen = (port: number) => {
      httpServer
        .listen(port, '0.0.0.0', () => {
          console.log(`Server running on http://localhost:${port}`);
          const isDevListen =
            !process.env.VERCEL &&
            !process.env.AWS_LAMBDA_FUNCTION_NAME &&
            process.env.NODE_ENV !== 'production';
          if (isDevListen) {
            try {
              fs.writeFileSync(interviewGuruDevPortFile, String(port), 'utf8');
              wroteDevPortMarker = true;
            } catch (e) {
              console.warn('[Server] Could not write .interviewguru-dev-port:', (e as Error)?.message || e);
            }
            process.once('SIGINT', clearDevPortMarker);
            process.once('SIGTERM', clearDevPortMarker);
            process.once('exit', clearDevPortMarker);
          }
          resolve(port);
        })
        .on('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            console.warn(`[Server] Port ${port} is in use, trying ${port + 1}...`);
            startListen(port + 1);
          } else {
            console.error(err);
          }
        });
    };
    startListen(initialPort);
  });
}

// Always start in dev script.
// In Vercel/serverless environments, this resolves to the configured Express app instead of listening.
export const serverBootstrap = startServer();

if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  serverBootstrap.catch(console.error);
}

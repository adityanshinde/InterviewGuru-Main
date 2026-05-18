import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { verifyToken } from '@clerk/express';
import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { clerkSecretKeyForNode, clerkPublishableKeyForNode } from '../config/clerkKeys';
import { loadClerkUserForRequest } from '../services/clerkUserSync';
import { getUserFromDB, recordVoiceUsage, recordChatUsage, getRemainingQuota, resetMonthlyUsageIfNeeded, checkTrialExpired } from '../storage/usageStorage';
import { checkApiBudget, trackTranscriptionCost, trackLLMCost, getUserSpending } from '../services/apiCostTracker';
import { buildVoiceSystemPrompt, buildChatSystemPrompt } from '../../shared/prompts';
import { PLAN_LIMITS, type PlanTier } from '../../shared/constants/planLimits';
import { lookupVectorCache, type VectorCacheHit } from '../services/vectorCacheService';

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════

export type WSMessageType = 
  | 'audio_chunk'      // Client sends audio chunk
  | 'transcript'       // Server sends partial/complete transcript
  | 'question_detected'// Server sends detected question
  | 'answer_token'     // Server streams answer tokens
  | 'answer_complete'  // Server sends complete answer
  | 'ask_question'     // Client sends a direct chat question
  | 'error'            // Error message
  | 'ping'             // Keep-alive ping
  | 'pong'             // Keep-alive pong
  | 'config'           // Client sends configuration (model, persona, etc.)
  | 'status';          // Server sends connection status

export interface WSMessage {
  type: WSMessageType;
  data?: unknown;
  timestamp: number;
  id?: string;
}

export interface AudioChunkMessage {
  type: 'audio_chunk';
  data: {
    audioBase64: string;
    mimeType: string;
    chunkIndex: number;
    isLast?: boolean;
  };
  timestamp: number;
}

export interface ConfigMessage {
  type: 'config';
  data: {
    model?: string;
    voiceModel?: string;
    persona?: string;
    mode?: 'voice' | 'chat';
    resume?: string;
    jd?: string;
    groqApiKey?: string;
  };
  timestamp: number;
}

interface ClientConnection {
  ws: WebSocket;
  userId: string;
  email: string;
  plan: PlanTier;
  config: {
    model: string;
    voiceModel: string;
    persona: string;
    mode: 'voice' | 'chat';
    resume: string;
    jd: string;
    customGroqKey?: string;
  };
  audioBuffer: Buffer[];
  lastActivityTime: number;
  messageCount: number;
  rateLimitWindow: number;
  isProcessing: boolean;
  transcriptBuffer: string;
  speculativeInFlight: boolean;
  answerGenerationId: number;
}

// ════════════════════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════════════════════

const PING_INTERVAL_MS = 30000;
const CONNECTION_TIMEOUT_MS = 300000; // 5 minutes of inactivity
const RATE_LIMIT_WINDOW_MS = 60000;   // 1 minute
const RATE_LIMIT_MAX_MESSAGES = 120;  // Max messages per minute
const REALTIME_AUDIO_CHUNKS_BEFORE_STT = 3; // ~600ms at 200ms/chunk
const HTTP_FALLBACK_AUDIO_CHUNKS = 3;
const MAX_AUDIO_BUFFER_SIZE = 50;     // Max chunks in buffer
const GROQ_PREWARM_INTERVAL_MS = 30000;

// ════════════════════════════════════════════════════════════════
// WebSocket Server
// ════════════════════════════════════════════════════════════════

const connections = new Map<string, ClientConnection>();
let wss: WebSocketServer | null = null;
let groqPrewarmTimer: NodeJS.Timeout | null = null;

function startGroqPrewarm(): void {
  if (groqPrewarmTimer || !process.env.GROQ_API_KEY) return;

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  groqPrewarmTimer = setInterval(() => {
    void groq.chat.completions
      .create({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      })
      .catch(() => {});
  }, GROQ_PREWARM_INTERVAL_MS);

  console.log('[WS] Groq connection pre-warm enabled');
}

function getGroq(customKey?: string): Groq {
  const key = customKey || process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error('Groq API key required');
  }
  return new Groq({ apiKey: key });
}

function sendMessage(ws: WebSocket, message: WSMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, error: string, code?: string): void {
  sendMessage(ws, {
    type: 'error',
    data: { message: error, code },
    timestamp: Date.now(),
  });
}

async function verifyClerkToken(token: string): Promise<{ userId: string } | null> {
  const secretKey = clerkSecretKeyForNode();
  const publishableKey = clerkPublishableKeyForNode();
  
  if (!secretKey) {
    console.warn('[WS] No Clerk secret key configured');
    return null;
  }

  try {
    const payload = await verifyToken(token, {
      secretKey,
      authorizedParties: publishableKey ? undefined : [],
    });
    
    if (payload?.sub) {
      return { userId: payload.sub };
    }
    return null;
  } catch (err) {
    console.error('[WS] Token verification failed:', err);
    return null;
  }
}

async function processAudioChunk(connection: ClientConnection, chunk: AudioChunkMessage): Promise<void> {
  const { ws, userId, plan, config } = connection;
  
  // Add to buffer
  const audioBuffer = Buffer.from(chunk.data.audioBase64, 'base64');
  connection.audioBuffer.push(audioBuffer);
  
  // Prevent buffer overflow
  if (connection.audioBuffer.length > MAX_AUDIO_BUFFER_SIZE) {
    connection.audioBuffer.shift();
  }
  
  const chunksNeeded = connection.config.mode === 'voice'
    ? REALTIME_AUDIO_CHUNKS_BEFORE_STT
    : HTTP_FALLBACK_AUDIO_CHUNKS;
  const shouldProcess = connection.audioBuffer.length >= chunksNeeded || chunk.data.isLast;
  
  if (!shouldProcess || connection.isProcessing) {
    return;
  }

  connection.isProcessing = true;

  try {
    // Check quota
    const voiceRemaining = await getRemainingQuota(userId, 'voice');
    if (voiceRemaining <= 0) {
      sendError(ws, 'Voice quota exceeded', 'quota_exceeded');
      connection.isProcessing = false;
      return;
    }

    // Check API budget
    const estimatedCost = 0.001; // ~1 minute estimate
    const budgetCheck = await checkApiBudget(userId, plan, estimatedCost);
    if (!budgetCheck.allowed) {
      sendError(ws, budgetCheck.message || 'API budget exceeded', 'api_budget_exceeded');
      connection.isProcessing = false;
      return;
    }

    // Combine buffered audio
    const combinedAudio = Buffer.concat(connection.audioBuffer);
    connection.audioBuffer = [];

    // Write to temp file for Groq
    const ext = chunk.data.mimeType?.includes('mp4') ? 'mp4' : 'webm';
    const tmpFilePath = path.join(os.tmpdir(), `ws-audio-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
    fs.writeFileSync(tmpFilePath, combinedAudio);

    try {
      const groq = getGroq(config.customGroqKey);
      
      const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(tmpFilePath),
        model: config.voiceModel || 'whisper-large-v3-turbo',
        response_format: 'json',
      });

      const text = transcription.text?.trim() || '';
      
      // Filter hallucinations
      const hallucinations = [
        'thank you', 'thanks for watching', 'please subscribe', 'bye', 'goodbye',
        'um', 'uh', 'oh', 'the end', 'subtitle by', 'translated by',
      ];
      const cleanText = text.toLowerCase().replace(/[.,!?;:]/g, '');
      const isHallucination = hallucinations.some(h => cleanText === h && text.length < 20);

      if (!isHallucination && text.length > 2) {
        // Send transcript update
        sendMessage(ws, {
          type: 'transcript',
          data: { text, isPartial: false },
          timestamp: Date.now(),
        });

        // Add to transcript buffer for question detection
        connection.transcriptBuffer += ' ' + text;
        if (connection.transcriptBuffer.length > 1000) {
          connection.transcriptBuffer = connection.transcriptBuffer.slice(-1000);
        }

        // Record usage
        const audioMinutes = Math.ceil(combinedAudio.length / (48000 * 2 * 60)); // Rough estimate
        await recordVoiceUsage(userId, Math.max(1, audioMinutes));
        if (!config.customGroqKey) {
          await trackTranscriptionCost(userId, Math.max(1, audioMinutes), config.voiceModel);
        }

        const bufferLen = connection.transcriptBuffer.trim().length;
        if (bufferLen > 20) {
          void runSpeculativeQuestionCheck(connection);
        }
        if (bufferLen > 15) {
          await detectAndAnswerQuestion(connection);
        }
      }
    } finally {
      // Clean up temp file
      if (fs.existsSync(tmpFilePath)) {
        fs.unlinkSync(tmpFilePath);
      }
    }
  } catch (err: any) {
    console.error('[WS] Audio processing error:', err);
    sendError(ws, err.message || 'Audio processing failed');
  } finally {
    connection.isProcessing = false;
  }
}

function transcriptLooksLikeQuestion(text: string): boolean {
  const lowerText = text.toLowerCase();
  return (
    text.includes('?') ||
    /\b(what|how|why|when|where|who|can you|could you|explain|describe|tell me|is it|does it|are there)\b/.test(
      lowerText
    )
  );
}

/** Fire-and-forget pre-check while audio is still streaming (Phase 3.1). */
async function runSpeculativeQuestionCheck(connection: ClientConnection): Promise<void> {
  if (connection.speculativeInFlight || connection.isProcessing) return;
  const text = connection.transcriptBuffer.trim();
  if (text.length <= 20 || !transcriptLooksLikeQuestion(text)) return;

  connection.speculativeInFlight = true;
  try {
    const groq = getGroq(connection.config.customGroqKey);
    await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'Reply with JSON only: {"isQuestion":boolean,"confidence":number}. Is this likely an interview question?',
        },
        { role: 'user', content: text.slice(-400) },
      ],
      model: 'llama-3.1-8b-instant',
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 32,
    });
  } catch {
    // Speculative — ignore failures
  } finally {
    connection.speculativeInFlight = false;
  }
}

function voiceAnswerFromCache(hit: VectorCacheHit) {
  return {
    isQuestion: true,
    question: hit.question,
    confidence: 1,
    type: hit.answer.type || 'technical',
    bullets:
      hit.answer.bullets ||
      (hit.answer.sections as { points?: string[] }[] | undefined)?.flatMap((s) => s.points || []) ||
      [],
    spoken: hit.answer.spoken || 'I can definitely help with that.',
  };
}

async function generateVoiceLlmAnswer(
  connection: ClientConnection,
  transcript: string
): Promise<Record<string, unknown> | null> {
  const { config } = connection;
  const groq = getGroq(config.customGroqKey);
  const voiceSystemPrompt = buildVoiceSystemPrompt({
    resume: config.resume,
    jd: config.jd,
    persona: config.persona,
  });

  const voiceCompletion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: voiceSystemPrompt },
      { role: 'user', content: `Transcript: "${transcript}"` },
    ],
    model: config.model || 'llama-3.1-8b-instant',
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 768,
  });

  const voiceData = JSON.parse(voiceCompletion.choices[0]?.message?.content || '{}');
  if (voiceData.isQuestion && voiceData.confidence > 0.6) {
    return voiceData;
  }
  return null;
}

/** Phase 3.2 — start cache lookup and LLM together; first valid result wins. */
async function raceCacheOrVoiceLlm(
  connection: ClientConnection,
  transcript: string
): Promise<{ source: 'cache' | 'llm'; payload: Record<string, unknown> } | null> {
  const generationId = ++connection.answerGenerationId;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { source: 'cache' | 'llm'; payload: Record<string, unknown> } | null) => {
      if (settled || connection.answerGenerationId !== generationId) return;
      if (!result) return;
      settled = true;
      resolve(result);
    };

    void lookupVectorCache(transcript, 'voice')
      .then((hit) => {
        if (hit) finish({ source: 'cache', payload: voiceAnswerFromCache(hit) });
      })
      .catch(() => {});

    void generateVoiceLlmAnswer(connection, transcript)
      .then((llm) => {
        if (llm) finish({ source: 'llm', payload: llm });
      })
      .catch(() => {});

    setTimeout(() => {
      if (!settled && connection.answerGenerationId === generationId) {
        settled = true;
        resolve(null);
      }
    }, 20000);
  });
}

async function detectAndAnswerQuestion(connection: ClientConnection): Promise<void> {
  const { ws, userId, config, transcriptBuffer } = connection;
  const trimmed = transcriptBuffer.trim();

  if (!transcriptLooksLikeQuestion(trimmed)) {
    return;
  }

  try {
    if (config.mode === 'chat') {
      await streamChatAnswer(connection, trimmed);
      return;
    }

    const winner = await raceCacheOrVoiceLlm(connection, trimmed);
    if (!winner?.payload) return;

    const voiceData = winner.payload;
    sendMessage(ws, {
      type: 'question_detected',
      data: {
        question: (voiceData.question as string) || trimmed,
        confidence: (voiceData.confidence as number) ?? 1,
        type: (voiceData.type as string) || 'technical',
      },
      timestamp: Date.now(),
    });

    sendMessage(ws, {
      type: 'answer_complete',
      data: {
        bullets: (voiceData.bullets as string[]) || [],
        spoken: (voiceData.spoken as string) || '',
        type: voiceData.type,
      },
      timestamp: Date.now(),
    });

    connection.transcriptBuffer = connection.transcriptBuffer.slice(-20);

    await recordChatUsage(userId, 1);
    if (!config.customGroqKey && winner.source === 'llm') {
      const inputTokens = Math.ceil(trimmed.length / 4) + 200;
      const outputTokens = JSON.stringify(voiceData).length / 4;
      await trackLLMCost(userId, config.model || 'llama-3.1-8b-instant', inputTokens, outputTokens);
    }
  } catch (err: any) {
    console.error('[WS] Question detection error:', err);
    if (err.status !== 429) {
      sendError(ws, 'Question detection failed');
    }
  }
}

async function streamChatAnswer(connection: ClientConnection, question: string): Promise<void> {
  const { ws, userId, config } = connection;

  try {
    const cacheHit = await lookupVectorCache(question, 'chat');
    if (cacheHit) {
      sendMessage(ws, {
        type: 'question_detected',
        data: { question: cacheHit.question, confidence: 1, type: cacheHit.answer.type || 'chat' },
        timestamp: Date.now(),
      });
      sendMessage(ws, {
        type: 'answer_complete',
        data: {
          sections: cacheHit.answer.sections || [],
          explanation: cacheHit.answer.explanation || '',
          code: cacheHit.answer.code || '',
          codeLanguage: cacheHit.answer.codeLanguage || '',
          spoken: cacheHit.answer.spoken || '',
          bullets: cacheHit.answer.bullets || [],
          type: cacheHit.answer.type || 'concept',
        },
        timestamp: Date.now(),
      });
      connection.transcriptBuffer = connection.transcriptBuffer.slice(-20);
      await recordChatUsage(userId, 1);
      return;
    }

    const groq = getGroq(config.customGroqKey);
    
    const chatSystemPrompt = buildChatSystemPrompt({
      questionType: 'concept',
      difficulty: 'medium',
      resume: config.resume,
      jd: config.jd,
      persona: config.persona,
    });

    const chatModel = config.model || 'llama-3.1-8b-instant';
    
    // Send question detected first
    sendMessage(ws, {
      type: 'question_detected',
      data: { question, confidence: 1.0, type: 'chat' },
      timestamp: Date.now(),
    });

    const stream = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: chatSystemPrompt },
        { role: 'user', content: `Question: ${question}` },
      ],
      model: chatModel,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      stream: true,
    });

    let fullResponse = '';
    let sentExplanation = '';

    for await (const part of stream as any) {
      const delta = part?.choices?.[0]?.delta?.content || '';
      if (!delta) continue;
      
      fullResponse += delta;
      
      // Try to extract explanation for streaming preview
      const explanationMatch = fullResponse.match(/"explanation"\s*:\s*"([^"]*)/);
      if (explanationMatch && explanationMatch[1].length > sentExplanation.length) {
        const newText = explanationMatch[1].slice(sentExplanation.length);
        sentExplanation = explanationMatch[1];
        
        sendMessage(ws, {
          type: 'answer_token',
          data: { token: newText },
          timestamp: Date.now(),
        });
      }
    }

    // Parse final response
    let parsed: any = {};
    try {
      parsed = JSON.parse(fullResponse);
    } catch {
      // Try to extract JSON from response
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {}
      }
    }

    sendMessage(ws, {
      type: 'answer_complete',
      data: {
        sections: parsed.sections || [],
        explanation: parsed.explanation || '',
        code: parsed.code || '',
        codeLanguage: parsed.codeLanguage || '',
        spoken: parsed.spoken || '',
        bullets: parsed.bullets || [],
        type: parsed.type || 'concept',
      },
      timestamp: Date.now(),
    });

    // Clear buffer
    connection.transcriptBuffer = connection.transcriptBuffer.slice(-20);

    // Record usage
    await recordChatUsage(userId, 1);
    if (!config.customGroqKey) {
      const inputTokens = Math.ceil(question.length / 4) + 500;
      const outputTokens = fullResponse.length / 4;
      await trackLLMCost(userId, chatModel, inputTokens, outputTokens);
    }
  } catch (err: any) {
    console.error('[WS] Chat streaming error:', err);
    sendError(ws, err.message || 'Answer generation failed');
  }
}

function handleMessage(connection: ClientConnection, rawData: RawData): void {
  const { ws, userId } = connection;
  
  // Rate limiting
  const now = Date.now();
  if (now - connection.rateLimitWindow > RATE_LIMIT_WINDOW_MS) {
    connection.rateLimitWindow = now;
    connection.messageCount = 0;
  }
  
  connection.messageCount++;
  if (connection.messageCount > RATE_LIMIT_MAX_MESSAGES) {
    sendError(ws, 'Rate limit exceeded', 'rate_limit');
    return;
  }

  connection.lastActivityTime = now;

  try {
    const message: WSMessage = JSON.parse(rawData.toString());

    switch (message.type) {
      case 'ping':
        sendMessage(ws, { type: 'pong', timestamp: Date.now() });
        break;

      case 'pong':
        // Client responded to our ping
        break;

      case 'config':
        const configMsg = message as ConfigMessage;
        if (configMsg.data.model) connection.config.model = configMsg.data.model;
        if (configMsg.data.voiceModel) connection.config.voiceModel = configMsg.data.voiceModel;
        if (configMsg.data.persona) connection.config.persona = configMsg.data.persona;
        if (configMsg.data.mode) connection.config.mode = configMsg.data.mode;
        if (configMsg.data.resume !== undefined) connection.config.resume = configMsg.data.resume;
        if (configMsg.data.jd !== undefined) connection.config.jd = configMsg.data.jd;
        if (configMsg.data.groqApiKey) connection.config.customGroqKey = configMsg.data.groqApiKey;
        
        sendMessage(ws, {
          type: 'status',
          data: { configured: true },
          timestamp: Date.now(),
        });
        break;

      case 'audio_chunk':
        processAudioChunk(connection, message as AudioChunkMessage);
        break;

      case 'ask_question': {
        const q = (message.data as { question?: string })?.question?.trim();
        if (!q) {
          sendError(ws, 'Question text required', 'invalid_question');
          break;
        }
        connection.config.mode = 'chat';
        void streamChatAnswer(connection, q);
        break;
      }

      default:
        sendError(ws, `Unknown message type: ${message.type}`);
    }
  } catch (err: any) {
    console.error('[WS] Message handling error:', err);
    sendError(ws, 'Invalid message format');
  }
}

export function initWebSocketServer(httpServer: HTTPServer): WebSocketServer {
  if (wss) {
    console.log('[WS] WebSocket server already initialized');
    return wss;
  }

  wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws',
  });

  console.log('[WS] WebSocket server initialized on /ws');
  startGroqPrewarm();

  wss.on('connection', async (ws: WebSocket, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    
    if (!token) {
      sendError(ws, 'Authentication required', 'auth_required');
      ws.close(4001, 'Authentication required');
      return;
    }

    // Verify Clerk token
    const authResult = await verifyClerkToken(token);
    if (!authResult) {
      sendError(ws, 'Invalid or expired token', 'auth_invalid');
      ws.close(4001, 'Invalid token');
      return;
    }

    // Load user from database
    let user;
    try {
      const synced = await loadClerkUserForRequest(authResult.userId, req.socket.remoteAddress || '');
      user = await getUserFromDB(synced.userId);
      
      if (!user) {
        sendError(ws, 'User not found', 'user_not_found');
        ws.close(4004, 'User not found');
        return;
      }

      resetMonthlyUsageIfNeeded(user);

      if (user.plan === 'free' && checkTrialExpired(user)) {
        sendError(ws, 'Free trial expired', 'trial_expired');
        ws.close(4002, 'Trial expired');
        return;
      }

      const planTier = user.plan as PlanTier;
      if (!PLAN_LIMITS[planTier]?.features?.realtimeStreaming) {
        sendError(ws, 'Real-time streaming requires a Pro plan or higher', 'plan_upgrade_required');
        ws.close(4003, 'Plan does not support realtime streaming');
        return;
      }
    } catch (err: any) {
      console.error('[WS] User lookup error:', err);
      sendError(ws, 'Authentication failed', 'auth_error');
      ws.close(4001, 'Auth error');
      return;
    }

    const connectionId = `${authResult.userId}-${Date.now()}`;
    
    const connection: ClientConnection = {
      ws,
      userId: user.userId,
      email: user.email,
      plan: user.plan as PlanTier,
      config: {
        model: 'llama-3.1-8b-instant',
        voiceModel: 'whisper-large-v3-turbo',
        persona: 'Technical Interviewer',
        mode: 'voice',
        resume: '',
        jd: '',
      },
      audioBuffer: [],
      lastActivityTime: Date.now(),
      messageCount: 0,
      rateLimitWindow: Date.now(),
      isProcessing: false,
      transcriptBuffer: '',
      speculativeInFlight: false,
      answerGenerationId: 0,
    };

    connections.set(connectionId, connection);
    console.log(`[WS] Client connected: ${connectionId}`);

    // Send connection status
    sendMessage(ws, {
      type: 'status',
      data: {
        connected: true,
        userId: user.userId,
        plan: user.plan,
      },
      timestamp: Date.now(),
    });

    ws.on('message', (data) => handleMessage(connection, data));

    ws.on('close', () => {
      connections.delete(connectionId);
      console.log(`[WS] Client disconnected: ${connectionId}`);
    });

    ws.on('error', (err) => {
      console.error(`[WS] Connection error for ${connectionId}:`, err);
      connections.delete(connectionId);
    });
  });

  // Ping interval to keep connections alive
  setInterval(() => {
    const now = Date.now();
    connections.forEach((conn, id) => {
      if (now - conn.lastActivityTime > CONNECTION_TIMEOUT_MS) {
        console.log(`[WS] Closing inactive connection: ${id}`);
        conn.ws.close(4000, 'Inactivity timeout');
        connections.delete(id);
        return;
      }

      if (conn.ws.readyState === WebSocket.OPEN) {
        sendMessage(conn.ws, { type: 'ping', timestamp: now });
      }
    });
  }, PING_INTERVAL_MS);

  return wss;
}

export function getWebSocketServer(): WebSocketServer | null {
  return wss;
}

export function getActiveConnectionCount(): number {
  return connections.size;
}

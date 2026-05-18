import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { API_ENDPOINT, getAPIUrl } from '../../shared/utils/config';
import { optionalGroqApiKeyHeaders } from '../utils/optionalGroqApiKeyHeaders';
import { useApiAuthHeaders } from '../providers/ApiAuthContext';

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════

export type WSMessageType =
  | 'audio_chunk'
  | 'transcript'
  | 'question_detected'
  | 'answer_token'
  | 'answer_complete'
  | 'ask_question'
  | 'error'
  | 'ping'
  | 'pong'
  | 'config'
  | 'status';

export interface WSMessage {
  type: WSMessageType;
  data?: unknown;
  timestamp: number;
  id?: string;
}

export interface QuestionDetected {
  question: string;
  confidence: number;
  type: string;
}

export interface AnswerData {
  bullets?: string[];
  spoken?: string;
  explanation?: string;
  code?: string;
  codeLanguage?: string;
  sections?: Array<{
    title: string;
    content: string;
    points?: string[];
  }>;
  type?: string;
}

export interface RealtimeConfig {
  model?: string;
  voiceModel?: string;
  persona?: string;
  mode?: 'voice' | 'chat';
  resume?: string;
  jd?: string;
  groqApiKey?: string;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

// ════════════════════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════════════════════

const AUDIO_CHUNK_INTERVAL_MS = 200;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const PING_INTERVAL_MS = 25000;
const PONG_TIMEOUT_MS = 10000;

// ════════════════════════════════════════════════════════════════
// Helper Functions
// ════════════════════════════════════════════════════════════════

function getWebSocketUrl(token: string): string {
  const apiUrl = getAPIUrl() || window.location.origin;
  const protocol = apiUrl.startsWith('https') || window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = apiUrl.replace(/^https?:\/\//, '') || window.location.host;
  return `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;
}

function calculateBackoffDelay(attempt: number): number {
  const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(delay + jitter, MAX_RECONNECT_DELAY_MS);
}

// ════════════════════════════════════════════════════════════════
// Hook
// ════════════════════════════════════════════════════════════════

export interface UseRealtimeAIOptions {
  onTranscript?: (text: string, isPartial: boolean) => void;
  onQuestionDetected?: (question: QuestionDetected) => void;
  onAnswerToken?: (token: string) => void;
  onAnswerComplete?: (answer: AnswerData) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  fallbackToHTTP?: boolean;
}

export function useRealtimeAI(options: UseRealtimeAIOptions = {}) {
  const {
    onTranscript,
    onQuestionDetected,
    onAnswerToken,
    onAnswerComplete,
    onError,
    onStatusChange,
    fallbackToHTTP = true,
  } = options;

  const { getToken, isSignedIn, isLoaded } = useAuth();
  const getAuthHeaders = useApiAuthHeaders();

  // State
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [detectedQuestion, setDetectedQuestion] = useState<QuestionDetected | null>(null);
  const [answer, setAnswer] = useState<AnswerData | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pongTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunkIndexRef = useRef(0);
  const configRef = useRef<RealtimeConfig>({});
  const isConnectingRef = useRef(false);
  const shouldReconnectRef = useRef(true);

  // Cleanup timers
  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (pongTimeoutRef.current) {
      clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = null;
    }
  }, []);

  // Update status
  const updateStatus = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  }, [onStatusChange]);

  // Send message helper
  const sendMessage = useCallback((message: Omit<WSMessage, 'timestamp'>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ ...message, timestamp: Date.now() }));
      return true;
    }
    return false;
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WSMessage = JSON.parse(event.data);

      switch (message.type) {
        case 'ping':
          sendMessage({ type: 'pong' });
          break;

        case 'pong':
          if (pongTimeoutRef.current) {
            clearTimeout(pongTimeoutRef.current);
            pongTimeoutRef.current = null;
          }
          break;

        case 'status':
          const statusData = message.data as { connected?: boolean; configured?: boolean };
          if (statusData.connected) {
            updateStatus('connected');
            reconnectAttemptRef.current = 0;
            // Send initial config
            if (Object.keys(configRef.current).length > 0) {
              sendMessage({ type: 'config', data: configRef.current });
            }
          }
          break;

        case 'transcript':
          const transcriptData = message.data as { text: string; isPartial: boolean };
          if (transcriptData.isPartial) {
            setPartialTranscript(prev => prev + transcriptData.text);
          } else {
            setPartialTranscript('');
          }
          onTranscript?.(transcriptData.text, transcriptData.isPartial);
          break;

        case 'question_detected':
          const questionData = message.data as QuestionDetected;
          setDetectedQuestion(questionData);
          setStreamingAnswer('');
          setIsStreaming(true);
          onQuestionDetected?.(questionData);
          break;

        case 'answer_token':
          const tokenData = message.data as { token: string };
          setStreamingAnswer(prev => prev + tokenData.token);
          onAnswerToken?.(tokenData.token);
          break;

        case 'answer_complete':
          const answerData = message.data as AnswerData;
          setAnswer(answerData);
          setIsStreaming(false);
          onAnswerComplete?.(answerData);
          break;

        case 'error':
          const errorData = message.data as { message: string; code?: string };
          console.error('[WS] Server error:', errorData);
          onError?.(errorData.message);
          
          if (errorData.code === 'quota_exceeded' || errorData.code === 'trial_expired') {
            shouldReconnectRef.current = false;
          }
          break;
      }
    } catch (err) {
      console.error('[WS] Message parse error:', err);
    }
  }, [sendMessage, updateStatus, onTranscript, onQuestionDetected, onAnswerToken, onAnswerComplete, onError]);

  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (!isLoaded) {
      console.log('[WS] Auth not loaded yet');
      return;
    }

    if (!isSignedIn) {
      console.log('[WS] User not signed in, cannot connect');
      updateStatus('error');
      onError?.('Sign in required for real-time features');
      return;
    }

    isConnectingRef.current = true;
    updateStatus('connecting');
    shouldReconnectRef.current = true;

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Failed to get authentication token');
      }

      const wsUrl = getWebSocketUrl(token);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        isConnectingRef.current = false;
        
        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            sendMessage({ type: 'ping' });
            
            // Set pong timeout
            pongTimeoutRef.current = setTimeout(() => {
              console.warn('[WS] Pong timeout, reconnecting...');
              ws.close();
            }, PONG_TIMEOUT_MS);
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = handleMessage;

      ws.onerror = (error) => {
        console.error('[WS] Connection error:', error);
        isConnectingRef.current = false;
      };

      ws.onclose = (event) => {
        console.log('[WS] Disconnected:', event.code, event.reason);
        isConnectingRef.current = false;
        clearTimers();
        wsRef.current = null;

        if (shouldReconnectRef.current && reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = calculateBackoffDelay(reconnectAttemptRef.current);
          reconnectAttemptRef.current++;
          updateStatus('reconnecting');
          console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
          updateStatus('error');
          onError?.('Connection failed after multiple attempts');
        } else {
          updateStatus('disconnected');
        }
      };
    } catch (err: any) {
      console.error('[WS] Connection setup error:', err);
      isConnectingRef.current = false;
      updateStatus('error');
      onError?.(err.message || 'Failed to connect');
    }
  }, [isLoaded, isSignedIn, getToken, handleMessage, sendMessage, clearTimers, updateStatus, onError]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    clearTimers();
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }
    
    updateStatus('disconnected');
    setPartialTranscript('');
    setStreamingAnswer('');
    setDetectedQuestion(null);
    setAnswer(null);
    setIsStreaming(false);
  }, [clearTimers, updateStatus]);

  // Update configuration
  const updateConfig = useCallback((config: RealtimeConfig) => {
    configRef.current = { ...configRef.current, ...config };
    
    // Add Groq API key if stored
    const storedKey = localStorage.getItem('groq_api_key');
    if (storedKey) {
      configRef.current.groqApiKey = storedKey;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sendMessage({ type: 'config', data: configRef.current });
    }
  }, [sendMessage]);

  // Send audio chunk
  const sendAudioChunk = useCallback((audioBase64: string, mimeType: string, isLast = false) => {
    if (status !== 'connected') {
      console.warn('[WS] Cannot send audio: not connected');
      return false;
    }

    const sent = sendMessage({
      type: 'audio_chunk',
      data: {
        audioBase64,
        mimeType,
        chunkIndex: audioChunkIndexRef.current++,
        isLast,
      },
    });

    if (!sent && fallbackToHTTP) {
      console.log('[WS] Falling back to HTTP for audio chunk');
      // HTTP fallback handled by caller
    }

    return sent;
  }, [status, sendMessage, fallbackToHTTP]);

  // Ask question directly (chat mode with streaming)
  const askQuestion = useCallback(async (question: string): Promise<boolean> => {
    if (status === 'connected') {
      setDetectedQuestion({ question, confidence: 1.0, type: 'chat' });
      setStreamingAnswer('');
      setIsStreaming(true);

      sendMessage({
        type: 'config',
        data: { ...configRef.current, mode: 'chat' },
      });

      const sent = sendMessage({
        type: 'ask_question',
        data: { question },
      });

      if (sent) return true;
    }

    if (fallbackToHTTP) {
      try {
        const model = localStorage.getItem('groq_model') || 'llama-3.1-8b-instant';
        const persona = localStorage.getItem('groq_persona') || 'Technical Interviewer';
        const resume = localStorage.getItem('groq_resume') || '';
        const jd = localStorage.getItem('groq_jd') || '';
        const auth = await getAuthHeaders();

        setDetectedQuestion({ question, confidence: 1.0, type: 'chat' });
        setStreamingAnswer('');
        setIsStreaming(true);

        const response = await fetch(API_ENDPOINT('/api/analyze/stream'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-model': model,
            'x-persona': persona,
            'x-mode': 'chat',
            Accept: 'text/event-stream',
            ...optionalGroqApiKeyHeaders(),
            ...auth,
          },
          body: JSON.stringify({ transcript: question, resume, jd }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalData: AnswerData | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const event of events) {
            const dataLine = event.split('\n').find(line => line.startsWith('data: '));
            if (!dataLine) continue;
            
            const payload = JSON.parse(dataLine.slice(6));
            
            if (payload.type === 'preview' && payload.text) {
              setStreamingAnswer(prev => prev + payload.text);
              onAnswerToken?.(payload.text);
            } else if (payload.type === 'final') {
              finalData = payload.data;
            } else if (payload.type === 'error') {
              throw new Error(payload.error);
            }
          }
        }

        if (finalData) {
          setAnswer(finalData);
          setIsStreaming(false);
          onAnswerComplete?.(finalData);
        }

        return true;
      } catch (err: any) {
        console.error('[WS] HTTP fallback error:', err);
        setIsStreaming(false);
        onError?.(err.message || 'Failed to get answer');
        return false;
      }
    }

    return false;
  }, [status, sendMessage, fallbackToHTTP, getAuthHeaders, onAnswerToken, onAnswerComplete, onError]);

  // Reset state
  const reset = useCallback(() => {
    setPartialTranscript('');
    setStreamingAnswer('');
    setDetectedQuestion(null);
    setAnswer(null);
    setIsStreaming(false);
    audioChunkIndexRef.current = 0;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmount');
      }
    };
  }, [clearTimers]);

  return {
    // Connection
    status,
    connect,
    disconnect,
    isConnected: status === 'connected',
    
    // Configuration
    updateConfig,
    
    // Audio streaming
    sendAudioChunk,
    
    // Chat
    askQuestion,
    
    // State
    partialTranscript,
    streamingAnswer,
    detectedQuestion,
    answer,
    isStreaming,
    
    // Utils
    reset,
  };
}

// ════════════════════════════════════════════════════════════════
// Audio Streaming Helper Hook
// ════════════════════════════════════════════════════════════════

export interface UseAudioStreamingOptions {
  onChunk?: (base64: string, mimeType: string) => void;
  chunkIntervalMs?: number;
}

export function useAudioStreaming(options: UseAudioStreamingOptions = {}) {
  const { onChunk, chunkIntervalMs = AUDIO_CHUNK_INTERVAL_MS } = options;

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus' };
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/webm' };
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options = { mimeType: 'audio/mp4' };
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          const reader = new FileReader();
          reader.readAsDataURL(e.data);
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            onChunk?.(base64, recorder.mimeType);
          };
        }
      };

      recorder.start();
      setIsRecording(true);

      // Chunk every interval
      chunkTimerRef.current = setInterval(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
          recorder.start();
        }
      }, chunkIntervalMs);
    } catch (err) {
      console.error('[Audio] Failed to start recording:', err);
      throw err;
    }
  }, [onChunk, chunkIntervalMs]);

  const stopRecording = useCallback(() => {
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    isRecording,
    startRecording,
    stopRecording,
  };
}

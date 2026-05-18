/**
 * Hook for local ML-based question classification
 * Uses Web Worker to avoid blocking main thread
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface ClassificationResult {
  isQuestion: boolean;
  type: string;
  confidence: number;
  typeConfidence?: number;
  method: string;
  error?: string;
}

export type ModelState = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';

interface PendingRequest {
  resolve: (result: ClassificationResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

// Regex patterns for fallback classification
const QUESTION_WORD_PATTERN = /^(what|how|why|when|where|who|which|can|could|would|should|do|does|did|is|are|was|were|will|have|has|had|tell|explain|describe)\b/i;
const QUESTION_MARK_PATTERN = /\?$/;

/**
 * Fallback regex-based classification when Web Worker is unavailable
 */
function regexClassify(text: string): ClassificationResult {
  const trimmed = text.trim();
  const hasQuestionMark = QUESTION_MARK_PATTERN.test(trimmed);
  const hasQuestionWord = QUESTION_WORD_PATTERN.test(trimmed);
  const isQuestion = hasQuestionMark || hasQuestionWord;

  return {
    isQuestion,
    type: isQuestion ? 'general' : 'statement',
    confidence: isQuestion ? (hasQuestionMark ? 0.8 : 0.65) : 0.7,
    method: 'regex_fallback',
  };
}

/**
 * Check if Web Workers are supported
 */
function isWebWorkerSupported(): boolean {
  return typeof Worker !== 'undefined';
}

export function useLocalClassifier() {
  const [modelState, setModelState] = useState<ModelState>('idle');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map());
  const requestIdCounterRef = useRef(0);

  // Initialize worker on mount
  useEffect(() => {
    if (!isWebWorkerSupported()) {
      setModelState('unsupported');
      setError('Web Workers not supported in this browser');
      return;
    }

    try {
      // Create worker using Vite's worker import syntax
      workerRef.current = new Worker(
        new URL('../workers/questionClassifier.ts', import.meta.url),
        { type: 'module' }
      );

      // Handle messages from worker
      workerRef.current.onmessage = (event: MessageEvent) => {
        const { type, requestId, result, state, error: workerError, progress, file } = event.data;

        switch (type) {
          case 'model_ready':
            setModelState('ready');
            setLoadingProgress(100);
            break;

          case 'model_error':
            setModelState('error');
            setError(workerError || 'Failed to load model');
            break;

          case 'loading_progress':
            setModelState('loading');
            setLoadingProgress(progress || 0);
            break;

          case 'classification_result':
            if (requestId) {
              const pending = pendingRequestsRef.current.get(requestId);
              if (pending) {
                clearTimeout(pending.timeout);
                pendingRequestsRef.current.delete(requestId);
                pending.resolve(result);
              }
            }
            break;

          case 'status':
            if (state) {
              setModelState(state as ModelState);
            }
            if (workerError) {
              setError(workerError);
            }
            break;
        }
      };

      // Handle worker errors
      workerRef.current.onerror = (event) => {
        console.error('Worker error:', event);
        setModelState('error');
        setError(event.message || 'Worker error');
      };

      // Initialize the model
      setModelState('loading');
      workerRef.current.postMessage({ type: 'init' });
    } catch (err) {
      console.error('Failed to create worker:', err);
      setModelState('error');
      setError(err instanceof Error ? err.message : 'Failed to create worker');
    }

    // Cleanup on unmount
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      // Clear any pending requests
      for (const [, pending] of pendingRequestsRef.current) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Worker terminated'));
      }
      pendingRequestsRef.current.clear();
    };
  }, []);

  /**
   * Classify text using ML model (or fallback to regex)
   * Returns classification result with isQuestion, type, and confidence
   */
  const classify = useCallback(
    async (text: string): Promise<ClassificationResult> => {
      // If text is too short or empty, return non-question
      if (!text || text.trim().length < 5) {
        return {
          isQuestion: false,
          type: 'invalid',
          confidence: 0,
          method: 'too_short',
        };
      }

      // Use regex fallback if worker is not ready
      if (
        modelState === 'unsupported' ||
        modelState === 'error' ||
        !workerRef.current
      ) {
        return regexClassify(text);
      }

      // If model is still loading, use regex for now
      if (modelState === 'loading' || modelState === 'idle') {
        return regexClassify(text);
      }

      // Generate unique request ID
      const requestId = `req_${Date.now()}_${++requestIdCounterRef.current}`;

      return new Promise((resolve, reject) => {
        // Set timeout for request (5 seconds)
        const timeout = setTimeout(() => {
          pendingRequestsRef.current.delete(requestId);
          // Fall back to regex on timeout
          console.warn('Classification timeout, falling back to regex');
          resolve(regexClassify(text));
        }, 5000);

        // Store pending request
        pendingRequestsRef.current.set(requestId, { resolve, reject, timeout });

        // Send classification request to worker
        workerRef.current!.postMessage({
          type: 'classify',
          text,
          requestId,
        });
      });
    },
    [modelState]
  );

  /**
   * Check if the classifier is ready for fast ML classification
   */
  const isReady = modelState === 'ready';

  /**
   * Check if classification will use fallback (regex)
   */
  const usesFallback = modelState !== 'ready';

  /**
   * Reinitialize the model (e.g., after error)
   */
  const reinitialize = useCallback(() => {
    if (workerRef.current && modelState === 'error') {
      setModelState('loading');
      setError(null);
      setLoadingProgress(0);
      workerRef.current.postMessage({ type: 'init' });
    }
  }, [modelState]);

  return {
    classify,
    modelState,
    loadingProgress,
    error,
    isReady,
    usesFallback,
    reinitialize,
  };
}

export default useLocalClassifier;

/**
 * Question Classifier Web Worker
 * Uses @xenova/transformers for client-side ML inference
 * Classifies text as question vs statement, and question type
 */

/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import { pipeline, env, type Pipeline } from '@xenova/transformers';

// Configure transformers.js for browser environment
env.allowLocalModels = false;
env.useBrowserCache = true;

// Model state
let classifier: Pipeline | null = null;
let embeddingPipeline: Pipeline | null = null;
let modelState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
let loadError: string | null = null;

// Pre-computed embeddings for question type classification (computed on first use)
let questionTypeEmbeddings: Map<string, Float32Array> | null = null;

// Question type exemplars for similarity-based classification
const QUESTION_TYPE_EXEMPLARS = {
  technical: [
    'What is the time complexity of quicksort?',
    'How does garbage collection work in JavaScript?',
    'Explain the difference between REST and GraphQL',
    'What are the SOLID principles?',
    'How do you implement a binary search tree?',
    'What is the difference between TCP and UDP?',
    'How does React reconciliation work?',
  ],
  behavioral: [
    'Tell me about a time you faced a challenge',
    'How do you handle conflict with coworkers?',
    'Describe your greatest achievement',
    'What is your biggest weakness?',
    'Why do you want to work here?',
    'How do you prioritize tasks?',
    'Tell me about yourself',
  ],
  clarification: [
    'Could you repeat that please?',
    'What do you mean by that?',
    'Can you give me an example?',
    'Could you explain that in more detail?',
    'Did you say something about the database?',
    'I did not catch that, could you clarify?',
    'Are you asking about the frontend or backend?',
  ],
  followup: [
    'And what happened after that?',
    'Can you elaborate on that point?',
    'How did that affect the outcome?',
    'What would you do differently next time?',
    'Is there anything else you would add?',
    'Did that solve the problem?',
    'What was the result of that approach?',
  ],
};

// Patterns for quick regex-based question detection (fallback)
const QUESTION_PATTERNS = /^(what|how|why|when|where|who|which|can|could|would|should|do|does|did|is|are|was|were|will|have|has|had|tell|explain|describe)\b|\?$/i;

/**
 * Initialize the ML model
 * Uses a small, quantized model for fast inference
 */
async function initializeModel(): Promise<void> {
  if (modelState === 'loading' || modelState === 'ready') return;

  modelState = 'loading';
  loadError = null;

  try {
    // Load zero-shot classification pipeline
    // Using a quantized model for smaller size (~44MB) and faster inference
    classifier = await pipeline(
      'zero-shot-classification',
      'Xenova/nli-deberta-v3-xsmall',
      {
        quantized: true,
        progress_callback: (progress: any) => {
          if (progress.status === 'progress') {
            self.postMessage({
              type: 'loading_progress',
              progress: Math.round(progress.progress || 0),
              file: progress.file || '',
            });
          }
        },
      }
    );

    // Load embedding pipeline for question type classification
    embeddingPipeline = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      {
        quantized: true,
        progress_callback: (progress: any) => {
          if (progress.status === 'progress') {
            self.postMessage({
              type: 'loading_progress',
              progress: Math.round(progress.progress || 0),
              file: progress.file || '',
            });
          }
        },
      }
    );

    // Pre-compute embeddings for question type exemplars
    await precomputeTypeEmbeddings();

    modelState = 'ready';
    self.postMessage({ type: 'model_ready' });
  } catch (error) {
    modelState = 'error';
    loadError = error instanceof Error ? error.message : 'Unknown error loading model';
    self.postMessage({ type: 'model_error', error: loadError });
  }
}

/**
 * Pre-compute embeddings for question type classification
 */
async function precomputeTypeEmbeddings(): Promise<void> {
  if (!embeddingPipeline) return;

  questionTypeEmbeddings = new Map();

  for (const [type, exemplars] of Object.entries(QUESTION_TYPE_EXEMPLARS)) {
    const embeddings: Float32Array[] = [];
    for (const exemplar of exemplars) {
      const output = await embeddingPipeline(exemplar, { pooling: 'mean', normalize: true });
      embeddings.push(new Float32Array(output.data));
    }
    // Average the embeddings for this type
    const avgEmbedding = averageEmbeddings(embeddings);
    questionTypeEmbeddings.set(type, avgEmbedding);
  }
}

/**
 * Average multiple embeddings into one
 */
function averageEmbeddings(embeddings: Float32Array[]): Float32Array {
  if (embeddings.length === 0) return new Float32Array(0);
  const size = embeddings[0].length;
  const result = new Float32Array(size);
  for (const embedding of embeddings) {
    for (let i = 0; i < size; i++) {
      result[i] += embedding[i];
    }
  }
  for (let i = 0; i < size; i++) {
    result[i] /= embeddings.length;
  }
  return result;
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Classify the type of question using embedding similarity
 */
async function classifyQuestionType(text: string): Promise<{ type: string; confidence: number }> {
  if (!embeddingPipeline || !questionTypeEmbeddings) {
    return { type: 'general', confidence: 0.5 };
  }

  try {
    const output = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
    const textEmbedding = new Float32Array(output.data);

    let bestType = 'general';
    let bestSimilarity = 0;

    for (const [type, typeEmbedding] of questionTypeEmbeddings.entries()) {
      const similarity = cosineSimilarity(textEmbedding, typeEmbedding);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestType = type;
      }
    }

    // If similarity is too low, classify as general
    if (bestSimilarity < 0.3) {
      return { type: 'general', confidence: bestSimilarity };
    }

    return { type: bestType, confidence: bestSimilarity };
  } catch (error) {
    console.error('Error classifying question type:', error);
    return { type: 'general', confidence: 0.5 };
  }
}

/**
 * Classify text as question or statement
 */
async function classifyText(
  text: string,
  requestId: string
): Promise<void> {
  const trimmedText = text.trim();

  // Quick regex check for obvious cases
  const hasQuestionMark = trimmedText.endsWith('?');
  const looksLikeQuestion = QUESTION_PATTERNS.test(trimmedText);

  // If model isn't ready, use regex fallback
  if (modelState !== 'ready' || !classifier) {
    const isQuestion = hasQuestionMark || looksLikeQuestion;
    self.postMessage({
      type: 'classification_result',
      requestId,
      result: {
        isQuestion,
        type: isQuestion ? 'general' : 'statement',
        confidence: isQuestion ? 0.6 : 0.4,
        method: 'regex_fallback',
      },
    });
    return;
  }

  try {
    // Use zero-shot classification
    const result = await classifier(trimmedText, ['question', 'statement'], {
      multi_label: false,
    });

    const isQuestion = result.labels[0] === 'question';
    const confidence = result.scores[0];

    // If it's a question, also classify the type
    let questionType = 'general';
    let typeConfidence = 0.5;

    if (isQuestion && confidence > 0.5) {
      const typeResult = await classifyQuestionType(trimmedText);
      questionType = typeResult.type;
      typeConfidence = typeResult.confidence;
    }

    self.postMessage({
      type: 'classification_result',
      requestId,
      result: {
        isQuestion,
        type: isQuestion ? questionType : 'statement',
        confidence: isQuestion ? confidence : 1 - confidence,
        typeConfidence,
        method: 'ml',
      },
    });
  } catch (error) {
    // Fall back to regex on error
    const isQuestion = hasQuestionMark || looksLikeQuestion;
    self.postMessage({
      type: 'classification_result',
      requestId,
      result: {
        isQuestion,
        type: isQuestion ? 'general' : 'statement',
        confidence: isQuestion ? 0.6 : 0.4,
        method: 'regex_fallback_error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

// Message handler
self.onmessage = async (event: MessageEvent) => {
  const { type, text, requestId } = event.data;

  switch (type) {
    case 'init':
      await initializeModel();
      break;

    case 'classify':
      if (!text || typeof text !== 'string') {
        self.postMessage({
          type: 'classification_result',
          requestId,
          result: {
            isQuestion: false,
            type: 'invalid',
            confidence: 0,
            method: 'error',
            error: 'Invalid input text',
          },
        });
        return;
      }
      await classifyText(text, requestId);
      break;

    case 'status':
      self.postMessage({
        type: 'status',
        state: modelState,
        error: loadError,
      });
      break;

    default:
      console.warn('Unknown message type:', type);
  }
};

// Export for type checking (not used at runtime in worker)
export type ClassificationResult = {
  isQuestion: boolean;
  type: string;
  confidence: number;
  typeConfidence?: number;
  method: string;
  error?: string;
};

export type WorkerMessage =
  | { type: 'init' }
  | { type: 'classify'; text: string; requestId: string }
  | { type: 'status' };

export type WorkerResponse =
  | { type: 'model_ready' }
  | { type: 'model_error'; error: string }
  | { type: 'loading_progress'; progress: number; file: string }
  | { type: 'classification_result'; requestId: string; result: ClassificationResult }
  | { type: 'status'; state: string; error: string | null };

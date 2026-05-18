export type PlanTier = 'free' | 'basic' | 'pro' | 'enterprise';

export interface PlanConfig {
  name: string;
  price: number | null;
  priceINR: number | null;
  currency: string;
  billingPeriod: 'one-time' | 'month' | 'year';
  /** Optional trial window for free tier (SaaS). */
  trialDays?: number;
  voiceMinutesPerMonth: number;
  chatMessagesPerMonth: number;
  sessionsPerMonth: number;
  sessionDurationMinutes: number;
  maxApiSpendUSD: number;
  features: Record<string, boolean>;
  notes: string;
}

/**
 * Groq API Pricing (as of 2024):
 * - Whisper Large V3 Turbo: $0.04 per audio hour ($0.000667/min)
 * - Llama 3.1 8B: $0.05/M input, $0.08/M output tokens
 * - Llama 3.3 70B: $0.59/M input, $0.79/M output tokens
 * 
 * Cost estimates per 30-min session:
 * - Transcription: ~$0.02 (30 min audio)
 * - LLM calls: ~$0.05-0.15 (depending on model and usage)
 * - Total: ~$0.10-0.20 per session
 * 
 * With $2 cap, users get 10-20 sessions worth of API calls
 */
export const GROQ_PRICING = {
  whisperLargeV3Turbo: {
    perAudioMinute: 0.000667,
  },
  llama31_8b: {
    inputPerMillion: 0.05,
    outputPerMillion: 0.08,
  },
  llama33_70b: {
    inputPerMillion: 0.59,
    outputPerMillion: 0.79,
  },
} as const;

export const PLAN_LIMITS: Record<PlanTier, PlanConfig> = {
  free: {
    name: 'Free (BYOK)',
    price: 0,
    priceINR: 0,
    currency: 'INR',
    billingPeriod: 'one-time',
    trialDays: 3,
    // One-time lifetime quota (enforced server-side in effectiveQuotaLimits()).
    voiceMinutesPerMonth: 15,
    chatMessagesPerMonth: 10,
    sessionsPerMonth: 99999,
    sessionDurationMinutes: 10,
    maxApiSpendUSD: 0.50,
    features: {
      textToSpeech: false,
      sessionExport: false,
      customPersonas: false,
      cacheGeneration: false,
      advancedAnalytics: false,
      realtimeStreaming: false,
    },
    notes: 'Bring your own Groq key. One-time free quota; 3-day trial window. Upgrade for higher recurring limits.',
  },

  basic: {
    name: 'Basic',
    price: 3.50,
    priceINR: 299,
    currency: 'INR',
    billingPeriod: 'month',
    voiceMinutesPerMonth: 90,
    chatMessagesPerMonth: 150,
    sessionsPerMonth: 3,
    sessionDurationMinutes: 30,
    maxApiSpendUSD: 2.00,
    features: {
      textToSpeech: true,
      sessionExport: false,
      customPersonas: false,
      cacheGeneration: true,
      advancedAnalytics: false,
      realtimeStreaming: false,
    },
    notes: '3 interview sessions of 30 min each',
  },

  pro: {
    name: 'Professional',
    price: 6.00,
    priceINR: 499,
    currency: 'INR',
    billingPeriod: 'month',
    voiceMinutesPerMonth: 160,
    chatMessagesPerMonth: 300,
    sessionsPerMonth: 4,
    sessionDurationMinutes: 40,
    maxApiSpendUSD: 2.00,
    features: {
      textToSpeech: true,
      sessionExport: true,
      customPersonas: true,
      cacheGeneration: true,
      advancedAnalytics: true,
      realtimeStreaming: true,
    },
    notes: '4 interview sessions of 40 min each',
  },

  enterprise: {
    name: 'Enterprise',
    price: null,
    priceINR: null,
    currency: 'INR',
    billingPeriod: 'year',
    voiceMinutesPerMonth: 99999,
    chatMessagesPerMonth: 99999,
    sessionsPerMonth: 99999,
    sessionDurationMinutes: 120,
    maxApiSpendUSD: 50.00,
    features: {
      textToSpeech: true,
      sessionExport: true,
      customPersonas: true,
      cacheGeneration: true,
      advancedAnalytics: true,
      realtimeStreaming: true,
    },
    notes: 'Custom terms, dedicated support',
  },
};

/**
 * Calculate estimated API cost for a transcription request
 */
export function estimateTranscriptionCost(audioMinutes: number): number {
  return audioMinutes * GROQ_PRICING.whisperLargeV3Turbo.perAudioMinute;
}

/**
 * Calculate estimated API cost for LLM completion
 */
export function estimateLLMCost(
  model: 'llama31_8b' | 'llama33_70b',
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = GROQ_PRICING[model];
  return (inputTokens / 1_000_000) * pricing.inputPerMillion +
         (outputTokens / 1_000_000) * pricing.outputPerMillion;
}

/**
 * Check if user has remaining API budget
 */
export function hasApiSpendingBudget(
  currentSpendUSD: number,
  plan: PlanTier
): boolean {
  return currentSpendUSD < PLAN_LIMITS[plan].maxApiSpendUSD;
}

/**
 * Get remaining API budget for a user
 */
export function getRemainingApiBudget(
  currentSpendUSD: number,
  plan: PlanTier
): number {
  return Math.max(0, PLAN_LIMITS[plan].maxApiSpendUSD - currentSpendUSD);
}

/** WebSocket streaming copilot (200ms audio chunks, token streaming). */
export function hasRealtimeStreaming(plan: PlanTier): boolean {
  return !!PLAN_LIMITS[plan].features.realtimeStreaming;
}
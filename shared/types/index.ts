import type { PlanTier } from '../constants/planLimits';

export interface UserRecord {
  userId: string;
  email: string;
  plan: PlanTier;
  trialsUsed: boolean;
  trialStartDate?: number;
  subscriptionStatus: 'active' | 'expired' | 'cancelled' | 'trial';

  currentMonth: string;
  voiceMinutesUsed: number;
  chatMessagesUsed: number;
  sessionsUsed: number;

  activeSessions: string[];
  sessionHistory: SessionRecord[];

  createdAt: number;
  lastActiveAt: number;
  stripeCustomerId?: string;

  displayName?: string;
  avatarUrl?: string;
  timezone?: string;
  deletedAt?: number;
}

export interface SessionRecord {
  sessionId: string;
  startTime: number;
  endTime?: number;
  questionsAsked: number;
  voiceMinutesUsed: number;
  status: 'active' | 'completed' | 'abandoned';
}

export interface AuthRequest extends Express.Request {
  user?: {
    userId: string;
    email: string;
    plan: PlanTier;
    isAdmin?: boolean;
  };
}

export interface QuotaExceededError {
  error: string;
  quotaUsed: number;
  quotaLimit: number;
  message: string;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripePriceId: string;
  plan: PlanTier;
  status: 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing';
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  canceledAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  stripePaymentIntentId: string;
  stripeInvoiceId?: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'pending' | 'failed' | 'refunded';
  description?: string;
  createdAt: number;
}

export interface UserPreferences {
  userId: string;
  theme: 'light' | 'dark' | 'system';
  emailNotifications: boolean;
  usageAlerts: boolean;
  weeklyDigest: boolean;
  defaultPersona: string;
  defaultVoiceModel: string;
  defaultChatModel: string;
  language: string;
  createdAt: number;
  updatedAt: number;
}

export interface FeatureFlag {
  id: string;
  userId: string;
  featureName: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
  expiresAt?: number;
  createdAt: number;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: number;
}

export interface ApiKeyRecord {
  id: string;
  userId: string;
  provider: 'groq' | 'openai' | 'anthropic' | 'google';
  keyPrefix: string;
  encryptedKey: string;
  label?: string;
  isActive: boolean;
  lastUsedAt?: number;
  createdAt: number;
}

export interface UsageDailyRecord {
  id: string;
  userId: string;
  date: string;
  voiceMinutes: number;
  chatMessages: number;
  sessions: number;
  cacheHits: number;
  apiCalls: number;
}

export interface AdminStats {
  totalUsers: number;
  activeUsersToday: number;
  activeUsersWeek: number;
  totalSessions: number;
  totalVoiceMinutes: number;
  totalChatMessages: number;
  revenueThisMonth: number;
  subscriptionsByPlan: Record<PlanTier, number>;
  newUsersToday: number;
  newUsersWeek: number;
}

export interface WebhookEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  processedAt?: number;
  status: 'pending' | 'processed' | 'failed';
  error?: string;
  createdAt: number;
}
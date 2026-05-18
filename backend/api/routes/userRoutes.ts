import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../../../shared/types';
import { PLAN_LIMITS, PlanTier } from '../../../shared/constants/planLimits';
import {
  getUserFromDB,
  createUserInDB,
  resetMonthlyUsageIfNeeded,
  checkTrialExpired,
  calculateTrialDaysRemaining,
  getRemainingQuota,
  getUserSessionHistory,
  getActiveSessionsForUser,
  closeSession,
} from '../../storage/usageStorage';
import { getPool, isDBConnected } from '../../services/database';

const router = Router();

// ════════════════════════════════════════════════════════════════
// VALIDATION SCHEMAS
// ════════════════════════════════════════════════════════════════

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional().nullable(),
  preferences: z.object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    language: z.string().max(10).optional(),
    notifications: z.boolean().optional(),
    emailDigest: z.enum(['daily', 'weekly', 'never']).optional(),
  }).optional(),
});

const UpdateSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.string().max(10).optional(),
  notifications: z.object({
    email: z.boolean().optional(),
    push: z.boolean().optional(),
    sms: z.boolean().optional(),
  }).optional(),
  privacy: z.object({
    shareUsageData: z.boolean().optional(),
    publicProfile: z.boolean().optional(),
  }).optional(),
  interview: z.object({
    defaultPersona: z.string().max(100).optional(),
    defaultVoiceModel: z.string().max(50).optional(),
    autoTranscribe: z.boolean().optional(),
  }).optional(),
});

const AddApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(['groq', 'openai', 'anthropic', 'google']),
  apiKey: z.string().min(10).max(500),
});

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════

type ValidationResult<T> = { success: true; data: T } | { success: false; error: string };

function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    return { success: false, error: errors };
  }
  return { success: true, data: result.data };
}

function maskApiKey(key: string): string {
  if (key.length < 12) return '****';
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

// ════════════════════════════════════════════════════════════════
// USER PROFILE ENDPOINTS
// ════════════════════════════════════════════════════════════════

// GET /api/user/profile - Get current user's full profile
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let user = await getUserFromDB(authReq.user.userId);
    if (!user) {
      user = await createUserInDB(authReq.user.userId, authReq.user.email || '');
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    resetMonthlyUsageIfNeeded(user);
    const planConfig = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.free;

    // Fetch additional profile data from DB if available
    let profileData: Record<string, unknown> = {};
    if (isDBConnected()) {
      const pool = getPool()!;
      const { rows } = await pool.query(
        `SELECT display_name, avatar_url, preferences, created_at, updated_at
         FROM ig_users WHERE clerk_user_id = $1`,
        [authReq.user.userId]
      );
      if (rows.length > 0) {
        profileData = {
          displayName: rows[0].display_name,
          avatarUrl: rows[0].avatar_url,
          preferences: rows[0].preferences || {},
          createdAt: rows[0].created_at,
          updatedAt: rows[0].updated_at,
        };
      }
    }

    res.json({
      userId: user.userId,
      email: user.email,
      displayName: profileData.displayName || null,
      avatarUrl: profileData.avatarUrl || null,
      preferences: profileData.preferences || {},
      plan: {
        tier: user.plan,
        name: planConfig.name,
        status: user.subscriptionStatus,
      },
      usage: {
        voiceMinutesUsed: user.voiceMinutesUsed,
        chatMessagesUsed: user.chatMessagesUsed,
        sessionsUsed: user.sessionsUsed,
        currentMonth: user.currentMonth,
      },
      limits: {
        voiceMinutesPerMonth: planConfig.voiceMinutesPerMonth,
        chatMessagesPerMonth: planConfig.chatMessagesPerMonth,
        sessionsPerMonth: planConfig.sessionsPerMonth,
      },
      features: planConfig.features,
      trialInfo: user.plan === 'free' ? {
        daysRemaining: calculateTrialDaysRemaining(user),
        expired: checkTrialExpired(user),
        startDate: user.trialStartDate,
      } : null,
      createdAt: profileData.createdAt || user.createdAt,
      lastActiveAt: user.lastActiveAt,
    });
  } catch (error: any) {
    console.error('[user/profile] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PATCH /api/user/profile - Update profile
router.patch('/profile', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validation = validateRequest(UpdateProfileSchema, req.body);
    if (validation.success === false) {
      return res.status(400).json({ error: validation.error });
    }

    const { displayName, avatarUrl, preferences } = validation.data;

    if (!isDBConnected()) {
      return res.status(503).json({ 
        error: 'Profile updates require database connection',
        code: 'db_required' 
      });
    }

    const pool = getPool()!;
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (displayName !== undefined) {
      updates.push(`display_name = $${paramCount++}`);
      values.push(displayName);
    }
    if (avatarUrl !== undefined) {
      updates.push(`avatar_url = $${paramCount++}`);
      values.push(avatarUrl);
    }
    if (preferences !== undefined) {
      updates.push(`preferences = COALESCE(preferences, '{}'::jsonb) || $${paramCount++}::jsonb`);
      values.push(JSON.stringify(preferences));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(authReq.user.userId);

    await pool.query(
      `UPDATE ig_users SET ${updates.join(', ')} WHERE clerk_user_id = $${paramCount}`,
      values
    );

    res.json({ message: 'Profile updated successfully' });
  } catch (error: any) {
    console.error('[user/profile PATCH] Error:', error.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /api/user/settings - Get user settings
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const defaultSettings = {
      theme: 'system',
      language: 'en',
      notifications: {
        email: true,
        push: false,
        sms: false,
      },
      privacy: {
        shareUsageData: false,
        publicProfile: false,
      },
      interview: {
        defaultPersona: 'Technical Interviewer',
        defaultVoiceModel: 'whisper-large-v3-turbo',
        autoTranscribe: true,
      },
    };

    if (!isDBConnected()) {
      return res.json({ settings: defaultSettings });
    }

    const pool = getPool()!;
    const { rows } = await pool.query(
      `SELECT settings FROM ig_users WHERE clerk_user_id = $1`,
      [authReq.user.userId]
    );

    const dbSettings = rows[0]?.settings || {};
    const mergedSettings = {
      ...defaultSettings,
      ...dbSettings,
      notifications: { ...defaultSettings.notifications, ...dbSettings.notifications },
      privacy: { ...defaultSettings.privacy, ...dbSettings.privacy },
      interview: { ...defaultSettings.interview, ...dbSettings.interview },
    };

    res.json({ settings: mergedSettings });
  } catch (error: any) {
    console.error('[user/settings] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/user/settings - Update settings
router.put('/settings', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validation = validateRequest(UpdateSettingsSchema, req.body);
    if (validation.success === false) {
      return res.status(400).json({ error: validation.error });
    }

    if (!isDBConnected()) {
      return res.status(503).json({ 
        error: 'Settings updates require database connection',
        code: 'db_required' 
      });
    }

    const pool = getPool()!;
    await pool.query(
      `UPDATE ig_users SET 
        settings = COALESCE(settings, '{}'::jsonb) || $2::jsonb,
        updated_at = NOW()
       WHERE clerk_user_id = $1`,
      [authReq.user.userId, JSON.stringify(validation.data)]
    );

    res.json({ message: 'Settings updated successfully' });
  } catch (error: any) {
    console.error('[user/settings PUT] Error:', error.message);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ════════════════════════════════════════════════════════════════
// USAGE & BILLING ENDPOINTS
// ════════════════════════════════════════════════════════════════

// GET /api/user/usage - Get detailed usage stats
router.get('/usage', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let user = await getUserFromDB(authReq.user.userId);
    if (!user) {
      user = await createUserInDB(authReq.user.userId, authReq.user.email || '');
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    resetMonthlyUsageIfNeeded(user);
    const planConfig = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.free;

    const pct = (used: number, limit: number) =>
      !limit || limit <= 0 ? 0 : Math.round((used / limit) * 100 * 10) / 10;

    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    });

    res.json({
      currentMonth: user.currentMonth,
      quotas: {
        voice: {
          used: user.voiceMinutesUsed,
          limit: planConfig.voiceMinutesPerMonth,
          remaining: await getRemainingQuota(authReq.user.userId, 'voice'),
          percentUsed: pct(user.voiceMinutesUsed, planConfig.voiceMinutesPerMonth),
          unit: 'minutes',
        },
        chat: {
          used: user.chatMessagesUsed,
          limit: planConfig.chatMessagesPerMonth,
          remaining: await getRemainingQuota(authReq.user.userId, 'chat'),
          percentUsed: pct(user.chatMessagesUsed, planConfig.chatMessagesPerMonth),
          unit: 'messages',
        },
        sessions: {
          used: user.sessionsUsed,
          limit: planConfig.sessionsPerMonth,
          remaining: await getRemainingQuota(authReq.user.userId, 'session'),
          percentUsed: pct(user.sessionsUsed, planConfig.sessionsPerMonth),
          unit: 'sessions',
        },
      },
      plan: user.plan,
      resetDate: getNextBillingDate(user.currentMonth),
    });
  } catch (error: any) {
    console.error('[user/usage] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch usage data' });
  }
});

// GET /api/user/usage/history - Get usage history (last 30 days)
router.get('/usage/history', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isDBConnected()) {
      return res.json({
        history: [],
        message: 'Usage history requires database connection',
      });
    }

    const pool = getPool()!;
    const { rows } = await pool.query(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) FILTER (WHERE type = 'voice') as voice_calls,
        COUNT(*) FILTER (WHERE type = 'chat') as chat_messages,
        COUNT(*) FILTER (WHERE type = 'session') as sessions,
        SUM(CASE WHEN type = 'voice' THEN amount ELSE 0 END) as voice_minutes
       FROM ig_usage_logs
       WHERE clerk_user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [authReq.user.userId]
    );

    res.json({
      history: rows.map(r => ({
        date: r.date,
        voiceCalls: parseInt(r.voice_calls) || 0,
        chatMessages: parseInt(r.chat_messages) || 0,
        sessions: parseInt(r.sessions) || 0,
        voiceMinutes: parseInt(r.voice_minutes) || 0,
      })),
      period: '30 days',
    });
  } catch (error: any) {
    console.error('[user/usage/history] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch usage history' });
  }
});

// GET /api/user/plan - Get current plan details
router.get('/plan', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await getUserFromDB(authReq.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const planConfig = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS.free;

    res.json({
      current: {
        tier: user.plan,
        name: planConfig.name,
        price: planConfig.price,
        currency: planConfig.currency,
        billingPeriod: planConfig.billingPeriod,
        status: user.subscriptionStatus,
      },
      limits: {
        voiceMinutesPerMonth: planConfig.voiceMinutesPerMonth,
        chatMessagesPerMonth: planConfig.chatMessagesPerMonth,
        sessionsPerMonth: planConfig.sessionsPerMonth,
      },
      features: planConfig.features,
      notes: planConfig.notes,
      trial: user.plan === 'free' ? {
        daysRemaining: calculateTrialDaysRemaining(user),
        expired: checkTrialExpired(user),
        trialDays: planConfig.trialDays || 7,
      } : null,
      availablePlans: Object.entries(PLAN_LIMITS).map(([tier, config]) => ({
        tier,
        name: config.name,
        price: config.price,
        currency: config.currency,
        billingPeriod: config.billingPeriod,
        features: config.features,
      })),
    });
  } catch (error: any) {
    console.error('[user/plan] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch plan details' });
  }
});

// GET /api/user/billing - Get billing info (Stripe customer)
router.get('/billing', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await getUserFromDB(authReq.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Fetch Stripe customer info if available
    let billingInfo: Record<string, unknown> = {
      hasPaymentMethod: false,
      paymentMethods: [],
      billingAddress: null,
    };

    if (isDBConnected() && user.stripeCustomerId) {
      const pool = getPool()!;
      const { rows } = await pool.query(
        `SELECT stripe_customer_id, billing_email, billing_address, payment_method_last4, payment_method_brand
         FROM ig_users WHERE clerk_user_id = $1`,
        [authReq.user.userId]
      );
      if (rows.length > 0) {
        billingInfo = {
          stripeCustomerId: rows[0].stripe_customer_id,
          billingEmail: rows[0].billing_email || user.email,
          billingAddress: rows[0].billing_address,
          hasPaymentMethod: !!rows[0].payment_method_last4,
          paymentMethod: rows[0].payment_method_last4 ? {
            last4: rows[0].payment_method_last4,
            brand: rows[0].payment_method_brand,
          } : null,
        };
      }
    }

    res.json({
      plan: user.plan,
      subscriptionStatus: user.subscriptionStatus,
      currentMonth: user.currentMonth,
      nextBillingDate: getNextBillingDate(user.currentMonth),
      ...billingInfo,
    });
  } catch (error: any) {
    console.error('[user/billing] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch billing info' });
  }
});

// GET /api/user/invoices - List past invoices
router.get('/invoices', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validation = validateRequest(PaginationSchema, req.query);
    if (validation.success === false) {
      return res.status(400).json({ error: validation.error });
    }

    const { page, limit } = validation.data;
    const offset = (page - 1) * limit;

    if (!isDBConnected()) {
      return res.json({
        invoices: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        message: 'Invoice history requires database connection',
      });
    }

    const pool = getPool()!;
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ig_invoices WHERE clerk_user_id = $1`,
      [authReq.user.userId]
    );
    const total = parseInt(countResult.rows[0].count) || 0;

    const { rows } = await pool.query(
      `SELECT id, stripe_invoice_id, amount, currency, status, description, 
              invoice_url, pdf_url, created_at, paid_at
       FROM ig_invoices 
       WHERE clerk_user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [authReq.user.userId, limit, offset]
    );

    res.json({
      invoices: rows.map(r => ({
        id: r.id,
        stripeInvoiceId: r.stripe_invoice_id,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        description: r.description,
        invoiceUrl: r.invoice_url,
        pdfUrl: r.pdf_url,
        createdAt: r.created_at,
        paidAt: r.paid_at,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('[user/invoices] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// ════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT ENDPOINTS
// ════════════════════════════════════════════════════════════════

// GET /api/user/sessions - List all sessions with pagination
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validation = validateRequest(
      PaginationSchema.extend({
        status: z.enum(['active', 'completed', 'abandoned', 'all']).default('all'),
      }),
      req.query
    );
    if (validation.success === false) {
      return res.status(400).json({ error: validation.error });
    }

    const { page, limit, status } = validation.data;
    const offset = (page - 1) * limit;

    if (!isDBConnected()) {
      const history = await getUserSessionHistory(authReq.user.userId);
      const filtered = status === 'all' 
        ? history 
        : history.filter(s => s.status === status);
      
      return res.json({
        sessions: filtered.slice(offset, offset + limit),
        pagination: {
          page,
          limit,
          total: filtered.length,
          totalPages: Math.ceil(filtered.length / limit),
        },
      });
    }

    const pool = getPool()!;
    const statusFilter = status === 'all' ? '' : `AND status = '${status}'`;
    
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ig_sessions WHERE clerk_user_id = $1 ${statusFilter}`,
      [authReq.user.userId]
    );
    const total = parseInt(countResult.rows[0].count) || 0;

    const { rows } = await pool.query(
      `SELECT id, started_at, ended_at, questions_asked, voice_minutes_used, status
       FROM ig_sessions 
       WHERE clerk_user_id = $1 ${statusFilter}
       ORDER BY started_at DESC 
       LIMIT $2 OFFSET $3`,
      [authReq.user.userId, limit, offset]
    );

    res.json({
      sessions: rows.map(r => ({
        sessionId: r.id,
        startTime: r.started_at,
        endTime: r.ended_at,
        questionsAsked: r.questions_asked,
        voiceMinutesUsed: r.voice_minutes_used,
        status: r.status,
        durationSeconds: r.ended_at 
          ? Math.floor((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000)
          : Math.floor((Date.now() - new Date(r.started_at).getTime()) / 1000),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('[user/sessions] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET /api/user/sessions/:id - Get session details
router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    if (!isDBConnected()) {
      const history = await getUserSessionHistory(authReq.user.userId);
      const session = history.find(s => s.session_id === id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      return res.json({ session });
    }

    const pool = getPool()!;
    const { rows } = await pool.query(
      `SELECT s.id, s.started_at, s.ended_at, s.questions_asked, s.voice_minutes_used, s.status,
              s.metadata, s.transcript
       FROM ig_sessions s
       WHERE s.id = $1 AND s.clerk_user_id = $2`,
      [id, authReq.user.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const r = rows[0];
    res.json({
      session: {
        sessionId: r.id,
        startTime: r.started_at,
        endTime: r.ended_at,
        questionsAsked: r.questions_asked,
        voiceMinutesUsed: r.voice_minutes_used,
        status: r.status,
        durationSeconds: r.ended_at 
          ? Math.floor((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000)
          : Math.floor((Date.now() - new Date(r.started_at).getTime()) / 1000),
        metadata: r.metadata || {},
        transcript: r.transcript || null,
      },
    });
  } catch (error: any) {
    console.error('[user/sessions/:id] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch session details' });
  }
});

// DELETE /api/user/sessions/:id - Delete session data
router.delete('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    if (!isDBConnected()) {
      return res.status(503).json({ 
        error: 'Session deletion requires database connection',
        code: 'db_required' 
      });
    }

    const pool = getPool()!;
    
    // Verify ownership before deletion
    const { rows } = await pool.query(
      `SELECT id FROM ig_sessions WHERE id = $1 AND clerk_user_id = $2`,
      [id, authReq.user.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await pool.query(
      `DELETE FROM ig_sessions WHERE id = $1 AND clerk_user_id = $2`,
      [id, authReq.user.userId]
    );

    res.json({ message: 'Session deleted successfully', sessionId: id });
  } catch (error: any) {
    console.error('[user/sessions/:id DELETE] Error:', error.message);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// ════════════════════════════════════════════════════════════════
// API KEY MANAGEMENT (BYOK)
// ════════════════════════════════════════════════════════════════

// GET /api/user/api-keys - List user's API keys
router.get('/api-keys', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isDBConnected()) {
      return res.json({
        apiKeys: [],
        message: 'API key management requires database connection',
      });
    }

    const pool = getPool()!;
    const { rows } = await pool.query(
      `SELECT id, name, provider, key_masked, is_active, last_used_at, created_at
       FROM ig_api_keys 
       WHERE clerk_user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [authReq.user.userId]
    );

    res.json({
      apiKeys: rows.map(r => ({
        id: r.id,
        name: r.name,
        provider: r.provider,
        keyMasked: r.key_masked,
        isActive: r.is_active,
        lastUsedAt: r.last_used_at,
        createdAt: r.created_at,
      })),
    });
  } catch (error: any) {
    console.error('[user/api-keys] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// POST /api/user/api-keys - Add new API key
router.post('/api-keys', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validation = validateRequest(AddApiKeySchema, req.body);
    if (validation.success === false) {
      return res.status(400).json({ error: validation.error });
    }

    if (!isDBConnected()) {
      return res.status(503).json({ 
        error: 'API key management requires database connection',
        code: 'db_required' 
      });
    }

    const { name, provider, apiKey } = validation.data;
    const maskedKey = maskApiKey(apiKey);

    const pool = getPool()!;
    
    // Check for duplicate names
    const existingCheck = await pool.query(
      `SELECT id FROM ig_api_keys 
       WHERE clerk_user_id = $1 AND name = $2 AND deleted_at IS NULL`,
      [authReq.user.userId, name]
    );
    
    if (existingCheck.rows.length > 0) {
      return res.status(409).json({ error: 'API key with this name already exists' });
    }

    // Limit number of API keys per user
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ig_api_keys WHERE clerk_user_id = $1 AND deleted_at IS NULL`,
      [authReq.user.userId]
    );
    if (parseInt(countResult.rows[0].count) >= 10) {
      return res.status(400).json({ error: 'Maximum 10 API keys allowed per user' });
    }

    const { rows } = await pool.query(
      `INSERT INTO ig_api_keys (clerk_user_id, name, provider, api_key_encrypted, key_masked, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, name, provider, key_masked, is_active, created_at`,
      [authReq.user.userId, name, provider, apiKey, maskedKey]
    );

    res.status(201).json({
      message: 'API key added successfully',
      apiKey: {
        id: rows[0].id,
        name: rows[0].name,
        provider: rows[0].provider,
        keyMasked: rows[0].key_masked,
        isActive: rows[0].is_active,
        createdAt: rows[0].created_at,
      },
    });
  } catch (error: any) {
    console.error('[user/api-keys POST] Error:', error.message);
    res.status(500).json({ error: 'Failed to add API key' });
  }
});

// DELETE /api/user/api-keys/:id - Delete API key
router.delete('/api-keys/:id', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'API key ID required' });
    }

    if (!isDBConnected()) {
      return res.status(503).json({ 
        error: 'API key management requires database connection',
        code: 'db_required' 
      });
    }

    const pool = getPool()!;
    
    // Soft delete for audit trail
    const result = await pool.query(
      `UPDATE ig_api_keys 
       SET deleted_at = NOW(), is_active = false
       WHERE id = $1 AND clerk_user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, authReq.user.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json({ message: 'API key deleted successfully', id });
  } catch (error: any) {
    console.error('[user/api-keys/:id DELETE] Error:', error.message);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

// ════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════

function getNextBillingDate(currentMonth: string): string {
  const [year, month] = currentMonth.split('-').map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}

export default router;

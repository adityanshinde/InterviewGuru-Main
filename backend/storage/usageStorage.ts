import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PLAN_LIMITS, PlanTier } from '../../shared/constants/planLimits';
import { SessionRecord, UserRecord } from '../../shared/types';
import { getPool, isDBConnected } from '../services/database';

type SessionStoreRecord = SessionRecord & { userId: string };

const users = new Map<string, UserRecord>();
const sessions = new Map<string, SessionStoreRecord>();

let memoryDiskLoaded = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let exitFlushRegistered = false;

function flushPersistMemorySync(): void {
	if (isDBConnected() || !memoryStorePath()) return;
	if (persistTimer) {
		clearTimeout(persistTimer);
		persistTimer = null;
	}
	persistMemoryStore();
}

function registerExitFlushOnce(): void {
	if (exitFlushRegistered) return;
	exitFlushRegistered = true;
	process.on('exit', flushPersistMemorySync);
	process.on('SIGINT', flushPersistMemorySync);
	process.on('SIGTERM', flushPersistMemorySync);
}

function isServerlessFilesystem(): boolean {
	return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * When Postgres is off, persist Maps here (desktop .exe / long-lived Node).
 * Vercel/Lambda: no writable home dir — return null so we stay in-memory only (set DATABASE_URL for real quotas).
 * Override with INTERVIEWGURU_USAGE_STORE if you truly need a path (e.g. /tmp in a single-instance VM).
 */
function memoryStorePath(): string | null {
	const envPath = process.env.INTERVIEWGURU_USAGE_STORE?.trim();
	if (envPath) return envPath;
	if (isServerlessFilesystem()) return null;
	if (process.env.NODE_ENV === 'production') {
		const base =
			process.platform === 'win32'
				? path.join(process.env.APPDATA || os.homedir(), 'InterviewGuru')
				: path.join(os.homedir(), '.interviewguru');
		return path.join(base, 'usage-store.json');
	}
	return null;
}

function loadMemoryStoreOnce(): void {
	if (memoryDiskLoaded || isDBConnected()) return;
	memoryDiskLoaded = true;
	const p = memoryStorePath();
	if (!p) return;
	try {
		if (!fs.existsSync(p)) return;
		const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as {
			users?: Record<string, UserRecord>;
			sessions?: Record<string, SessionStoreRecord>;
		};
		if (raw.users && typeof raw.users === 'object') {
			for (const [k, v] of Object.entries(raw.users)) {
				if (v && typeof v.userId === 'string') users.set(k, v);
			}
		}
		if (raw.sessions && typeof raw.sessions === 'object') {
			for (const [k, v] of Object.entries(raw.sessions)) {
				if (v && typeof v.sessionId === 'string' && typeof v.userId === 'string') sessions.set(k, v);
			}
		}
	} catch (e) {
		console.warn('[usageStorage] Could not load usage-store.json (starting fresh):', e);
	}
}

function persistMemoryStore(): void {
	if (isDBConnected()) return;
	const p = memoryStorePath();
	if (!p) return;
	try {
		const dir = path.dirname(p);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		const data = {
			version: 1 as const,
			users: Object.fromEntries(users),
			sessions: Object.fromEntries(sessions),
		};
		fs.writeFileSync(p, JSON.stringify(data), 'utf8');
	} catch (e) {
		console.error('[usageStorage] Failed to persist usage store:', e);
	}
}

function schedulePersistMemoryStore(): void {
	if (isDBConnected()) return;
	if (memoryStorePath()) registerExitFlushOnce();
	if (persistTimer) clearTimeout(persistTimer);
	persistTimer = setTimeout(() => {
		persistTimer = null;
		persistMemoryStore();
	}, 300);
}

function getCurrentMonth(): string {
	return new Date().toISOString().slice(0, 7);
}

function usagePeriodForPlan(plan: PlanTier): string {
	return plan === 'free' ? 'lifetime' : getCurrentMonth();
}

export function effectiveQuotaLimits(plan: PlanTier): {
	voiceLimit: number;
	chatLimit: number;
	sessionsLimit: number;
} {
	const config = PLAN_LIMITS[plan];
	if (plan === 'free') {
		return {
			voiceLimit: 15,
			chatLimit: 10,
			sessionsLimit: config.sessionsPerMonth,
		};
	}
	return {
		voiceLimit: config.voiceMinutesPerMonth,
		chatLimit: config.chatMessagesPerMonth,
		sessionsLimit: config.sessionsPerMonth,
	};
}

function createDefaultUser(userId: string, email = ''): UserRecord {
	const now = Date.now();
	return {
		userId,
		email,
		plan: 'free',
		trialsUsed: false,
		trialStartDate: now,
		subscriptionStatus: 'active',
		currentMonth: usagePeriodForPlan('free'),
		voiceMinutesUsed: 0,
		chatMessagesUsed: 0,
		sessionsUsed: 0,
		activeSessions: [],
		sessionHistory: [],
		createdAt: now,
		lastActiveAt: now,
	};
}

function memoryGetOrCreateUser(userId: string, email = ''): UserRecord {
	loadMemoryStoreOnce();
	let user = users.get(userId);
	if (!user) {
		user = createDefaultUser(userId, email);
		users.set(userId, user);
		schedulePersistMemoryStore();
	} else if (email && user.email !== email) {
		user.email = email;
		schedulePersistMemoryStore();
	}
	return user;
}

function toPublicSession(session: SessionStoreRecord, email = ''): Record<string, unknown> {
	return {
		session_id: session.sessionId,
		user_id: session.userId,
		email,
		start_time: new Date(session.startTime).toISOString(),
		end_time: session.endTime ? new Date(session.endTime).toISOString() : null,
		questions_asked: session.questionsAsked,
		voice_minutes_used: session.voiceMinutesUsed,
		duration_seconds: Math.max(0, Math.floor((Date.now() - session.startTime) / 1000)),
		status: session.status,
	};
}

function pgRowToUser(r: {
	clerk_user_id: string;
	email: string;
	plan: string;
	subscription_status: string;
	trial_started_at: Date;
	billing_month: string;
	voice_minutes_used: number;
	chat_messages_used: number;
	sessions_used: number;
	created_at: Date;
}): UserRecord {
	return {
		userId: r.clerk_user_id,
		email: r.email,
		plan: r.plan as PlanTier,
		trialsUsed: false,
		trialStartDate: new Date(r.trial_started_at).getTime(),
		subscriptionStatus: r.subscription_status as UserRecord['subscriptionStatus'],
		currentMonth: r.billing_month,
		voiceMinutesUsed: r.voice_minutes_used,
		chatMessagesUsed: r.chat_messages_used,
		sessionsUsed: r.sessions_used,
		activeSessions: [],
		sessionHistory: [],
		createdAt: new Date(r.created_at).getTime(),
		lastActiveAt: Date.now(),
	};
}

async function pgEnsureBillingMonth(userId: string): Promise<void> {
	const pool = getPool();
	if (!pool) return;
	const row = await pool.query<{ plan: PlanTier; billing_month: string }>(
		`SELECT plan, billing_month FROM ig_users WHERE clerk_user_id = $1`,
		[userId]
	);
	const first = row.rows[0];
	if (!first) return;
	const month = usagePeriodForPlan(first.plan || 'free');
	if (first.billing_month === month) return;
	await pool.query(
		`UPDATE ig_users SET
      voice_minutes_used = 0,
      chat_messages_used = 0,
      sessions_used = 0,
      billing_month = $2,
      updated_at = NOW()
     WHERE clerk_user_id = $1 AND billing_month <> $2`,
		[userId, month]
	);
}

async function pgLoadUser(userId: string): Promise<UserRecord | null> {
	const pool = getPool();
	if (!pool) return null;
	await pgEnsureBillingMonth(userId);
	const { rows } = await pool.query(
		`SELECT clerk_user_id, email, plan, subscription_status, trial_started_at,
            billing_month, voice_minutes_used, chat_messages_used, sessions_used, created_at
     FROM ig_users WHERE clerk_user_id = $1`,
		[userId]
	);
	if (!rows.length) return null;
	return pgRowToUser(rows[0] as any);
}

export async function getUserFromDB(userId: string): Promise<UserRecord | null> {
	if (!isDBConnected()) {
		return memoryGetOrCreateUser(userId);
	}
	const u = await pgLoadUser(userId);
	return u;
}

export async function createUserInDB(userId: string, email: string): Promise<UserRecord> {
	if (!isDBConnected()) {
		loadMemoryStoreOnce();
		const u = createDefaultUser(userId, email);
		users.set(userId, u);
		schedulePersistMemoryStore();
		return u;
	}
	const existing = await pgLoadUser(userId);
	if (existing) return existing;
	const pool = getPool()!;
	const month = usagePeriodForPlan('free');
	await pool.query(
		`INSERT INTO ig_users (
        clerk_user_id, email, plan, subscription_status, trial_started_at,
        billing_month, voice_minutes_used, chat_messages_used, sessions_used
      ) VALUES ($1, $2, 'free', 'active', NOW(), $3, 0, 0, 0)
      ON CONFLICT (clerk_user_id) DO NOTHING`,
		[userId, email, month]
	);
	const again = await pgLoadUser(userId);
	return again || createDefaultUser(userId, email);
}

export function resetMonthlyUsageIfNeeded(user: UserRecord): boolean {
	if (isDBConnected()) {
		return false;
	}
	const currentMonth = usagePeriodForPlan(user.plan);
	if (user.currentMonth !== currentMonth) {
		user.currentMonth = currentMonth;
		user.voiceMinutesUsed = 0;
		user.chatMessagesUsed = 0;
		user.sessionsUsed = 0;
		schedulePersistMemoryStore();
		return true;
	}
	return false;
}

export async function recordVoiceUsage(userId: string, voiceMinutes: number = 1): Promise<void> {
	if (!isDBConnected()) {
		const user = memoryGetOrCreateUser(userId);
		resetMonthlyUsageIfNeeded(user);
		user.voiceMinutesUsed += voiceMinutes;
		user.lastActiveAt = Date.now();
		users.set(userId, user);
		schedulePersistMemoryStore();
		return;
	}
	const pool = getPool()!;
	await pgEnsureBillingMonth(userId);
	await pool.query(
		`UPDATE ig_users SET voice_minutes_used = voice_minutes_used + $2, updated_at = NOW() WHERE clerk_user_id = $1`,
		[userId, voiceMinutes]
	);
}

export async function recordChatUsage(userId: string, chatCount: number = 1): Promise<void> {
	if (!isDBConnected()) {
		const user = memoryGetOrCreateUser(userId);
		resetMonthlyUsageIfNeeded(user);
		user.chatMessagesUsed += chatCount;
		user.lastActiveAt = Date.now();
		users.set(userId, user);
		schedulePersistMemoryStore();
		return;
	}
	const pool = getPool()!;
	await pgEnsureBillingMonth(userId);
	await pool.query(
		`UPDATE ig_users SET chat_messages_used = chat_messages_used + $2, updated_at = NOW() WHERE clerk_user_id = $1`,
		[userId, chatCount]
	);
}

export async function getRemainingQuota(userId: string, quotaType: 'voice' | 'chat' | 'session'): Promise<number> {
	const user = await getUserFromDB(userId);
	if (!user) return 0;
	resetMonthlyUsageIfNeeded(user);
	const limits = effectiveQuotaLimits(user.plan);

	switch (quotaType) {
		case 'voice':
			return Math.max(0, limits.voiceLimit - user.voiceMinutesUsed);
		case 'chat':
			return Math.max(0, limits.chatLimit - user.chatMessagesUsed);
		case 'session':
			return Math.max(0, limits.sessionsLimit - user.sessionsUsed);
		default:
			return 0;
	}
}

export async function upgradeUserPlan(userId: string, newPlan: PlanTier): Promise<UserRecord | null> {
	if (!isDBConnected()) {
		const user = memoryGetOrCreateUser(userId);
		user.plan = newPlan;
		user.subscriptionStatus = 'active';
		user.lastActiveAt = Date.now();
		users.set(userId, user);
		schedulePersistMemoryStore();
		return user;
	}
	const pool = getPool()!;
	await pool.query(
		`UPDATE ig_users SET plan = $2,
      subscription_status = 'active',
      updated_at = NOW()
     WHERE clerk_user_id = $1`,
		[userId, newPlan]
	);
	return pgLoadUser(userId);
}

export function calculateTrialDaysRemaining(user: UserRecord): number {
	void user;
	return 0;
}

export function checkTrialExpired(user: UserRecord): boolean {
	void user;
	return false;
}

export async function createSession(userId: string): Promise<string | null> {
	const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
	const now = Date.now();

	if (!isDBConnected()) {
		const user = memoryGetOrCreateUser(userId);
		resetMonthlyUsageIfNeeded(user);
		sessions.set(sessionId, {
			sessionId,
			userId,
			startTime: now,
			questionsAsked: 0,
			voiceMinutesUsed: 0,
			status: 'active',
		});
		user.sessionsUsed += 1;
		user.activeSessions = [sessionId, ...(user.activeSessions || [])].slice(0, 20);
		user.lastActiveAt = now;
		users.set(userId, user);
		schedulePersistMemoryStore();
		return sessionId;
	}

	const pool = getPool()!;
	await pgEnsureBillingMonth(userId);
	await pool.query(
		`UPDATE ig_users SET sessions_used = sessions_used + 1, updated_at = NOW() WHERE clerk_user_id = $1`,
		[userId]
	);
	await pool.query(
		`INSERT INTO ig_sessions (id, clerk_user_id, started_at, questions_asked, voice_minutes_used, status)
     VALUES ($1, $2, NOW(), 0, 0, 'active')`,
		[sessionId, userId]
	);
	return sessionId;
}

export async function updateSession(sessionId: string, userId: string, questionsAsked: number, voiceMinutesUsed: number = 0): Promise<void> {
	if (!isDBConnected()) {
		loadMemoryStoreOnce();
		const session = sessions.get(sessionId);
		if (!session || session.userId !== userId) return;
		session.questionsAsked = questionsAsked;
		session.voiceMinutesUsed = voiceMinutesUsed;
		sessions.set(sessionId, session);
		schedulePersistMemoryStore();
		return;
	}
	const pool = getPool()!;
	await pool.query(
		`UPDATE ig_sessions SET questions_asked = $3, voice_minutes_used = $4
     WHERE id = $1 AND clerk_user_id = $2`,
		[sessionId, userId, questionsAsked, voiceMinutesUsed]
	);
}

export async function closeSession(sessionId: string, userId: string, status: 'completed' | 'abandoned'): Promise<void> {
	if (!isDBConnected()) {
		loadMemoryStoreOnce();
		const session = sessions.get(sessionId);
		if (!session || session.userId !== userId) return;
		session.status = status;
		session.endTime = Date.now();
		sessions.set(sessionId, session);
		schedulePersistMemoryStore();
		return;
	}
	const pool = getPool()!;
	await pool.query(
		`UPDATE ig_sessions SET status = $3, ended_at = NOW() WHERE id = $1 AND clerk_user_id = $2`,
		[sessionId, userId, status]
	);
}

export function sessionDurationLimitMinutesForPlan(plan: PlanTier): number {
	return plan === 'free' ? 15 : 40;
}

async function activeSessionElapsedSeconds(sessionId: string, userId: string): Promise<number | null> {
	if (!isDBConnected()) {
		loadMemoryStoreOnce();
		const session = sessions.get(sessionId);
		if (!session || session.userId !== userId || session.status !== 'active') return null;
		return Math.max(0, Math.floor((Date.now() - session.startTime) / 1000));
	}
	const pool = getPool()!;
	const { rows } = await pool.query<{ started_at: Date }>(
		`SELECT started_at
     FROM ig_sessions
     WHERE id = $1 AND clerk_user_id = $2 AND status = 'active'
     LIMIT 1`,
		[sessionId, userId]
	);
	if (!rows.length) return null;
	return Math.max(0, Math.floor((Date.now() - new Date(rows[0].started_at).getTime()) / 1000));
}

export async function getActiveSessionDurationStatus(
	sessionId: string,
	userId: string
): Promise<{
	exists: boolean;
	elapsedSeconds: number;
	limitMinutes: number;
	overLimit: boolean;
}> {
	const user = await getUserFromDB(userId);
	const limitMinutes = sessionDurationLimitMinutesForPlan(user?.plan || 'free');
	const elapsedSeconds = await activeSessionElapsedSeconds(sessionId, userId);
	if (elapsedSeconds === null) {
		return {
			exists: false,
			elapsedSeconds: 0,
			limitMinutes,
			overLimit: false,
		};
	}
	return {
		exists: true,
		elapsedSeconds,
		limitMinutes,
		overLimit: elapsedSeconds >= limitMinutes * 60,
	};
}

/** @deprecated Prefer getActiveSessionsForUser */
export async function getActiveSessions(): Promise<Record<string, unknown>[]> {
	return [];
}

export async function getActiveSessionsForUser(userId: string): Promise<Record<string, unknown>[]> {
	if (!isDBConnected()) {
		loadMemoryStoreOnce();
		return Array.from(sessions.values())
			.filter((s) => s.status === 'active' && s.userId === userId)
			.map((s) => toPublicSession(s, users.get(s.userId)?.email || ''));
	}
	const pool = getPool()!;
	const { rows } = await pool.query(
		`SELECT s.id, s.clerk_user_id, s.started_at, s.ended_at, s.questions_asked, s.voice_minutes_used, s.status, u.email
     FROM ig_sessions s JOIN ig_users u ON u.clerk_user_id = s.clerk_user_id
     WHERE s.clerk_user_id = $1 AND s.status = 'active' ORDER BY s.started_at DESC`,
		[userId]
	);
	return rows.map((r: any) => ({
		session_id: r.id,
		user_id: r.clerk_user_id,
		email: r.email,
		start_time: new Date(r.started_at).toISOString(),
		end_time: r.ended_at ? new Date(r.ended_at).toISOString() : null,
		questions_asked: r.questions_asked,
		voice_minutes_used: r.voice_minutes_used,
		duration_seconds: Math.max(0, Math.floor((Date.now() - new Date(r.started_at).getTime()) / 1000)),
		status: r.status,
	}));
}

export async function getUserSessionHistory(userId: string): Promise<Record<string, unknown>[]> {
	if (!isDBConnected()) {
		loadMemoryStoreOnce();
		return Array.from(sessions.values())
			.filter((session) => session.userId === userId)
			.sort((a, b) => b.startTime - a.startTime)
			.slice(0, 50)
			.map((session) => toPublicSession(session, users.get(session.userId)?.email || ''));
	}
	const pool = getPool()!;
	const { rows } = await pool.query(
		`SELECT s.id, s.clerk_user_id, s.started_at, s.ended_at, s.questions_asked, s.voice_minutes_used, s.status, u.email
     FROM ig_sessions s JOIN ig_users u ON u.clerk_user_id = s.clerk_user_id
     WHERE s.clerk_user_id = $1 ORDER BY s.started_at DESC LIMIT 50`,
		[userId]
	);
	return rows.map((r: any) => ({
		session_id: r.id,
		user_id: r.clerk_user_id,
		email: r.email,
		start_time: new Date(r.started_at).toISOString(),
		end_time: r.ended_at ? new Date(r.ended_at).toISOString() : null,
		questions_asked: r.questions_asked,
		voice_minutes_used: r.voice_minutes_used,
		duration_seconds: r.ended_at
			? Math.max(0, Math.floor((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000))
			: Math.max(0, Math.floor((Date.now() - new Date(r.started_at).getTime()) / 1000)),
		status: r.status,
	}));
}

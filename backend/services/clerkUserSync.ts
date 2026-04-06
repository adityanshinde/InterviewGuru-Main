import { createClerkClient } from '@clerk/backend';
import { clerkEnvironmentForNode, clerkSecretKeyForNode } from '../config/clerkKeys';
import { getPool, isDBConnected } from './database';

let clerkClient: ReturnType<typeof createClerkClient> | null = null;

/** Avoid calling Clerk `getUser` on every API request (was doubling latency with parallel /api/usage + /api/analyze). */
type ClerkEmailCacheEntry = { expiresAt: number; email: string };

const clerkEmailCache = new Map<string, ClerkEmailCacheEntry>();

function clerkUserCacheTtlMs(): number {
	const raw = process.env.CLERK_USER_CACHE_MS?.trim();
	if (raw === '0') return 0;
	const n = parseInt(raw || '120000', 10);
	return Number.isFinite(n) && n >= 0 ? n : 120000;
}

function getClerk(): ReturnType<typeof createClerkClient> | null {
	const secret = clerkSecretKeyForNode();
	if (!secret) return null;
	if (!clerkClient) {
		clerkClient = createClerkClient({ secretKey: secret });
	}
	return clerkClient;
}

function currentBillingMonth(): string {
	return new Date().toISOString().slice(0, 7);
}

function primaryEmail(user: { emailAddresses: { id: string; emailAddress: string }[]; primaryEmailAddressId: string | null }): string {
	if (!user.primaryEmailAddressId) return user.emailAddresses[0]?.emailAddress || '';
	const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
	return primary?.emailAddress || user.emailAddresses[0]?.emailAddress || '';
}

/**
 * Optional abuse guard: max new ig_users rows per IP per rolling 24h (0 = disabled).
 */
async function assertSignupAllowed(signupIp: string): Promise<void> {
	const raw = process.env.ABUSE_MAX_SIGNUPS_PER_IP_PER_DAY;
	const max = raw ? parseInt(raw, 10) : 0;
	if (!max || max <= 0 || !signupIp || signupIp === 'unknown') return;

	const pool = getPool();
	if (!pool) return;

	const { rows } = await pool.query<{ c: string }>(
		`SELECT COUNT(*)::text AS c FROM ig_users
     WHERE signup_ip = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
		[signupIp]
	);
	const count = parseInt(rows[0]?.c || '0', 10);
	if (count >= max) {
		const err = new Error('Too many new accounts from this network. Try again later or contact support.');
		(err as any).status = 429;
		throw err;
	}
}

export interface SyncedUser {
	userId: string;
	email: string;
	plan: import('../../shared/constants/planLimits').PlanTier;
}

/** Parallel /api/usage + /api/analyze share one in-flight sync per user (same Clerk + DB work). */
const inflightUserSync = new Map<string, Promise<SyncedUser>>();

/**
 * Resolve Clerk user for Express `req.user` (Postgres when available, else minimal in-memory-safe identity).
 */
export async function loadClerkUserForRequest(clerkUserId: string, signupIp: string): Promise<SyncedUser> {
	const existing = inflightUserSync.get(clerkUserId);
	if (existing) return existing;

	const run = loadClerkUserForRequestOnce(clerkUserId, signupIp).finally(() => {
		inflightUserSync.delete(clerkUserId);
	});
	inflightUserSync.set(clerkUserId, run);
	return run;
}

async function loadClerkUserForRequestOnce(clerkUserId: string, signupIp: string): Promise<SyncedUser> {
	const clerk = getClerk();
	if (!clerk) {
		throw new Error('Clerk not configured');
	}

	if (!isDBConnected()) {
		console.warn(
			'[clerkUserSync] Postgres not connected (check DATABASE_URL on server) — skipping ig_users INSERT for',
			clerkUserId
		);
		const remote = await clerk.users.getUser(clerkUserId);
		return {
			userId: clerkUserId,
			email: primaryEmail(remote),
			plan: 'free',
		};
	}

	const pool = getPool()!;
	const clerkEnv = clerkEnvironmentForNode();

	const existing = await pool.query<{
		clerk_user_id: string;
		email: string;
		plan: string;
		clerk_env: 'live' | 'test' | 'unknown' | null;
	}>(`SELECT clerk_user_id, email, plan, clerk_env FROM ig_users WHERE clerk_user_id = $1`, [clerkUserId]);

	if (existing.rows.length > 0) {
		const row = existing.rows[0];
		const ttl = clerkUserCacheTtlMs();
		const now = Date.now();

		if (ttl > 0) {
			const hit = clerkEmailCache.get(clerkUserId);
			if (hit && hit.expiresAt > now) {
				return {
					userId: row.clerk_user_id,
					email: hit.email || row.email,
					plan: row.plan as SyncedUser['plan'],
				};
			}
		}

		const remote = await clerk.users.getUser(clerkUserId);
		const email = primaryEmail(remote) || row.email;
		if (ttl > 0) {
			clerkEmailCache.set(clerkUserId, { expiresAt: now + ttl, email });
		}
		if (email && email !== row.email) {
			await pool.query(`UPDATE ig_users SET email = $2, updated_at = NOW() WHERE clerk_user_id = $1`, [
				clerkUserId,
				email,
			]);
		}
		if (clerkEnv !== 'unknown' && (row.clerk_env || 'unknown') !== clerkEnv) {
			await pool.query(`UPDATE ig_users SET clerk_env = $2, updated_at = NOW() WHERE clerk_user_id = $1`, [
				clerkUserId,
				clerkEnv,
			]);
		}
		return {
			userId: row.clerk_user_id,
			email: email || row.email,
			plan: row.plan as SyncedUser['plan'],
		};
	}

	await assertSignupAllowed(signupIp);

	const remote = await clerk.users.getUser(clerkUserId);
	const email = primaryEmail(remote);
	const month = currentBillingMonth();

	await pool.query(
		`INSERT INTO ig_users (
        clerk_user_id, email, plan, subscription_status, trial_started_at,
        billing_month, voice_minutes_used, chat_messages_used, sessions_used, signup_ip, clerk_env
      ) VALUES ($1, $2, 'free', 'trial', NOW(), $3, 0, 0, 0, $4, $5)
      ON CONFLICT (clerk_user_id) DO NOTHING`,
		[clerkUserId, email, month, signupIp || null, clerkEnv]
	);

	const again = await pool.query<{ email: string; plan: string }>(
		`SELECT email, plan FROM ig_users WHERE clerk_user_id = $1`,
		[clerkUserId]
	);
	const r = again.rows[0];
	return {
		userId: clerkUserId,
		email: r?.email || email,
		plan: (r?.plan as SyncedUser['plan']) || 'free',
	};
}

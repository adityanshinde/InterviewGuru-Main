import { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'node:crypto';
import { clerkMiddleware, getAuth } from '@clerk/express';
import { AuthRequest } from '../../shared/types';
import { clerkPublishableKeyForNode, clerkSecretKeyForNode } from '../config/clerkKeys';
import { loadClerkUserForRequest } from '../services/clerkUserSync';
import {
	getUserFromDB,
	resetMonthlyUsageIfNeeded,
	getRemainingQuota,
} from '../storage/usageStorage';

function normalizeHeaderValue(value: string | string[] | undefined): string {
	if (Array.isArray(value)) {
		return value.join(',');
	}
	return value || '';
}

function buildGuestUserId(req: Request): string {
	const ip =
		normalizeHeaderValue(req.headers['x-forwarded-for']).split(',')[0]?.trim() ||
		req.socket.remoteAddress ||
		req.ip ||
		'unknown-ip';
	const userAgent = normalizeHeaderValue(req.headers['user-agent']);
	const hash = crypto.createHash('sha256').update(`${ip}:${userAgent}`).digest('hex').slice(0, 12);
	return `guest_${hash}`;
}

function clientIp(req: Request): string {
	return (
		normalizeHeaderValue(req.headers['x-forwarded-for']).split(',')[0]?.trim() ||
		req.socket.remoteAddress ||
		req.ip ||
		''
	);
}

function warnClerkDevLiveMismatch(pk: string, sk: string) {
	if (process.env.NODE_ENV === 'production') return;
	if (pk.startsWith('pk_test_') && sk.startsWith('sk_live_')) {
		console.warn(
			'[Clerk] Browser uses a dev key (pk_test_*) but CLERK_SECRET_KEY is sk_live_*. /api/* will return 401 until they match. Fix: set CLERK_SECRET_KEY_DEV=sk_test_* from the same Clerk dev app as VITE_CLERK_PUBLISHABLE_KEY_DEV, or use sk_test as CLERK_SECRET_KEY locally.'
		);
	}
}

const clerkEnabled = () => !!clerkSecretKeyForNode();

function isProductionNodeEnv(): boolean {
	return process.env.NODE_ENV === 'production';
}

/**
 * Clerk session middleware — no-op if no secret key is resolved (local guest mode).
 * Passes publishable + secret explicitly so dev/live key pairs stay aligned with the browser.
 */
let clerkMwSingleton: RequestHandler | null = null;

function resolveClerkExpressMiddleware(): RequestHandler {
	if (clerkMwSingleton) return clerkMwSingleton;
	if (!clerkEnabled()) {
		clerkMwSingleton = (_req, _res, next) => next();
		return clerkMwSingleton;
	}
	const pk = clerkPublishableKeyForNode();
	const sk = clerkSecretKeyForNode();
	warnClerkDevLiveMismatch(pk, sk);
	if (!pk) {
		console.error(
			'[Clerk] Secret key is set but no publishable key found. Set CLERK_PUBLISHABLE_KEY or VITE_CLERK_PUBLISHABLE_KEY (and optionally VITE_CLERK_PUBLISHABLE_KEY_DEV) in backend/.env or frontend/.env — same values as the Vite app.'
		);
	}
	clerkMwSingleton = clerkMiddleware({
		publishableKey: pk || undefined,
		secretKey: sk || undefined,
	});
	return clerkMwSingleton;
}

/** Lazy init so `loadEnvFirst` runs before Clerk reads process.env (see server.ts import order). */
export const clerkAuthMiddleware: RequestHandler = (req, res, next) =>
	resolveClerkExpressMiddleware()(req, res, next);

/**
 * Resolves `req.user` from Clerk + DB, or guest identity in non-production when Clerk is disabled (local dev only).
 * Production (web Vercel + packaged desktop) must set CLERK_SECRET_KEY — no anonymous API usage.
 */
export const authMiddleware: RequestHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const authReq = req as AuthRequest;

		if (clerkEnabled()) {
			const auth = getAuth(req);
			if (!auth.userId) {
				res.status(401).json({ error: 'Sign in required', code: 'auth_required' });
				return;
			}
			const synced = await loadClerkUserForRequest(auth.userId, clientIp(req));
			authReq.user = {
				userId: synced.userId,
				email: synced.email,
				plan: synced.plan,
			};
			next();
			return;
		}

		if (isProductionNodeEnv()) {
			res.status(503).json({
				error: 'Server missing CLERK_SECRET_KEY (or CLERK_SECRET_KEY_DEV in dev). Sign-in is required; configure Clerk on the API (same as web).',
				code: 'auth_misconfigured',
			});
			return;
		}

		if (!authReq.user) {
			authReq.user = {
				userId: buildGuestUserId(req),
				email: '',
				plan: 'free',
			};
		}
		next();
	} catch (e: any) {
		const status = e?.status || 500;
		console.error('[authMiddleware]', e);
		res.status(status).json({ error: e?.message || 'Authentication failed' });
	}
};

export function quotaMiddleware(quotaType: 'voice' | 'chat' | 'session'): RequestHandler {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const authReq = req as AuthRequest;
			if (!authReq.user) {
				res.status(401).json({ error: 'Unauthorized' });
				return;
			}

			const user = await getUserFromDB(authReq.user.userId);
			if (!user) {
				res.status(401).json({ error: 'User not found' });
				return;
			}

			resetMonthlyUsageIfNeeded(user);

			const remaining = await getRemainingQuota(authReq.user.userId, quotaType);
			if (remaining <= 0) {
				res.status(402).json({
					message: `Monthly ${quotaType} quota exceeded. Please upgrade your plan.`,
					code: 'quota_exceeded',
					quotaType,
				});
				return;
			}

			next();
		} catch (e) {
			console.error('[quotaMiddleware]', e);
			res.status(500).json({ error: 'Quota check failed' });
		}
	};
}

/** `/api/analyze` supports chat and voice modes; enforce the matching quota bucket. */
export const analyzeQuotaMiddleware: RequestHandler = (req, res, next) => {
	const rawMode = req.headers['x-mode'];
	const mode = (Array.isArray(rawMode) ? rawMode[0] : rawMode || '').toString().trim().toLowerCase();
	const quotaType = mode === 'chat' ? 'chat' : 'voice';
	return quotaMiddleware(quotaType)(req, res, next);
};

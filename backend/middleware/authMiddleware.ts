import { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'node:crypto';
import { clerkMiddleware, getAuth } from '@clerk/express';
import { AuthRequest } from '../../shared/types';
import { loadClerkUserForRequest } from '../services/clerkUserSync';
import {
	getUserFromDB,
	resetMonthlyUsageIfNeeded,
	checkTrialExpired,
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

const clerkSecret = () => process.env.CLERK_SECRET_KEY?.trim();
/** Same `pk_...` as the browser; Clerk Express requires it at runtime (not only `VITE_*` on Vercel). */
const clerkPublishable = () =>
	(process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY)?.trim();

const clerkEnabled = () => !!clerkSecret();

/**
 * Clerk session middleware — no-op if `CLERK_SECRET_KEY` is unset (local guest mode).
 * Passes publishable key explicitly so `CLERK_PUBLISHABLE_KEY` or `VITE_CLERK_PUBLISHABLE_KEY` both work on the server.
 */
export const clerkAuthMiddleware: RequestHandler = clerkEnabled()
	? clerkMiddleware({ publishableKey: clerkPublishable() || undefined })
	: (_req, _res, next) => next();

/**
 * Resolves `req.user` from Clerk + DB, or guest identity when Clerk is disabled.
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

			if (user.plan === 'free' && checkTrialExpired(user)) {
				res.status(402).json({
					message: 'Free trial expired. Upgrade to continue.',
					code: 'trial_expired',
				});
				return;
			}

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

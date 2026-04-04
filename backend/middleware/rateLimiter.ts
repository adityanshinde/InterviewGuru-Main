import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import { getAuth } from '@clerk/express';

function resolveClientIp(req: Request): string {
	const xf = req.headers['x-forwarded-for'];
	if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
	return req.socket.remoteAddress || req.ip || '';
}

const perMinute = Math.max(20, Math.min(500, parseInt(process.env.API_RATE_LIMIT_PER_MINUTE || '180', 10)));

/**
 * Soft cap per minute per signed-in user, or per IP if Clerk session is missing.
 */
export const apiBurstLimiter = rateLimit({
	windowMs: 60_000,
	max: perMinute,
	standardHeaders: true,
	legacyHeaders: false,
	skip: (req) => req.path === '/health' || req.url === '/health',
	keyGenerator: (req) => {
		if (process.env.CLERK_SECRET_KEY) {
			try {
				const auth = getAuth(req as any);
				if (auth.userId) return `user:${auth.userId}`;
			} catch {
				/* unauthenticated */
			}
		}
		const raw = resolveClientIp(req);
		return `ip:${ipKeyGenerator(raw || '0.0.0.0')}`;
	},
});

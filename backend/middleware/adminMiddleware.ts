import { Request, Response, NextFunction, RequestHandler } from 'express';
import { getAuth } from '@clerk/express';
import { clerkSecretKeyForNode } from '../config/clerkKeys';
import { createClerkClient } from '@clerk/backend';

let clerkClient: ReturnType<typeof createClerkClient> | null = null;

function getClerk(): ReturnType<typeof createClerkClient> | null {
	const secret = clerkSecretKeyForNode();
	if (!secret) return null;
	if (!clerkClient) {
		clerkClient = createClerkClient({ secretKey: secret });
	}
	return clerkClient;
}

export interface AdminRequest extends Request {
	adminUser?: {
		userId: string;
		email: string;
		role: string;
	};
}

/**
 * Admin middleware that checks if the authenticated user has admin role.
 * Admin role is stored in Clerk publicMetadata.role
 */
export const adminMiddleware: RequestHandler = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	try {
		const auth = getAuth(req);

		if (!auth.userId) {
			res.status(401).json({ error: 'Authentication required', code: 'auth_required' });
			return;
		}

		const clerk = getClerk();
		if (!clerk) {
			res.status(503).json({ error: 'Clerk not configured', code: 'clerk_error' });
			return;
		}

		const user = await clerk.users.getUser(auth.userId);
		const role = (user.publicMetadata as { role?: string })?.role;

		if (role !== 'admin') {
			res.status(403).json({
				error: 'Admin access required',
				code: 'forbidden',
				message: 'You do not have permission to access this resource.',
			});
			return;
		}

		const adminReq = req as AdminRequest;
		adminReq.adminUser = {
			userId: auth.userId,
			email: user.emailAddresses[0]?.emailAddress || '',
			role: role,
		};

		next();
	} catch (error: any) {
		console.error('[adminMiddleware] Error:', error);
		res.status(500).json({
			error: 'Failed to verify admin access',
			code: 'admin_check_failed',
		});
	}
};

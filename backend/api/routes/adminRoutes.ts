import { Router, Request, Response } from 'express';
import { adminMiddleware, AdminRequest } from '../../middleware/adminMiddleware';
import {
	getAllUsers,
	getUserById,
	updateUserPlan,
	banUser,
	getPlatformStats,
	getUsageAnalytics,
} from '../../storage/adminStorage';
import { PlanTier } from '../../../shared/constants/planLimits';

const router = Router();

router.use(adminMiddleware);

/**
 * GET /api/admin/users
 * List all users with pagination, filtering, and sorting
 */
router.get('/users', async (req: Request, res: Response) => {
	try {
		const page = parseInt(req.query.page as string) || 1;
		const limit = parseInt(req.query.limit as string) || 10;
		const search = (req.query.search as string) || '';
		const plan = (req.query.plan as PlanTier | 'all') || 'all';
		const status = (req.query.status as string) || 'all';
		const sortBy = (req.query.sortBy as string) || 'created_at';
		const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

		const result = await getAllUsers({
			page,
			limit,
			search,
			plan,
			status,
			sortBy,
			sortOrder,
		});

		res.json(result);
	} catch (error: any) {
		console.error('[Admin] Failed to fetch users:', error.message);
		res.status(500).json({ error: 'Failed to fetch users' });
	}
});

/**
 * GET /api/admin/users/:id
 * Get detailed information about a specific user
 */
router.get('/users/:id', async (req: Request, res: Response) => {
	try {
		const userId = req.params.id;
		const user = await getUserById(userId);

		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}

		res.json({ user });
	} catch (error: any) {
		console.error('[Admin] Failed to fetch user:', error.message);
		res.status(500).json({ error: 'Failed to fetch user details' });
	}
});

/**
 * PATCH /api/admin/users/:id/plan
 * Update a user's subscription plan
 */
router.patch('/users/:id/plan', async (req: Request, res: Response) => {
	try {
		const userId = req.params.id;
		const { plan } = req.body;

		if (!['free', 'basic', 'pro', 'enterprise'].includes(plan)) {
			res.status(400).json({ error: 'Invalid plan. Must be free, basic, pro, or enterprise.' });
			return;
		}

		const adminReq = req as AdminRequest;
		console.log(`[Admin] User ${adminReq.adminUser?.email} changing plan for ${userId} to ${plan}`);

		const updatedUser = await updateUserPlan(userId, plan as PlanTier);

		if (!updatedUser) {
			res.status(404).json({ error: 'User not found' });
			return;
		}

		res.json({
			message: `Successfully updated user plan to ${plan}`,
			user: updatedUser,
		});
	} catch (error: any) {
		console.error('[Admin] Failed to update user plan:', error.message);
		res.status(500).json({ error: 'Failed to update user plan' });
	}
});

/**
 * POST /api/admin/users/:id/ban
 * Ban or unban a user
 */
router.post('/users/:id/ban', async (req: Request, res: Response) => {
	try {
		const userId = req.params.id;
		const { banned } = req.body;

		if (typeof banned !== 'boolean') {
			res.status(400).json({ error: 'banned field must be a boolean' });
			return;
		}

		const adminReq = req as AdminRequest;
		console.log(`[Admin] User ${adminReq.adminUser?.email} ${banned ? 'banning' : 'unbanning'} user ${userId}`);

		const updatedUser = await banUser(userId, banned);

		if (!updatedUser) {
			res.status(404).json({ error: 'User not found' });
			return;
		}

		res.json({
			message: `User ${banned ? 'banned' : 'unbanned'} successfully`,
			user: updatedUser,
		});
	} catch (error: any) {
		console.error('[Admin] Failed to ban/unban user:', error.message);
		res.status(500).json({ error: 'Failed to ban/unban user' });
	}
});

/**
 * GET /api/admin/stats
 * Get platform-wide statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
	try {
		const stats = await getPlatformStats();
		res.json(stats);
	} catch (error: any) {
		console.error('[Admin] Failed to fetch stats:', error.message);
		res.status(500).json({ error: 'Failed to fetch platform statistics' });
	}
});

/**
 * GET /api/admin/analytics
 * Get detailed usage analytics
 */
router.get('/analytics', async (_req: Request, res: Response) => {
	try {
		const analytics = await getUsageAnalytics();
		res.json(analytics);
	} catch (error: any) {
		console.error('[Admin] Failed to fetch analytics:', error.message);
		res.status(500).json({ error: 'Failed to fetch analytics' });
	}
});

export default router;

import { getPool, isDBConnected } from '../services/database';
import { PlanTier } from '../../shared/constants/planLimits';

export interface AdminUserRecord {
	userId: string;
	email: string;
	plan: PlanTier;
	subscriptionStatus: string;
	billingMonth: string;
	voiceMinutesUsed: number;
	chatMessagesUsed: number;
	sessionsUsed: number;
	createdAt: Date;
	updatedAt: Date;
	isBanned: boolean;
	clerkEnv: string | null;
}

export interface PaginatedUsers {
	users: AdminUserRecord[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

export interface PlatformStats {
	totalUsers: number;
	activeSubscriptions: number;
	revenueThisMonth: number;
	usageThisMonth: {
		voiceMinutes: number;
		chatMessages: number;
		sessions: number;
	};
	recentSignups: AdminUserRecord[];
	planDistribution: Record<string, number>;
}

export interface UsageAnalytics {
	userGrowth: Array<{ date: string; count: number }>;
	revenueByMonth: Array<{ month: string; revenue: number }>;
	usageByPlan: Array<{ plan: string; voiceMinutes: number; chatMessages: number; sessions: number }>;
	topUsersByUsage: AdminUserRecord[];
	dailyActiveUsers: Array<{ date: string; count: number }>;
}

function pgRowToAdminUser(row: any): AdminUserRecord {
	return {
		userId: row.clerk_user_id,
		email: row.email || '',
		plan: row.plan as PlanTier,
		subscriptionStatus: row.subscription_status || 'trial',
		billingMonth: row.billing_month || '',
		voiceMinutesUsed: row.voice_minutes_used || 0,
		chatMessagesUsed: row.chat_messages_used || 0,
		sessionsUsed: row.sessions_used || 0,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at || row.created_at),
		isBanned: row.is_banned || false,
		clerkEnv: row.clerk_env || null,
	};
}

export async function getAllUsers(options: {
	page?: number;
	limit?: number;
	search?: string;
	plan?: PlanTier | 'all';
	status?: string;
	sortBy?: string;
	sortOrder?: 'asc' | 'desc';
}): Promise<PaginatedUsers> {
	if (!isDBConnected()) {
		return { users: [], total: 0, page: 1, limit: 10, totalPages: 0 };
	}

	const pool = getPool()!;
	const page = Math.max(1, options.page || 1);
	const limit = Math.min(100, Math.max(1, options.limit || 10));
	const offset = (page - 1) * limit;
	const sortBy = options.sortBy || 'created_at';
	const sortOrder = options.sortOrder === 'asc' ? 'ASC' : 'DESC';

	let whereConditions: string[] = [];
	let params: any[] = [];
	let paramIdx = 1;

	if (options.search) {
		whereConditions.push(`(email ILIKE $${paramIdx} OR clerk_user_id ILIKE $${paramIdx})`);
		params.push(`%${options.search}%`);
		paramIdx++;
	}

	if (options.plan && options.plan !== 'all') {
		whereConditions.push(`plan = $${paramIdx}`);
		params.push(options.plan);
		paramIdx++;
	}

	if (options.status && options.status !== 'all') {
		whereConditions.push(`subscription_status = $${paramIdx}`);
		params.push(options.status);
		paramIdx++;
	}

	const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

	const validSortColumns: Record<string, string> = {
		created_at: 'created_at',
		email: 'email',
		plan: 'plan',
		voice_minutes_used: 'voice_minutes_used',
		chat_messages_used: 'chat_messages_used',
		sessions_used: 'sessions_used',
	};
	const sortColumn = validSortColumns[sortBy] || 'created_at';

	const countQuery = `SELECT COUNT(*) as total FROM ig_users ${whereClause}`;
	const countResult = await pool.query(countQuery, params);
	const total = parseInt(countResult.rows[0]?.total || '0', 10);

	const dataQuery = `
		SELECT clerk_user_id, email, plan, subscription_status, billing_month,
		       voice_minutes_used, chat_messages_used, sessions_used,
		       created_at, updated_at, is_banned, clerk_env
		FROM ig_users
		${whereClause}
		ORDER BY ${sortColumn} ${sortOrder}
		LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
	`;
	params.push(limit, offset);

	const result = await pool.query(dataQuery, params);
	const users = result.rows.map(pgRowToAdminUser);

	return {
		users,
		total,
		page,
		limit,
		totalPages: Math.ceil(total / limit),
	};
}

export async function getUserById(userId: string): Promise<AdminUserRecord | null> {
	if (!isDBConnected()) {
		return null;
	}

	const pool = getPool()!;
	const result = await pool.query(
		`SELECT clerk_user_id, email, plan, subscription_status, billing_month,
		        voice_minutes_used, chat_messages_used, sessions_used,
		        created_at, updated_at, is_banned, clerk_env
		 FROM ig_users WHERE clerk_user_id = $1`,
		[userId]
	);

	if (result.rows.length === 0) return null;
	return pgRowToAdminUser(result.rows[0]);
}

export async function updateUserPlan(userId: string, newPlan: PlanTier): Promise<AdminUserRecord | null> {
	if (!isDBConnected()) {
		return null;
	}

	const pool = getPool()!;
	await pool.query(
		`UPDATE ig_users SET
		   plan = $2,
		   subscription_status = CASE WHEN $2::text = 'free' THEN 'trial' ELSE 'active' END,
		   updated_at = NOW()
		 WHERE clerk_user_id = $1`,
		[userId, newPlan]
	);

	return getUserById(userId);
}

export async function banUser(userId: string, banned: boolean): Promise<AdminUserRecord | null> {
	if (!isDBConnected()) {
		return null;
	}

	const pool = getPool()!;
	await pool.query(
		`UPDATE ig_users SET is_banned = $2, updated_at = NOW() WHERE clerk_user_id = $1`,
		[userId, banned]
	);

	return getUserById(userId);
}

export async function getPlatformStats(): Promise<PlatformStats> {
	if (!isDBConnected()) {
		return {
			totalUsers: 0,
			activeSubscriptions: 0,
			revenueThisMonth: 0,
			usageThisMonth: { voiceMinutes: 0, chatMessages: 0, sessions: 0 },
			recentSignups: [],
			planDistribution: {},
		};
	}

	const pool = getPool()!;
	const currentMonth = new Date().toISOString().slice(0, 7);

	const totalUsersResult = await pool.query(`SELECT COUNT(*) as count FROM ig_users`);
	const totalUsers = parseInt(totalUsersResult.rows[0]?.count || '0', 10);

	const activeSubsResult = await pool.query(
		`SELECT COUNT(*) as count FROM ig_users WHERE subscription_status = 'active' AND plan != 'free'`
	);
	const activeSubscriptions = parseInt(activeSubsResult.rows[0]?.count || '0', 10);

	const planPricing: Record<string, number> = {
		free: 0,
		basic: 9.99,
		pro: 29.99,
		enterprise: 99.99,
	};

	const revenueResult = await pool.query(
		`SELECT plan, COUNT(*) as count FROM ig_users 
		 WHERE subscription_status = 'active' AND plan != 'free'
		 GROUP BY plan`
	);
	let revenueThisMonth = 0;
	for (const row of revenueResult.rows) {
		revenueThisMonth += (planPricing[row.plan] || 0) * parseInt(row.count, 10);
	}

	const usageResult = await pool.query(
		`SELECT 
		   SUM(voice_minutes_used) as voice_minutes,
		   SUM(chat_messages_used) as chat_messages,
		   SUM(sessions_used) as sessions
		 FROM ig_users WHERE billing_month = $1`,
		[currentMonth]
	);

	const usageThisMonth = {
		voiceMinutes: parseInt(usageResult.rows[0]?.voice_minutes || '0', 10),
		chatMessages: parseInt(usageResult.rows[0]?.chat_messages || '0', 10),
		sessions: parseInt(usageResult.rows[0]?.sessions || '0', 10),
	};

	const recentSignupsResult = await pool.query(
		`SELECT clerk_user_id, email, plan, subscription_status, billing_month,
		        voice_minutes_used, chat_messages_used, sessions_used,
		        created_at, updated_at, is_banned, clerk_env
		 FROM ig_users ORDER BY created_at DESC LIMIT 10`
	);
	const recentSignups = recentSignupsResult.rows.map(pgRowToAdminUser);

	const planDistributionResult = await pool.query(
		`SELECT plan, COUNT(*) as count FROM ig_users GROUP BY plan`
	);
	const planDistribution: Record<string, number> = {};
	for (const row of planDistributionResult.rows) {
		planDistribution[row.plan] = parseInt(row.count, 10);
	}

	return {
		totalUsers,
		activeSubscriptions,
		revenueThisMonth,
		usageThisMonth,
		recentSignups,
		planDistribution,
	};
}

export async function getUsageAnalytics(): Promise<UsageAnalytics> {
	if (!isDBConnected()) {
		return {
			userGrowth: [],
			revenueByMonth: [],
			usageByPlan: [],
			topUsersByUsage: [],
			dailyActiveUsers: [],
		};
	}

	const pool = getPool()!;

	const userGrowthResult = await pool.query(`
		SELECT DATE(created_at) as date, COUNT(*) as count
		FROM ig_users
		WHERE created_at > NOW() - INTERVAL '30 days'
		GROUP BY DATE(created_at)
		ORDER BY date ASC
	`);
	const userGrowth = userGrowthResult.rows.map((row: any) => ({
		date: row.date.toISOString().split('T')[0],
		count: parseInt(row.count, 10),
	}));

	const planPricing: Record<string, number> = {
		free: 0,
		basic: 9.99,
		pro: 29.99,
		enterprise: 99.99,
	};

	const revenueResult = await pool.query(`
		SELECT billing_month, plan, COUNT(*) as count
		FROM ig_users
		WHERE subscription_status = 'active' AND plan != 'free'
		GROUP BY billing_month, plan
		ORDER BY billing_month ASC
	`);

	const revenueByMonthMap: Record<string, number> = {};
	for (const row of revenueResult.rows) {
		const month = row.billing_month;
		if (!revenueByMonthMap[month]) revenueByMonthMap[month] = 0;
		revenueByMonthMap[month] += (planPricing[row.plan] || 0) * parseInt(row.count, 10);
	}
	const revenueByMonth = Object.entries(revenueByMonthMap)
		.map(([month, revenue]) => ({ month, revenue }))
		.slice(-12);

	const usageByPlanResult = await pool.query(`
		SELECT plan,
		       SUM(voice_minutes_used) as voice_minutes,
		       SUM(chat_messages_used) as chat_messages,
		       SUM(sessions_used) as sessions
		FROM ig_users
		GROUP BY plan
	`);
	const usageByPlan = usageByPlanResult.rows.map((row: any) => ({
		plan: row.plan,
		voiceMinutes: parseInt(row.voice_minutes || '0', 10),
		chatMessages: parseInt(row.chat_messages || '0', 10),
		sessions: parseInt(row.sessions || '0', 10),
	}));

	const topUsersResult = await pool.query(`
		SELECT clerk_user_id, email, plan, subscription_status, billing_month,
		       voice_minutes_used, chat_messages_used, sessions_used,
		       created_at, updated_at, is_banned, clerk_env
		FROM ig_users
		ORDER BY (voice_minutes_used + chat_messages_used + sessions_used) DESC
		LIMIT 10
	`);
	const topUsersByUsage = topUsersResult.rows.map(pgRowToAdminUser);

	const dailyActiveResult = await pool.query(`
		SELECT DATE(updated_at) as date, COUNT(*) as count
		FROM ig_users
		WHERE updated_at > NOW() - INTERVAL '30 days'
		GROUP BY DATE(updated_at)
		ORDER BY date ASC
	`);
	const dailyActiveUsers = dailyActiveResult.rows.map((row: any) => ({
		date: row.date.toISOString().split('T')[0],
		count: parseInt(row.count, 10),
	}));

	return {
		userGrowth,
		revenueByMonth,
		usageByPlan,
		topUsersByUsage,
		dailyActiveUsers,
	};
}

import { getPool, isDBConnected } from './database';

export interface AuditLogParams {
	userId?: string;
	action: string;
	resourceType: string;
	resourceId?: string;
	oldValues?: Record<string, unknown>;
	newValues?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
	ipAddress?: string;
	userAgent?: string;
}

/**
 * Create an audit log entry for tracking user actions and system events
 */
export async function createAuditLog(params: AuditLogParams): Promise<void> {
	if (!isDBConnected()) {
		console.log('[AuditLog] Skipping - database not connected');
		return;
	}

	const pool = getPool();
	if (!pool) return;

	try {
		await pool.query(
			`INSERT INTO ig_audit_logs (
				clerk_user_id, action, resource_type, resource_id,
				old_values, new_values, metadata, ip_address, user_agent
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet, $9)`,
			[
				params.userId || null,
				params.action,
				params.resourceType,
				params.resourceId || null,
				params.oldValues ? JSON.stringify(params.oldValues) : null,
				params.newValues ? JSON.stringify(params.newValues) : null,
				params.metadata ? JSON.stringify(params.metadata) : '{}',
				params.ipAddress || null,
				params.userAgent || null,
			]
		);
	} catch (error) {
		console.error('[AuditLog] Failed to create entry:', error);
	}
}

/**
 * Get audit logs for a specific user
 */
export async function getUserAuditLogs(
	userId: string,
	limit = 50,
	offset = 0
): Promise<any[]> {
	if (!isDBConnected()) return [];

	const pool = getPool();
	if (!pool) return [];

	const { rows } = await pool.query(
		`SELECT id, action, resource_type, resource_id, metadata, ip_address, user_agent, created_at
		 FROM ig_audit_logs
		 WHERE clerk_user_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`,
		[userId, limit, offset]
	);

	return rows;
}

/**
 * Get audit logs for a specific resource
 */
export async function getResourceAuditLogs(
	resourceType: string,
	resourceId: string,
	limit = 50
): Promise<any[]> {
	if (!isDBConnected()) return [];

	const pool = getPool();
	if (!pool) return [];

	const { rows } = await pool.query(
		`SELECT id, clerk_user_id, action, old_values, new_values, metadata, ip_address, created_at
		 FROM ig_audit_logs
		 WHERE resource_type = $1 AND resource_id = $2
		 ORDER BY created_at DESC
		 LIMIT $3`,
		[resourceType, resourceId, limit]
	);

	return rows;
}

/**
 * Get recent audit logs for admin dashboard
 */
export async function getRecentAuditLogs(limit = 100): Promise<any[]> {
	if (!isDBConnected()) return [];

	const pool = getPool();
	if (!pool) return [];

	const { rows } = await pool.query(
		`SELECT al.id, al.clerk_user_id, u.email, al.action, al.resource_type,
				al.resource_id, al.metadata, al.ip_address, al.created_at
		 FROM ig_audit_logs al
		 LEFT JOIN ig_users u ON u.clerk_user_id = al.clerk_user_id
		 ORDER BY al.created_at DESC
		 LIMIT $1`,
		[limit]
	);

	return rows;
}

/**
 * Common audit log actions
 */
export const AuditActions = {
	USER_CREATED: 'user.created',
	USER_UPDATED: 'user.updated',
	USER_DELETED: 'user.deleted',
	USER_LOGIN: 'user.login',
	USER_LOGOUT: 'user.logout',

	SUBSCRIPTION_CREATED: 'subscription.created',
	SUBSCRIPTION_UPDATED: 'subscription.updated',
	SUBSCRIPTION_CANCELLED: 'subscription.cancelled',

	PAYMENT_SUCCEEDED: 'payment.succeeded',
	PAYMENT_FAILED: 'payment.failed',
	PAYMENT_REFUNDED: 'payment.refunded',

	SESSION_STARTED: 'session.started',
	SESSION_ENDED: 'session.ended',

	API_KEY_CREATED: 'api_key.created',
	API_KEY_DELETED: 'api_key.deleted',
	API_KEY_USED: 'api_key.used',

	PLAN_UPGRADED: 'plan.upgraded',
	PLAN_DOWNGRADED: 'plan.downgraded',

	SETTINGS_UPDATED: 'settings.updated',
	FEATURE_FLAG_CHANGED: 'feature_flag.changed',

	ADMIN_ACTION: 'admin.action',
	WEBHOOK_RECEIVED: 'webhook.received',
	WEBHOOK_PROCESSED: 'webhook.processed',
	WEBHOOK_FAILED: 'webhook.failed',
} as const;

export type AuditAction = typeof AuditActions[keyof typeof AuditActions];

/**
 * Common resource types
 */
export const ResourceTypes = {
	USER: 'user',
	SUBSCRIPTION: 'subscription',
	PAYMENT: 'payment',
	SESSION: 'session',
	API_KEY: 'api_key',
	SETTINGS: 'settings',
	FEATURE_FLAG: 'feature_flag',
	WEBHOOK: 'webhook',
} as const;

export type ResourceType = typeof ResourceTypes[keyof typeof ResourceTypes];

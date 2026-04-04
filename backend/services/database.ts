import { Pool, type PoolConfig } from 'pg';
import { getDatabaseUrl, providerHintFromUrl } from '../config/database.config';

let pool: Pool | null = null;
let activeDatabaseUrlHost: string | null = null;

export function getPool(): Pool | null {
	return pool;
}

export function isDBConnected(): boolean {
	return pool !== null;
}

/** Schema is applied with `npm run db:migrate` (node-pg-migrate), not at runtime. */
async function assertSchemaPresent(client: Pool): Promise<void> {
	const r = await client.query<{ ok: boolean }>(
		`SELECT to_regclass('public.ig_users') IS NOT NULL AS ok`
	);
	if (!r.rows[0]?.ok) {
		console.warn(
			'[DB] Tables not found — run from repo root: npm run db:migrate (requires DATABASE_URL in backend/.env or env)'
		);
	}
}

function buildPoolConfig(connectionString: string): PoolConfig {
	const config: PoolConfig = {
		connectionString,
		max: process.env.VERCEL ? 4 : 12,
		idleTimeoutMillis: 20_000,
		connectionTimeoutMillis: 15_000,
	};

	if (process.env.DATABASE_SSL === 'false') {
		config.ssl = false;
	} else {
		config.ssl = { rejectUnauthorized: false };
	}

	return config;
}

export async function initializeDatabase(): Promise<void> {
	const connectionString = getDatabaseUrl();
	if (!connectionString) {
		console.warn('[DB] DATABASE_URL not set — usage quotas use in-memory storage (not suitable for production)');
		pool = null;
		activeDatabaseUrlHost = null;
		return;
	}

	const hint = providerHintFromUrl(connectionString);
	pool = new Pool(buildPoolConfig(connectionString));
	try {
		await assertSchemaPresent(pool);
		const r = await pool.query('SELECT 1 AS ok');
		if (r.rows[0]?.ok === 1) {
			try {
				const u = new URL(connectionString.replace(/^postgresql:\/\//i, 'http://'));
				activeDatabaseUrlHost = u.hostname || '(unknown)';
			} catch {
				activeDatabaseUrlHost = '(configured)';
			}
			console.log(`[DB] PostgreSQL connected (${hint}) host=${activeDatabaseUrlHost}`);
		}
	} catch (e) {
		console.error('[DB] Connection or migration failed:', e);
		await pool.end().catch(() => {});
		pool = null;
		activeDatabaseUrlHost = null;
		throw e;
	}
}

/** Hostname parsed from the winning URL (for logs/metrics only). */
export function getActiveDatabaseHost(): string | null {
	return activeDatabaseUrlHost;
}

export async function closeDatabase(): Promise<void> {
	if (pool) {
		await pool.end();
		pool = null;
	}
}

let initOnce: Promise<void> | null = null;

/**
 * Await once before handling traffic so `pool` is set (or init failed definitively).
 * Fixes Vercel/serverless races where `/api` ran before fire-and-forget `initializeDatabase` finished.
 */
export function waitForDatabase(): Promise<void> {
	if (!initOnce) {
		initOnce = initializeDatabase().catch((e) => {
			console.error('[DB] Initialization failed (continuing without Postgres):', e);
		});
	}
	return initOnce;
}

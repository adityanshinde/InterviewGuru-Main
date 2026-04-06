import { Pool, type PoolConfig } from 'pg';
import { getDatabaseUrl, providerHintFromUrl } from '../config/database.config';

let pool: Pool | null = null;
let activeDatabaseUrlHost: string | null = null;

/**
 * Neon URLs often include `channel_binding=require`; node-pg can fail fast (timeout / terminated).
 * Strip it — TLS is still used via Pool `ssl` config.
 */
export function sanitizePostgresUrlForNodePg(url: string): string {
	const q = url.indexOf('?');
	if (q === -1) return url;
	const base = url.slice(0, q);
	const params = new URLSearchParams(url.slice(q + 1));
	params.delete('channel_binding');
	const tail = params.toString();
	return tail ? `${base}?${tail}` : base;
}

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
	/** Neon compute wake + cross-region (e.g. Vercel ↔ ap-southeast-1) needs more than 15s sometimes. */
	const vercel = !!process.env.VERCEL;
	const config: PoolConfig = {
		connectionString,
		max: vercel ? 4 : 12,
		idleTimeoutMillis: 20_000,
		connectionTimeoutMillis: vercel ? 60_000 : 15_000,
	};

	if (process.env.DATABASE_SSL === 'false') {
		config.ssl = false;
	} else {
		config.ssl = { rejectUnauthorized: false };
	}

	return config;
}

function isTransientDbError(e: unknown): boolean {
	const msg = e instanceof Error ? `${e.message} ${(e as Error).cause ?? ''}` : String(e);
	return /timeout|terminated unexpectedly|ECONNRESET|EAI_AGAIN|ENETUNREACH/i.test(msg);
}

async function tryConnectOnce(sanitizedUrl: string): Promise<void> {
	const hint = providerHintFromUrl(sanitizedUrl);
	const p = new Pool(buildPoolConfig(sanitizedUrl));
	try {
		await assertSchemaPresent(p);
		const r = await p.query('SELECT 1 AS ok');
		if (r.rows[0]?.ok === 1) {
			try {
				const u = new URL(sanitizedUrl.replace(/^postgresql:\/\//i, 'http://'));
				activeDatabaseUrlHost = u.hostname || '(unknown)';
			} catch {
				activeDatabaseUrlHost = '(configured)';
			}
			console.log(`[DB] PostgreSQL connected (${hint}) host=${activeDatabaseUrlHost}`);
		}
		pool = p;
	} catch (e) {
		await p.end().catch(() => {});
		pool = null;
		activeDatabaseUrlHost = null;
		throw e;
	}
}

export async function initializeDatabase(): Promise<void> {
	const raw = getDatabaseUrl();
	if (!raw) {
		console.warn('[DB] DATABASE_URL not set — usage quotas use in-memory storage (not suitable for production)');
		pool = null;
		activeDatabaseUrlHost = null;
		return;
	}

	const connectionString = sanitizePostgresUrlForNodePg(raw.trim());
	if (connectionString !== raw.trim()) {
		console.log('[DB] Sanitized DATABASE_URL for node-pg (removed channel_binding)');
	}

	const maxAttempts = process.env.VERCEL ? 3 : 1;
	let lastErr: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			if (attempt > 1) {
				console.warn(`[DB] Retry connect attempt ${attempt}/${maxAttempts} (Neon/Vercel cold start)...`);
				await new Promise((r) => setTimeout(r, 2500 * (attempt - 1)));
			}
			await tryConnectOnce(connectionString);
			return;
		} catch (e) {
			lastErr = e;
			console.error('[DB] Connection or migration failed:', e);
			if (attempt < maxAttempts && isTransientDbError(e)) continue;
			throw lastErr;
		}
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

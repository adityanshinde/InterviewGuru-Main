/**
 * Postgres — single `DATABASE_URL` (env only, never commit secrets).
 *
 * **Migrations:** versioned SQL/JS in `backend/migrations/` via [node-pg-migrate](https://github.com/salsita/node-pg-migrate).
 * - Local / Neon: `npm run db:migrate` (loads `backend/.env` for `DATABASE_URL`).
 * - New change: `npm run db:migrate:create -- add_something_meaningful` then edit the new file under `backend/migrations/`.
 * - CI / Vercel: run `db:migrate` before `build` when `DATABASE_URL` is available (see docs).
 *
 * **Recommended provider for this app:** [Neon](https://neon.tech) — serverless Postgres,
 * pooler-friendly URLs, fits Vercel + `pg` well. You already use Clerk (not Supabase Auth),
 * so you only need a database; Neon keeps that scope tight.
 *
 * **Supabase Postgres** is also fine if you prefer it or want a DB in a specific region
 * (e.g. closer to APAC). Same `DATABASE_URL` — use the **pooler** URL on port 6543 for serverless.
 */

export type DatabaseProviderHint = 'supabase' | 'neon' | 'generic';

export function providerHintFromUrl(connectionString: string): DatabaseProviderHint {
	const u = connectionString.toLowerCase();
	if (u.includes('supabase')) return 'supabase';
	if (u.includes('neon.tech')) return 'neon';
	return 'generic';
}

export function getDatabaseUrl(): string | undefined {
	const url = process.env.DATABASE_URL?.trim();
	return url || undefined;
}

export function isDatabaseConfigured(): boolean {
	return !!getDatabaseUrl();
}

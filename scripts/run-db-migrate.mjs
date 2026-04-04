/**
 * Loads backend/.env then root .env, then runs node-pg-migrate with the same args.
 * Usage: node scripts/run-db-migrate.mjs up
 *        node scripts/run-db-migrate.mjs down
 *        node scripts/run-db-migrate.mjs create my_change_name
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, 'backend/.env') });
config({ path: resolve(root, '.env') });

if (!process.env.DATABASE_URL?.trim()) {
	console.error('DATABASE_URL is not set. Add it to backend/.env or .env in the repo root.');
	process.exit(1);
}

const passArgs = process.argv.slice(2);
const childArgs = ['node-pg-migrate', ...passArgs, '-m', 'backend/migrations'];
const r = spawnSync('npx', childArgs, {
	cwd: root,
	stdio: 'inherit',
	shell: true,
	env: process.env,
});
process.exit(r.status ?? 1);

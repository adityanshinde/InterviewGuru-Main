#!/usr/bin/env node
/**
 * Copies the env file that will be shipped inside the Windows installer / portable exe
 * (electron-builder extraResources → resources/.env). End users never add files manually.
 *
 * Source (first match):
 *   INTERVIEWGURU_PACKAGING_ENV = absolute or repo-relative path to an env file
 *   else backend/.env
 * (Output is always desktop/packaging/.env — do not read that file back as source, or builds would go stale.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'desktop', 'packaging');
const outFile = path.join(outDir, '.env');

const custom = process.env.INTERVIEWGURU_PACKAGING_ENV?.trim();
const candidates = [
	custom && path.isAbsolute(custom) ? custom : custom ? path.join(root, custom) : null,
	path.join(root, 'backend', '.env'),
].filter(Boolean);

let src = null;
for (const p of candidates) {
	if (p && fs.existsSync(p)) {
		src = p;
		break;
	}
}

if (!src) {
	console.error(
		'[packaging] No env file found. Do one of:\n' +
			'  • Create backend/.env (production keys for the desktop app), or\n' +
			'  • Create desktop/packaging/.env, or\n' +
			'  • Set INTERVIEWGURU_PACKAGING_ENV to an env file path\n' +
			'Need at least CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY (or VITE_CLERK_*), DATABASE_URL, and Groq/BYOK vars as on web.'
	);
	process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(src, outFile);
console.log('[packaging] Embedded for electron-builder:', path.relative(root, src), '→', path.relative(root, outFile));

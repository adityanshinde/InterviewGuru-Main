/**
 * Must be imported before any other local modules that read process.env at load time
 * (e.g. authMiddleware building clerkMiddleware).
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const apiDir =
	typeof __dirname !== 'undefined'
		? __dirname
		: path.dirname(fileURLToPath(import.meta.url));

dotenv.config();
dotenv.config({
	path: path.join(apiDir, '..', '..', 'frontend', '.env'),
	override: false,
});
dotenv.config({ path: path.join(apiDir, '..', '.env'), override: true });

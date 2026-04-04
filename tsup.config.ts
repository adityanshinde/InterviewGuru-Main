import { defineConfig } from 'tsup';

/** CJS bundle for Electron (`desktop/main/main.cjs`). Dev uses `tsx backend/api/server.ts`. */
export default defineConfig({
	entry: ['backend/api/server.ts'],
	format: ['cjs'],
	outDir: 'backend/api',
	platform: 'node',
	target: 'es2022',
	external: [
		'vite',
		'@vitejs/plugin-react',
		'@tailwindcss/vite',
		'lightningcss',
		'@clerk/express',
		'@clerk/backend',
		'pg',
	],
});

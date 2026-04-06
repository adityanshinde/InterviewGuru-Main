/**
 * Single source for which Clerk keys the Node process uses (JWT middleware + Clerk Backend API).
 * Must match the browser’s publishable key / instance (see frontend `resolveClerkPublishableKey`).
 */
export function clerkSecretKeyForNode(): string {
	const dev = process.env.CLERK_SECRET_KEY_DEV?.trim() || '';
	const main = process.env.CLERK_SECRET_KEY?.trim() || '';
	const nodeEnv = process.env.NODE_ENV || 'development';
	if (nodeEnv !== 'production' && dev) return dev;
	return main;
}

export function clerkPublishableKeyForNode(): string {
	const dev = process.env.VITE_CLERK_PUBLISHABLE_KEY_DEV?.trim() || '';
	const main =
		(process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY || '').trim();
	const nodeEnv = process.env.NODE_ENV || 'development';
	if (nodeEnv !== 'production' && dev) return dev;
	return main;
}

export type ClerkEnvironment = 'live' | 'test' | 'unknown';

function inferClerkEnvironmentFromKey(key: string): ClerkEnvironment {
	const trimmed = (key || '').trim();
	if (!trimmed) return 'unknown';
	if (trimmed.startsWith('sk_live_') || trimmed.startsWith('pk_live_')) return 'live';
	if (trimmed.startsWith('sk_test_') || trimmed.startsWith('pk_test_')) return 'test';
	return 'unknown';
}

/**
 * Returns the environment of the Clerk instance this Node process is currently configured to use.
 */
export function clerkEnvironmentForNode(): ClerkEnvironment {
	const fromSecret = inferClerkEnvironmentFromKey(clerkSecretKeyForNode());
	if (fromSecret !== 'unknown') return fromSecret;
	return inferClerkEnvironmentFromKey(clerkPublishableKeyForNode());
}

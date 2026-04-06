/**
 * Single place for which Clerk publishable key the UI uses (main.tsx + App routes).
 * Dev key can live in VITE_CLERK_PUBLISHABLE_KEY_DEV; App.tsx must not ignore it.
 */
export function clerkPublishableKeyMain(): string {
  return (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '').trim();
}

export function clerkPublishableKeyDev(): string {
  return (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_DEV || '').trim();
}

export function hasAnyClerkPublishableKey(): boolean {
  return !!(clerkPublishableKeyMain() || clerkPublishableKeyDev());
}

/**
 * Prefer *_DEV when Vite is in dev mode, or when running on localhost/127.0.0.1 so
 * Electron + Express middleware still picks pk_test even if DEV were mis-inlined.
 */
export function resolveClerkPublishableKey(): string {
  const main = clerkPublishableKeyMain();
  const dev = clerkPublishableKeyDev();
  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  const onLocal = host === 'localhost' || host === '127.0.0.1';
  const preferDev = !!dev && (import.meta.env.DEV || onLocal);
  return preferDev ? dev : main;
}

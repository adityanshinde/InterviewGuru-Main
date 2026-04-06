/**
 * Clerk rejects pk_live from http://localhost / 127.0.0.1 (Origin must match the production domain).
 * Surfaces that clearly so devs don't dig through Network → 400 responses.
 */
export default function ClerkProductionOnLocalhostBanner() {
  return (
    <div
      className="drag-region fixed left-0 right-0 top-0 z-[100000] border-b border-amber-500/40 bg-amber-950/95 px-4 py-2 text-center text-xs text-amber-100 shadow-lg backdrop-blur-sm"
      role="status"
    >
      <strong className="font-semibold">Clerk:</strong> Production keys (<code className="rounded bg-black/30 px-1">pk_live_…</code>) only work on your live domain (e.g.{' '}
      <code className="rounded bg-black/30 px-1">adhitya.me</code>), not on localhost. Add{' '}
      <code className="rounded bg-black/30 px-1">VITE_CLERK_PUBLISHABLE_KEY_DEV=pk_test_…</code> in{' '}
      <code className="rounded bg-black/30 px-1">frontend/.env</code> (dev mode picks it automatically), or load the packaged app against your deployed URL (
      <code className="rounded bg-black/30 px-1">INTERVIEWGURU_WEB_APP_URL</code>).
    </div>
  );
}

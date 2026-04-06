/**
 * Shown at /app when the UI was built without any Clerk publishable key.
 * Matches web + desktop: the assistant is never usable without Clerk in the bundle.
 */
export default function AppAuthConfigMissing() {
  const isElectron =
    typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);

  return (
    <div className="flex h-full min-h-[100dvh] w-full flex-col bg-[#070a12] text-center text-white">
      {isElectron && (
        <div className="drag-region z-30 h-9 w-full shrink-0 border-b border-white/5 bg-[#070a12]/90" aria-hidden />
      )}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="no-drag max-w-lg space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 ring-1 ring-amber-500/40">
          <span className="text-2xl" aria-hidden>
            ⚠
          </span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Authentication not included in this build</h1>
        <p className="text-sm leading-relaxed text-zinc-400">
          InterviewGuru requires Clerk for sign-in. Rebuild the app with{' '}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200">VITE_CLERK_PUBLISHABLE_KEY</code> (or{' '}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200">VITE_CLERK_PUBLISHABLE_KEY_DEV</code> for local dev){' '}
          set (same as your web deployment). The desktop .exe also needs{' '}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200">CLERK_SECRET_KEY</code> and{' '}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200">DATABASE_URL</code> in a{' '}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200">.env</code> file next to the
          executable or in app resources — see project docs.
        </p>
      </div>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { Lock, Sparkles } from 'lucide-react';
import { ModalSignInButton, ModalSignUpButton } from './ClerkModalAuthButtons';

/**
 * /app when Clerk is on and the user is signed out — same flow for web and desktop (Electron loads this bundle).
 */
export default function AppSignInGate() {
  const isElectron =
    typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);

  return (
    <div className="relative flex h-full min-h-[100dvh] w-full flex-col overflow-hidden bg-[#070a12] text-center text-white">
      {isElectron && (
        <div
          className="drag-region z-30 h-9 w-full shrink-0 border-b border-white/5 bg-[#070a12]/90"
          aria-hidden
        />
      )}
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(139, 92, 246, 0.35), transparent), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(59, 130, 246, 0.12), transparent)',
        }}
      />
      <div className="no-drag relative z-10 flex max-w-md flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/20 ring-1 ring-violet-400/30">
            <Lock className="h-8 w-8 text-violet-300" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in to continue</h1>
            <p className="text-sm leading-relaxed text-zinc-400">
              Same account as the website — your quota and plan stay in sync after you sign in.
            </p>
          </div>
        </div>

        {isElectron && (
          <p className="flex items-start gap-2 rounded-xl border border-zinc-700/80 bg-zinc-900/50 px-4 py-3 text-left text-xs text-zinc-400">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" aria-hidden />
            <span>
              Desktop dev loads <code className="rounded bg-zinc-800 px-1 py-0.5 text-[11px]">http://127.0.0.1</code>.
              Clerk <code className="rounded bg-zinc-800 px-1 py-0.5 text-[11px]">pk_live</code> keys only work on your
              live site — use <code className="rounded bg-zinc-800 px-1 py-0.5 text-[11px]">pk_test</code> in{' '}
              <code className="rounded bg-zinc-800 px-1 py-0.5 text-[11px]">frontend/.env</code> for local sign-in, or
              ship the app with your deployed web URL (Option A).
            </span>
          </p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          <ModalSignInButton>
            <button
              type="button"
              className="rounded-xl border border-zinc-600 bg-zinc-900/80 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:border-zinc-500 hover:bg-zinc-800"
            >
              Sign in
            </button>
          </ModalSignInButton>
          <ModalSignUpButton>
            <button
              type="button"
              className="rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/35 transition hover:bg-violet-500"
            >
              Create account
            </button>
          </ModalSignUpButton>
        </div>

        <Link
          to="/"
          className="text-sm text-zinc-500 underline-offset-4 transition hover:text-zinc-300 hover:underline"
        >
          ← Back to home
        </Link>
      </div>
      </div>
    </div>
  );
}
